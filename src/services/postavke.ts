import type { PrismaClient } from "@/generated/prisma/client";
import { procitajPrimatelje } from "@/domain/eposta";
import { NACINI_FISKALIZACIJE, type NacinFiskalizacije } from "@/domain/fiskalizacija";
import { jeIban } from "@/domain/hub3";
import { ucitajP12, type Certifikat } from "@/lib/fiskalizacija/certifikat";
import { provjeriOznakuProstora, provjeriOznakuUredaja } from "@/domain/numeracija";
import { GreskaKorisniku } from "@/lib/greske";
import { sifriraj } from "@/lib/tajne";
import { zapisiDnevnik } from "./dnevnik";
import { prijevozPoste } from "./eposta";
import type { Akter } from "./korisnici";

export type UlazPostavki = {
  adresa: string | null;
  postanskiBroj: string | null;
  mjesto: string | null;
  email: string | null;
  telefon: string | null;
  web: string | null;
  iban: string | null;
  banka: string | null;
  uSustavuPdv: boolean;
  pdvPoNaplacenoj: boolean;
  oznakaProstora: string;
  oznakaUredaja: string;
  rokPlacanjaDana: number;
  podnozje: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSigurno: boolean;
  smtpKorisnik: string | null;
  /** null = ne mijenja se; "" = obriši */
  smtpLozinka: string | null;
  epostaPosiljatelj: string | null;
  epostaKopija: string | null;
};

/** Postavke firme za dokumente i e-poštu. Izdani dokumenti ih pamte pa se promjena odnosi samo na nove. */
export async function spremiPostavkeFirme(db: PrismaClient, akter: Akter, u: UlazPostavki): Promise<Record<string, string>> {
  const polja: Record<string, string> = {};
  if (u.iban && !jeIban(u.iban)) polja["iban"] = "IBAN nije ispravan (kontrolni broj).";
  const op = provjeriOznakuProstora(u.oznakaProstora);
  if (op) polja["oznakaProstora"] = op;
  const ou = provjeriOznakuUredaja(u.oznakaUredaja);
  if (ou) polja["oznakaUredaja"] = ou;
  if (!Number.isInteger(u.rokPlacanjaDana) || u.rokPlacanjaDana < 0 || u.rokPlacanjaDana > 365)
    polja["rokPlacanjaDana"] = "Rok plaćanja: 0–365 dana.";
  for (const k of ["email", "epostaPosiljatelj", "epostaKopija"] as const) {
    if (u[k] && !procitajPrimatelje(u[k]).ok) polja[k] = "E-pošta nije ispravna.";
  }
  if (u.smtpPort !== null && (!Number.isInteger(u.smtpPort) || u.smtpPort < 1 || u.smtpPort > 65535)) polja["smtpPort"] = "Port: 1–65535.";
  if (Object.keys(polja).length) return polja;

  await db.$transaction(async (tx) => {
    const stara = await tx.firma.findUniqueOrThrow({ where: { id: akter.firmaId } });
    const { smtpLozinka, ...ostalo } = u;
    const nova = {
      ...ostalo,
      iban: u.iban ? u.iban.replace(/\s+/g, "").toUpperCase() : null,
      ...(smtpLozinka === null ? {} : { smtpLozinka: smtpLozinka === "" ? null : sifriraj(smtpLozinka) }),
    };
    await tx.firma.update({ where: { id: akter.firmaId }, data: nova });
    const bez = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => k in ostalo));
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "postavke.spremi",
      entitet: "Firma",
      entitetId: akter.firmaId,
      opis: `Postavke firme${smtpLozinka !== null ? " (i lozinka pošte)" : ""}`,
      staro: bez(stara as unknown as Record<string, unknown>),
      novo: bez(nova as unknown as Record<string, unknown>),
    });
  });
  return {};
}

/** Probna poruka na e-poštu prijavljenog korisnika — provjera SMTP postavki. */
export async function probnaPoruka(db: PrismaClient, akter: Akter): Promise<void> {
  const firma = await db.firma.findUniqueOrThrow({ where: { id: akter.firmaId } });
  const prijevoz = prijevozPoste(firma);
  if (!prijevoz) throw new GreskaKorisniku("Upišite poslužitelj pošte (SMTP) i spremite postavke.");
  const k = await db.korisnik.findUniqueOrThrow({ where: { id: akter.korisnikId }, select: { email: true } });
  try {
    await prijevoz.sendMail({
      from: firma.epostaPosiljatelj ? { name: firma.naziv, address: firma.epostaPosiljatelj } : (firma.smtpKorisnik ?? undefined),
      to: k.email,
      subject: `Probna poruka — ${firma.naziv}`,
      text: "Postavke pošte u ERP-WMS-u rade.",
    });
  } catch (e) {
    throw new GreskaKorisniku(`Slanje nije uspjelo: ${(e as Error).message.slice(0, 300)}`);
  }
}

export type UlazFiskalizacije = {
  nacin: string;
  /** novi certifikat (.p12) s lozinkom; null = ne mijenja se */
  certifikat: { sadrzaj: Buffer; lozinka: string } | null;
};

/** Način fiskalizacije i FINA certifikat (šifriran u bazi; lozinka se nikad ne vraća pregledniku ni u dnevnik). */
export async function spremiFiskalizaciju(db: PrismaClient, akter: Akter, u: UlazFiskalizacije): Promise<Record<string, string>> {
  if (!(u.nacin in NACINI_FISKALIZACIJE)) return { fiskalNacin: "Nepoznat način fiskalizacije." };
  let cert: Certifikat | null = null;
  if (u.certifikat) {
    if (u.certifikat.sadrzaj.length > 100_000) return { certifikat: "Datoteka certifikata je prevelika." };
    try {
      cert = ucitajP12(u.certifikat.sadrzaj, u.certifikat.lozinka);
    } catch {
      return { certifikat: "Certifikat se ne može otvoriti — provjerite datoteku (.p12) i lozinku." };
    }
    if (cert.vrijediDo.getTime() < Date.now()) return { certifikat: `Certifikat je istekao ${cert.vrijediDo.toLocaleDateString("hr-HR")}.` };
  }
  await db.$transaction(async (tx) => {
    const stara = await tx.firma.findUniqueOrThrow({ where: { id: akter.firmaId } });
    if ((u.nacin === "TEST" || u.nacin === "PRODUKCIJA") && !cert && !stara.fiskalCertifikat)
      throw new GreskaKorisniku("Za testni CIS i produkciju učitajte certifikat.");
    await tx.firma.update({
      where: { id: akter.firmaId },
      data: {
        fiskalNacin: u.nacin,
        ...(cert && u.certifikat
          ? {
              fiskalCertifikat: sifriraj(u.certifikat.sadrzaj.toString("base64")),
              fiskalLozinka: sifriraj(u.certifikat.lozinka),
              fiskalCertNaziv: cert.naziv,
              fiskalCertVrijedi: cert.vrijediDo,
            }
          : {}),
      },
    });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "postavke.fiskalizacija",
      entitet: "Firma",
      entitetId: akter.firmaId,
      opis: `Fiskalizacija: ${NACINI_FISKALIZACIJE[u.nacin as NacinFiskalizacije]}${cert ? ` (novi certifikat: ${cert.naziv})` : ""}`,
      staro: { fiskalNacin: stara.fiskalNacin, certifikat: stara.fiskalCertNaziv },
      novo: { fiskalNacin: u.nacin, certifikat: cert?.naziv ?? stara.fiskalCertNaziv },
    });
  });
  return {};
}
