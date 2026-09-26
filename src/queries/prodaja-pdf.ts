import { qrProvjere } from "@/domain/fiskalizacija";
import { jeUuid } from "@/domain/id";
import { hub3Tekst, jeIban, pozivNaBrojRacuna } from "@/domain/hub3";
import { centiIzDecimala, formatirajIznos } from "@/domain/novac";
import { izracunaj, type KodKategorije } from "@/domain/pdv";
import { formatirajKolicinu, NACINI_PLACANJA, VRSTE_PRODAJE, type VrstaProdaje } from "@/domain/prodaja";
import type { DbFirme } from "@/lib/firma-db";
import type { PodaciPdf } from "@/lib/pdf-dokumenta";

const datum = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeZone: "UTC" });
const vrijeme = new Intl.DateTimeFormat("hr-HR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zagreb" });
const eur = (c: number) => `${formatirajIznos(c)} €`;
const NAZIVI_KATEGORIJA: Record<KodKategorije, string> = {
  HR: "PDV",
  EU_ROBA: "isporuka u EU",
  EU_USLUGA: "prijenos porezne obveze",
  IZVOZ: "izvoz",
  TRECE_USLUGA: "usluga izvan EU",
  NIJE_U_SUSTAVU: "nije u sustavu PDV-a",
};

type Snimka = {
  firma?: {
    naziv: string;
    oib: string;
    adresa: string | null;
    postanskiBroj: string | null;
    mjesto: string | null;
    email: string | null;
    telefon: string | null;
    web: string | null;
    iban: string | null;
    banka: string | null;
    podnozje: string | null;
  };
  kupac?: {
    naziv: string;
    oib: string | null;
    pdvBroj: string | null;
    adresa: string | null;
    postanskiBroj: string | null;
    mjesto: string | null;
  } | null;
  poslovnica?: { naziv: string } | null;
  napomene?: string[];
  racun?: { oznakaProstora: string; oznakaUredaja: string; nacinPlacanja: string; operater: string };
  stornoRacuna?: string;
};

const adresa = (x: { adresa: string | null; postanskiBroj: string | null; mjesto: string | null }) =>
  [x.adresa, [x.postanskiBroj, x.mjesto].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/** Podaci za PDF: izdani dokument iz snimke (kako je izdan), nacrt iz trenutnih podataka. */
export async function podaciZaPdf(db: DbFirme, firmaId: string, id: string): Promise<{ podaci: PodaciPdf; datoteka: string } | null> {
  if (!jeUuid(id)) return null;
  const d = await db.prodajniDokument.findFirst({
    where: { firmaId, id },
    include: {
      stavke: { orderBy: { redoslijed: "asc" } },
      partner: { select: { naziv: true, oib: true, pdvBroj: true, adresa: true, postanskiBroj: true, mjesto: true } },
      poslovnica: { select: { naziv: true } },
    },
  });
  if (!d) return null;
  const nacrt = d.status === "NACRT";
  const s = (nacrt ? {} : ((d.snimka as Snimka | null) ?? {})) as Snimka;
  const firmaUzivo = await db.firma.findUniqueOrThrow({ where: { id: firmaId } });
  const f = s.firma ?? firmaUzivo;
  const kupac = s.kupac !== undefined ? s.kupac : d.partner;
  const izvor = d.izvorId ? await db.prodajniDokument.findFirst({ where: { firmaId, id: d.izvorId }, select: { broj: true } }) : null;
  const jeRacun = ["RACUN", "PREDUJAM", "STORNO", "ODOBRENJE"].includes(d.vrsta);
  const naslov = VRSTE_PRODAJE[d.vrsta as VrstaProdaje]?.naziv ?? d.vrsta;
  const ukupno = centiIzDecimala(d.ukupno.toFixed(2));

  const podaci: [string, string][] = [["Datum", datum.format(d.datum)]];
  if (jeRacun && d.izdano) podaci.push(["Vrijeme izdavanja", vrijeme.format(d.izdano)]);
  if (d.vrijediDo) podaci.push(["Vrijedi do", datum.format(d.vrijediDo)]);
  if (d.dospijece && d.vrsta !== "PONUDA") podaci.push(["Dospijeće", datum.format(d.dospijece)]);
  if (jeRacun) podaci.push(["Način plaćanja", NACINI_PLACANJA[s.racun?.nacinPlacanja ?? d.nacinPlacanja] ?? d.nacinPlacanja]);
  if (s.racun) podaci.push(["Prostor / uređaj", `${s.racun.oznakaProstora} / ${s.racun.oznakaUredaja}`], ["Operater", s.racun.operater]);
  if (izvor?.broj && (d.vrsta === "STORNO" || d.vrsta === "ODOBRENJE")) podaci.push(["Za račun", izvor.broj]);
  if (d.zki) podaci.push(["ZKI", d.zki]);
  if (d.jir) podaci.push(["JIR", d.jir]);
  const poziv = d.redni && d.godina ? pozivNaBrojRacuna(d.redni, d.godina) : null;
  if (poziv && ukupno > 0 && d.vrsta !== "PONUDA") podaci.push(["Poziv na broj", `HR00 ${poziv}`]);

  const z = izracunaj(
    d.stavke.map((x) => ({
      kolicina: x.kolicina,
      cijena: centiIzDecimala(x.cijena.toFixed(2)),
      popust: x.popust,
      kategorija: { kod: x.kategorija as KodKategorije, stopa: x.stopa },
      bezPopustaDokumenta: x.vrsta === "PREDUJAM",
    })),
    d.popust,
  );
  const zbrojevi: [string, string][] = [];
  if (z.popust) zbrojevi.push(["Popust", eur(-z.popust)]);
  for (const k of z.poKategoriji) {
    const ime = k.kod === "HR" ? `${k.stopa / 100} %` : NAZIVI_KATEGORIJA[k.kod];
    zbrojevi.push([`Osnovica (${ime})`, eur(k.osnovica)]);
    if (k.kod === "HR" && k.stopa > 0) zbrojevi.push([`PDV ${k.stopa / 100} %`, eur(k.pdv)]);
  }
  const zaPlatiti: [string, string] = [jeRacun && ukupno > 0 ? "Ukupno za platiti" : "Ukupno", eur(ukupno)];

  const iban = f.iban?.replace(/\s+/g, "") ?? null;
  const hub3 =
    !nacrt && ukupno > 0 && ["RACUN", "PREDUJAM", "PREDRACUN"].includes(d.vrsta) && iban && jeIban(iban)
      ? hub3Tekst({
          iznos: ukupno,
          platitelj: {
            naziv: kupac?.naziv ?? "",
            adresa: kupac?.adresa ?? "",
            mjesto: [kupac?.postanskiBroj, kupac?.mjesto].filter(Boolean).join(" "),
          },
          primatelj: { naziv: f.naziv, adresa: f.adresa ?? "", mjesto: [f.postanskiBroj, f.mjesto].filter(Boolean).join(" ") },
          iban,
          model: "HR00",
          pozivNaBroj: poziv ?? "",
          sifraNamjene: "OTHR",
          opis: `${naslov} ${d.broj ?? ""}`.trim(),
        })
      : null;

  return {
    datoteka: `${naslov.replace(/\s+/g, "-")}-${(d.broj ?? "nacrt").replace(/\//g, "-")}.pdf`,
    podaci: {
      naslov,
      broj: d.broj,
      nacrt,
      firma: {
        naziv: f.naziv,
        oib: f.oib,
        adresa: adresa(f),
        iban: f.iban,
        banka: f.banka,
        kontakt: [f.telefon, f.email, f.web].filter(Boolean).join(" · "),
      },
      kupac: kupac ? { naziv: kupac.naziv, adresa: adresa(kupac), oib: kupac.oib, pdvBroj: kupac.pdvBroj } : null,
      poslovnica: (s.poslovnica ?? d.poslovnica)?.naziv ?? null,
      podaci,
      stavke: d.stavke.map((x, i) => ({
        rb: String(i + 1),
        naziv: x.naziv + (x.namjena === "NAJAM" ? " (najam)" : ""),
        opis: [x.opis, x.kpd ? `KPD ${x.kpd}` : null].filter(Boolean).join(" · ") || null,
        kolicina: `${formatirajKolicinu(x.kolicina)} ${x.jedinica}`,
        cijena: formatirajIznos(centiIzDecimala(x.cijena.toFixed(2))),
        popust: x.popust ? `${formatirajIznos(x.popust)} %` : "",
        pdv: x.kategorija === "HR" ? `${x.stopa / 100} %` : "—",
        iznos: formatirajIznos(centiIzDecimala(x.iznos.toFixed(2))),
      })),
      zbrojevi,
      zaPlatiti,
      napomene: s.napomene ?? [],
      napomena: d.napomena,
      podnozje: f.podnozje,
      hub3,
      qr: d.zki && d.izdano ? qrProvjere({ jir: d.jir, zki: d.zki, vrijeme: d.izdano, ukupno }) : null,
    },
  };
}
