import nodemailer from "nodemailer";
import type { PrismaClient } from "@/generated/prisma/client";
import { procitajPrimatelje, VRSTE_PORUKA } from "@/domain/eposta";
import { jeUuid } from "@/domain/id";
import { GreskaKorisniku } from "@/lib/greske";
import { sFirmom } from "@/lib/firma-db";
import { pdfDokumenta } from "@/lib/pdf-dokumenta";
import { desifriraj } from "@/lib/tajne";
import { podaciZaPdf } from "@/queries/prodaja-pdf";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";

export type Poruka = { vrsta: string; prima: string; predmet: string; tijelo: string };

/** Prijevoz pošte: SMTP firme; EPOSTA_NACIN=test → poruka se ne šalje nikamo (testovi, demo). */
export function prijevozPoste(firma: {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSigurno: boolean;
  smtpKorisnik: string | null;
  smtpLozinka: string | null;
}) {
  if (process.env["EPOSTA_NACIN"] === "test") return nodemailer.createTransport({ jsonTransport: true });
  if (!firma.smtpHost) return null;
  const lozinka = firma.smtpLozinka ? desifriraj(firma.smtpLozinka) : "";
  if (lozinka === null)
    throw new GreskaKorisniku("Spremljena lozinka pošte ne može se pročitati (promijenjen TAJNI_KLJUC?) — upišite je ponovno u Postavkama.");
  return nodemailer.createTransport({
    host: firma.smtpHost,
    port: firma.smtpPort ?? (firma.smtpSigurno ? 465 : 587),
    secure: firma.smtpSigurno && (firma.smtpPort ?? 465) === 465,
    requireTLS: firma.smtpSigurno,
    auth: firma.smtpKorisnik ? { user: firma.smtpKorisnik, pass: lozinka } : undefined,
    connectionTimeout: 15_000,
  });
}

function provjeri(p: Poruka) {
  if (!Object.hasOwn(VRSTE_PORUKA, p.vrsta)) throw new GreskaKorisniku("Nepoznata vrsta poruke.");
  const prima = procitajPrimatelje(p.prima);
  if (!prima.ok) throw new GreskaKorisniku(prima.greska);
  if (!p.predmet.trim() || p.predmet.length > 200) throw new GreskaKorisniku("Upišite predmet (najviše 200 znakova).");
  if (p.tijelo.length > 20_000) throw new GreskaKorisniku("Tekst poruke je predug.");
  return prima.vrijednost;
}

/** Šalje dokument kao PDF u privitku. Ishod (poslano ili greška poslužitelja pošte) uvijek se zapisuje. */
export async function posaljiDokument(
  db: PrismaClient,
  akter: Akter,
  dokumentId: string,
  p: Poruka,
): Promise<{ poslano: boolean; greska: string | null }> {
  if (!jeUuid(dokumentId)) throw new GreskaKorisniku("Dokument ne postoji.");
  const prima = provjeri(p);
  const firma = await db.firma.findUniqueOrThrow({ where: { id: akter.firmaId } });
  const prijevoz = prijevozPoste(firma);
  if (!prijevoz)
    throw new GreskaKorisniku("Poslužitelj pošte (SMTP) nije postavljen — koristite „Otvori u programu za poštu“ ili ga postavite u Postavkama.");
  const pdf = await podaciZaPdf(sFirmom(db, akter.firmaId), akter.firmaId, dokumentId);
  if (!pdf) throw new GreskaKorisniku("Dokument ne postoji.");
  if (pdf.podaci.nacrt) throw new GreskaKorisniku("Nacrt se ne šalje — prvo izdajte dokument.");
  let greska: string | null = null;
  try {
    await prijevoz.sendMail({
      from: firma.epostaPosiljatelj ? { name: firma.naziv, address: firma.epostaPosiljatelj } : (firma.smtpKorisnik ?? undefined),
      to: prima,
      bcc: firma.epostaKopija ?? undefined,
      subject: p.predmet.trim(),
      text: p.tijelo,
      attachments: [{ filename: pdf.datoteka, content: await pdfDokumenta(pdf.podaci), contentType: "application/pdf" }],
    });
  } catch (e) {
    greska = (e as Error).message.slice(0, 500);
  }
  await zabiljezi(db, akter, dokumentId, p, prima, greska ? "GRESKA" : "POSLANO", greska);
  return { poslano: !greska, greska };
}

/** Bez SMTP-a: korisnik je otvorio poruku u svom programu za poštu (mailto) — bilježi se da se zna što je poslano. */
export async function zabiljeziMailto(db: PrismaClient, akter: Akter, dokumentId: string, p: Poruka): Promise<void> {
  if (!jeUuid(dokumentId)) throw new GreskaKorisniku("Dokument ne postoji.");
  const prima = provjeri(p);
  if (!(await db.prodajniDokument.count({ where: { id: dokumentId, firmaId: akter.firmaId } }))) throw new GreskaKorisniku("Dokument ne postoji.");
  await zabiljezi(db, akter, dokumentId, p, prima, "MAILTO", null);
}

async function zabiljezi(db: PrismaClient, akter: Akter, dokumentId: string, p: Poruka, prima: string[], status: string, greska: string | null) {
  await db.$transaction(async (tx) => {
    const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
    await tx.slanjeEposte.create({
      data: {
        firmaId: akter.firmaId,
        dokumentId,
        vrsta: p.vrsta,
        prima: prima.join(", "),
        predmet: p.predmet.trim(),
        status,
        greska,
        korisnikId: akter.korisnikId,
        korisnik: ime,
      },
    });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "eposta.slanje",
      entitet: "ProdajniDokument",
      entitetId: dokumentId,
      opis: `${status === "POSLANO" ? "Poslano e-poštom" : status === "MAILTO" ? "Otvoreno u programu za poštu" : "Slanje nije uspjelo"}: ${p.predmet.trim()} → ${prima.join(", ")}${greska ? ` (${greska})` : ""}`,
    });
  });
}
