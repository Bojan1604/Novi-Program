import { randomUUID } from "node:crypto";
import { vrstaBrojacaRacuna } from "@/domain/numeracija";
import { centiUDecimal } from "@/domain/novac";
import { izracunajDokument, type UlaznaStavka } from "@/domain/prodaja";
import { provjeriUvoz, type PodaciUvoza, type Poruka, type RacunUvoza } from "@/domain/uvoz";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { GreskaKorisniku } from "@/lib/greske";
import { zakljucajKljuc } from "@/lib/zakljucavanje";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";
import { dodajUredajeNaUgovor, oznaciNaplacenoDo, spremiUgovor } from "./najam";
import { statusKupca } from "./prodaja";

/**
 * Uvoz iz starog programa (korak 7.1). Dva koraka: `pripremiUvoz` (provjera + izvještaj razlika, ništa
 * ne piše) i `uvezi` (ponovna provjera, pa sve u jednoj transakciji; ugovori najma kroz servise najma).
 * Postojeći šifrarnici i partneri (isti naziv / OIB) se koriste, ne dupliciraju.
 */

const lc = (s: string) => s.toLowerCase();
const dan = (d: string) => new Date(`${d}T00:00:00Z`);

export type RazlikaRacuna = { broj: string; datum: string; stari: number; novi: number };
export type IzvjestajUvoza = {
  greske: Poruka[];
  upozorenja: Poruka[];
  brojevi: Record<string, number>;
  /** po godini: broj računa, zbroj starog programa i zbroj koji program izračuna (centi) */
  poGodinama: { godina: number; racuna: number; stari: number; novi: number; placeno: number }[];
  razlike: RazlikaRacuna[];
  /** nastavak numeracije: ključ brojača → sljedeći broj */
  numeracija: { niz: string; godina: number; sljedeci: number }[];
};

type PartnerZaPdv = { drzava: string; pdvBroj: string | null; pdvStatus: string | null };

function stavkeZaIzracun(r: RacunUvoza, uredaji?: Map<string, { id: string; modelId: string }>): UlaznaStavka[] {
  return r.stavke.map((s) => {
    const u = s.serijski ? uredaji?.get(s.serijski) : undefined;
    return u
      ? {
          vrsta: "UREDAJ",
          namjena: "PRODAJA",
          uredajId: u.id,
          modelId: u.modelId,
          naziv: s.naziv,
          kpd: s.kpd,
          jedinica: s.jedinica,
          kolicina: s.kolicina,
          cijena: s.cijena,
          popust: s.popust,
          stopa: s.stopa,
        }
      : {
          vrsta: "RUCNA",
          namjena: "PRODAJA",
          naziv: s.naziv,
          kpd: s.kpd,
          jedinica: s.jedinica,
          kolicina: s.kolicina,
          cijena: s.cijena,
          popust: s.popust,
          stopa: s.stopa,
          vrstaIsporuke: s.vrstaIsporuke,
        };
  });
}

async function postojeci(db: PrismaClient | Prisma.TransactionClient, firmaId: string, p: PodaciUvoza) {
  const [kategorije, proizvodjaci, skladista, modeli, usluge, partneri, uredaji, racuni, ugovori, firma] = await Promise.all([
    db.kategorija.findMany({ where: { firmaId }, select: { id: true, naziv: true } }),
    db.proizvodjac.findMany({ where: { firmaId }, select: { id: true, naziv: true } }),
    db.skladiste.findMany({ where: { firmaId }, orderBy: [{ zadano: "desc" }, { naziv: "asc" }], select: { id: true, naziv: true } }),
    db.modelUredaja.findMany({ where: { firmaId }, select: { id: true, naziv: true, sifra: true } }),
    db.usluga.findMany({ where: { firmaId }, select: { id: true, naziv: true } }),
    db.partner.findMany({
      where: { firmaId, oib: { in: p.partneri.map((x) => x.oib).filter((x): x is string => !!x) } },
      select: { id: true, oib: true, naziv: true, drzava: true, pdvBroj: true, pdvStatus: true },
    }),
    db.uredaj.findMany({ where: { firmaId, serijski: { in: p.uredaji.map((u) => u.serijski) } }, select: { serijski: true } }),
    db.prodajniDokument.findMany({
      where: { firmaId, vrsta: "RACUN", broj: { in: [...new Set(p.racuni.map((r) => r.broj))] } },
      select: { broj: true, godina: true },
    }),
    db.ugovorNajma.findMany({ where: { firmaId, broj: { in: p.ugovori.map((u) => u.broj) } }, select: { broj: true } }),
    db.firma.findUniqueOrThrow({ where: { id: firmaId } }),
  ]);
  return { kategorije, proizvodjaci, skladista, modeli, usluge, partneri, uredaji, racuni, ugovori, firma };
}

/** Provjera i izvještaj razlika — ne piše ništa. */
export async function pripremiUvoz(
  db: PrismaClient,
  firmaId: string,
  json: unknown,
  danas: string,
): Promise<IzvjestajUvoza & { podaci: PodaciUvoza }> {
  const { podaci: p, greske, upozorenja } = provjeriUvoz(json, danas);
  const b = await postojeci(db, firmaId, p);
  for (const u of b.uredaji) greske.push({ gdje: `uredaj ${u.serijski}`, poruka: `Serijski ${u.serijski} već postoji u programu.` });
  for (const r of b.racuni) {
    if (p.racuni.some((x) => x.broj === r.broj && Number(x.datum.slice(0, 4)) === r.godina))
      greske.push({ gdje: `racun ${r.broj}`, poruka: `Račun ${r.broj}/${r.godina}. već postoji u programu.` });
  }
  for (const u of b.ugovori) greske.push({ gdje: `ugovor ${u.broj}`, poruka: `Ugovor ${u.broj} već postoji u programu.` });
  const poOibu = new Map(b.partneri.map((x) => [x.oib!, x]));
  for (const x of p.partneri)
    if (x.oib && poOibu.has(x.oib))
      upozorenja.push({
        gdje: `partner ${x.sifra}`,
        poruka: `„${x.naziv}“ (OIB ${x.oib}) već postoji kao „${poOibu.get(x.oib)!.naziv}“ — koristi se postojeći.`,
      });
  if (!b.skladista.length && !p.skladista.length && p.uredaji.some((u) => u.stanje === "NA_SKLADISTU"))
    greske.push({ gdje: "skladista", poruka: "Nema nijednog skladišta za uređaje na skladištu." });

  // izvještaj razlika: iznos starog programa prema izračunu iz stavki
  const pdvPartnera = new Map<string, PartnerZaPdv>();
  for (const x of p.partneri) pdvPartnera.set(x.sifra, (x.oib && poOibu.get(x.oib)) || { drzava: x.drzava, pdvBroj: x.pdvBroj, pdvStatus: null });
  const razlike: RazlikaRacuna[] = [];
  const godine = new Map<number, { racuna: number; stari: number; novi: number; placeno: number }>();
  const numeracija = new Map<string, { niz: string; godina: number; sljedeci: number }>();
  for (const r of p.racuni) {
    const iz = izracunajDokument(stavkeZaIzracun(r), {
      firmaUSustavuPdv: b.firma.uSustavuPdv,
      pdvPoNaplacenoj: b.firma.pdvPoNaplacenoj,
      statusKupca: statusKupca(r.partner ? pdvPartnera.get(r.partner)! : null),
      popust: r.popust,
    });
    const novi = iz.zbrojevi.ukupno;
    const godina = Number(r.datum.slice(0, 4));
    const gd = godine.get(godina) ?? { racuna: 0, stari: 0, novi: 0, placeno: 0 };
    gd.racuna++;
    gd.stari += r.ukupno ?? novi;
    gd.novi += novi;
    gd.placeno += r.uplate.reduce((s, u) => s + u.iznos, 0);
    godine.set(godina, gd);
    if (r.ukupno !== null && r.ukupno !== novi) razlike.push({ broj: r.broj, datum: r.datum, stari: r.ukupno, novi });
    const niz = `${r.prostor}/${r.naplatniUredaj}`;
    const k = `${niz}:${godina}`;
    const n = numeracija.get(k) ?? { niz, godina, sljedeci: 1 };
    n.sljedeci = Math.max(n.sljedeci, r.redni + 1);
    numeracija.set(k, n);
  }
  for (const r of razlike)
    upozorenja.push({
      gdje: `racun ${r.broj}`,
      poruka: `Iznos starog računa ${(r.stari / 100).toFixed(2)} €, izračun iz stavki ${(r.novi / 100).toFixed(2)} €.`,
    });
  return {
    podaci: p,
    greske,
    upozorenja,
    brojevi: {
      kategorije: p.kategorije.filter((k) => !b.kategorije.some((x) => lc(x.naziv) === lc(k))).length,
      proizvodjaci: p.proizvodjaci.filter((k) => !b.proizvodjaci.some((x) => lc(x.naziv) === lc(k))).length,
      skladista: p.skladista.filter((k) => !b.skladista.some((x) => lc(x.naziv) === lc(k))).length,
      modeli: p.modeli.length,
      usluge: p.usluge.length,
      partneri: p.partneri.filter((x) => !(x.oib && poOibu.has(x.oib))).length,
      uredaji: p.uredaji.length,
      racuni: p.racuni.length,
      uplate: p.racuni.reduce((s, r) => s + r.uplate.length, 0),
      ugovoriNajma: p.ugovori.length,
    },
    poGodinama: [...godine.entries()].sort((a, c) => a[0] - c[0]).map(([godina, x]) => ({ godina, ...x })),
    razlike,
    numeracija: [...numeracija.values()].sort((a, c) => a.niz.localeCompare(c.niz) || a.godina - c.godina),
  };
}

async function uSerijama<T>(podaci: T[], zapisi: (serija: T[]) => Promise<unknown>, velicina = 1000) {
  for (let i = 0; i < podaci.length; i += velicina) await zapisi(podaci.slice(i, i + velicina));
}

/**
 * Uvoz. Greške u provjeri → ništa se ne uvozi. Ugovori najma idu nakon glavne transakcije kroz servise
 * najma (pravila stanja uređaja i rata); neuspjeli ugovor se prijavljuje, ostali se uvoze.
 */
export async function uvezi(db: PrismaClient, akter: Akter, json: unknown, danas: string): Promise<IzvjestajUvoza & { ugovoriGreske: Poruka[] }> {
  const iz = await pripremiUvoz(db, akter.firmaId, json, danas);
  if (iz.greske.length) throw new GreskaKorisniku(`Uvoz nije moguć: ${iz.greske.length} grešaka u datoteci (pokrenite provjeru).`);
  const p = iz.podaci;
  const f = akter.firmaId;
  const naUgovoru = new Set(p.ugovori.flatMap((u) => u.uredaji.map((x) => x.serijski)));

  await db.$transaction(
    async (tx) => {
      await zakljucajKljuc(tx, `uvoz:${f}`);
      const b = await postojeci(tx, f, p);
      if (b.uredaji.length || b.racuni.length || b.ugovori.length)
        throw new GreskaKorisniku("Podaci su se u međuvremenu promijenili — pokrenite provjeru ponovno.");
      const ime = (await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Uvoz";

      // šifrarnici (postojeći po nazivu)
      const poNazivu = async <T extends { id: string; naziv: string }>(
        postojeci: T[],
        novi: string[],
        stvori: (naziv: string) => Promise<{ id: string }>,
      ) => {
        const m = new Map(postojeci.map((x) => [lc(x.naziv), x.id]));
        for (const n of novi) if (!m.has(lc(n))) m.set(lc(n), (await stvori(n)).id);
        return m;
      };
      const kategorije = await poNazivu(b.kategorije, p.kategorije, (naziv) => tx.kategorija.create({ data: { firmaId: f, naziv } }));
      const proizvodjaci = await poNazivu(b.proizvodjaci, p.proizvodjaci, (naziv) => tx.proizvodjac.create({ data: { firmaId: f, naziv } }));
      const skladista = await poNazivu(b.skladista, p.skladista, (naziv) =>
        tx.skladiste.create({ data: { firmaId: f, naziv, zadano: b.skladista.length === 0 && naziv === p.skladista[0] } }),
      );
      const zadanoSkladiste = b.skladista[0]?.id ?? skladista.get(lc(p.skladista[0] ?? ""))!;

      const modeli = new Map<string, string>();
      for (const m of p.modeli) {
        const postoji = b.modeli.find((x) => (x.sifra && lc(x.sifra) === lc(m.sifra)) || lc(x.naziv) === lc(m.naziv));
        modeli.set(
          lc(m.sifra),
          postoji?.id ??
            (
              await tx.modelUredaja.create({
                data: {
                  firmaId: f,
                  naziv: m.naziv,
                  sifra: m.sifra === m.naziv ? null : m.sifra,
                  proizvodjacId: proizvodjaci.get(lc(m.proizvodjac))!,
                  kategorijaId: kategorije.get(lc(m.kategorija))!,
                  preporucenaCijena: m.preporucenaCijena === null ? null : centiUDecimal(m.preporucenaCijena),
                  jamstvoMjeseci: m.jamstvoMjeseci,
                  kpdProdaja: m.kpdProdaja,
                },
              })
            ).id,
        );
      }
      for (const s of p.usluge)
        if (!b.usluge.some((x) => lc(x.naziv) === lc(s.naziv)))
          await tx.usluga.create({
            data: {
              firmaId: f,
              naziv: s.naziv,
              sifra: s.sifra,
              jedinica: s.jedinica,
              cijena: s.cijena === null ? null : centiUDecimal(s.cijena),
              kpd: s.kpd,
            },
          });

      // partneri (postojeći po OIB-u)
      const poOibu = new Map(b.partneri.map((x) => [x.oib!, x]));
      const partneri = new Map<string, { id: string; pdv: PartnerZaPdv; snimka: Record<string, unknown> }>();
      for (const x of p.partneri) {
        const postoji = x.oib ? poOibu.get(x.oib) : undefined;
        const zapis = postoji
          ? await tx.partner.findUniqueOrThrow({ where: { id: postoji.id } })
          : await tx.partner.create({
              data: {
                firmaId: f,
                naziv: x.naziv,
                oib: x.oib,
                pdvBroj: x.pdvBroj,
                drzava: x.drzava,
                adresa: x.adresa,
                postanskiBroj: x.postanskiBroj,
                mjesto: x.mjesto,
                email: x.email,
                telefon: x.telefon,
                kupac: x.kupac,
                dobavljac: x.dobavljac,
                rokPlacanjaDana: x.rokPlacanjaDana,
                napomena: `Uvezeno iz starog programa (šifra ${x.sifra})`,
              },
            });
        partneri.set(x.sifra, {
          id: zapis.id,
          pdv: zapis,
          snimka: {
            naziv: zapis.naziv,
            oib: zapis.oib,
            pdvBroj: zapis.pdvBroj,
            drzava: zapis.drzava,
            adresa: zapis.adresa,
            postanskiBroj: zapis.postanskiBroj,
            mjesto: zapis.mjesto,
            email: zapis.email,
            eRacunAdresa: zapis.eRacunAdresa,
          },
        });
      }

      // uređaji (uređaji s ugovora najma idu na skladište — ugovor ih premješta u najam)
      const uredaji = new Map<string, { id: string; modelId: string }>();
      const redovi: Prisma.UredajCreateManyInput[] = [];
      const dogadaji: Prisma.DogadajUredajaCreateManyInput[] = [];
      for (const u of p.uredaji) {
        const id = randomUUID();
        const modelId = modeli.get(lc(u.model))!;
        const stanje = naUgovoru.has(u.serijski) ? "NA_SKLADISTU" : u.stanje;
        const skladisteId = stanje === "NA_SKLADISTU" ? (u.skladiste ? skladista.get(lc(u.skladiste))! : zadanoSkladiste) : null;
        const partnerId = stanje === "PRODAN" || stanje === "U_NAJMU" ? (u.partner ? partneri.get(u.partner)!.id : null) : null;
        uredaji.set(u.serijski, { id, modelId });
        redovi.push({
          id,
          firmaId: f,
          serijski: u.serijski,
          modelId,
          stanje,
          skladisteId,
          partnerId,
          nabavnaCijena: u.nabavnaCijena === null ? null : centiUDecimal(u.nabavnaCijena),
          nabavniDatum: u.nabavniDatum ? dan(u.nabavniDatum) : null,
          jamstvoDo: u.jamstvoDo ? dan(u.jamstvoDo) : null,
          cpu: u.cpu,
          ram: u.ram,
          disk: u.disk,
          os: u.os,
          napomena: u.napomena,
        });
        dogadaji.push({
          firmaId: f,
          uredajId: id,
          radnja: "uvoz",
          novoStanje: stanje,
          skladisteDoId: skladisteId,
          partnerId,
          opis: "Uvoz iz starog programa",
          korisnikId: akter.korisnikId,
          korisnik: ime,
        });
      }
      await uSerijama(redovi, (s) => tx.uredaj.createMany({ data: s }));
      await uSerijama(dogadaji, (s) => tx.dogadajUredaja.createMany({ data: s }));

      // računi: izdani, zaključani, sa snimkom; fiskalizirani samo ako imaju JIR (nikad se ne šalju CIS-u)
      const firmaSnimka = {
        naziv: b.firma.naziv,
        oib: b.firma.oib,
        adresa: b.firma.adresa,
        postanskiBroj: b.firma.postanskiBroj,
        mjesto: b.firma.mjesto,
        email: b.firma.email,
        telefon: b.firma.telefon,
        web: b.firma.web,
        iban: b.firma.iban,
        banka: b.firma.banka,
        uSustavuPdv: b.firma.uSustavuPdv,
        podnozje: b.firma.podnozje,
        boja: b.firma.boja,
        logoId: b.firma.logoId,
      };
      const dokumenti: Prisma.ProdajniDokumentCreateManyInput[] = [];
      const stavke: Prisma.StavkaProdajnogDokumentaCreateManyInput[] = [];
      const naStavkama: Prisma.UredajNaStavciCreateManyInput[] = [];
      const uplate: Prisma.UplataCreateManyInput[] = [];
      const brojaci = new Map<string, { vrsta: string; godina: number; zadnji: number; datum: string }>();
      for (const r of p.racuni) {
        const partner = r.partner ? partneri.get(r.partner)! : null;
        const izr = izracunajDokument(stavkeZaIzracun(r, uredaji), {
          firmaUSustavuPdv: b.firma.uSustavuPdv,
          pdvPoNaplacenoj: b.firma.pdvPoNaplacenoj,
          statusKupca: statusKupca(partner?.pdv ?? null),
          popust: r.popust,
        });
        const id = randomUUID();
        const godina = Number(r.datum.slice(0, 4));
        const placeno = r.uplate.reduce((s, u) => s + u.iznos, 0);
        dokumenti.push({
          id,
          firmaId: f,
          vrsta: "RACUN",
          status: "IZDAN",
          broj: r.broj,
          godina,
          redni: r.redni,
          datum: dan(r.datum),
          dospijece: r.dospijece ? dan(r.dospijece) : null,
          partnerId: partner?.id ?? null,
          popust: r.popust,
          napomena: r.napomena,
          nacinPlacanja: r.nacinPlacanja,
          osnovica: centiUDecimal(izr.zbrojevi.osnovica),
          pdv: centiUDecimal(izr.zbrojevi.pdv),
          ukupno: centiUDecimal(izr.zbrojevi.ukupno),
          placeno: centiUDecimal(placeno),
          snimka: {
            firma: firmaSnimka,
            kupac: partner?.snimka ?? null,
            poslovnica: null,
            napomene: izr.napomene,
            racun: {
              oznakaProstora: r.prostor,
              oznakaUredaja: r.naplatniUredaj,
              nacinPlacanja: r.nacinPlacanja,
              pdvPoNaplacenoj: b.firma.pdvPoNaplacenoj,
              operater: "Uvoz iz starog programa",
              poKategoriji: izr.zbrojevi.poKategoriji,
            },
            uvoz: { ukupnoStarogPrograma: r.ukupno },
          } as unknown as Prisma.InputJsonValue,
          korisnikId: akter.korisnikId,
          korisnik: ime,
          izdano: dan(r.datum),
          fiskalStatus: r.jir ? "FISKALIZIRAN" : "NIJE_POTREBNO",
          // račun s JIR-om fiskaliziran je u starom programu (čuva se 11 godina — opasna zona ga ne briše)
          fiskalNacin: r.jir ? "PRODUKCIJA" : null,
          zki: r.zki && r.zki.length === 32 ? r.zki : null,
          jir: r.jir,
        });
        for (const [i, s] of izr.grupirane.entries()) {
          const stavkaId = randomUUID();
          stavke.push({
            id: stavkaId,
            firmaId: f,
            dokumentId: id,
            redoslijed: i,
            vrsta: s.vrsta,
            namjena: s.namjena,
            uredajId: s.uredajIds.length === 1 ? s.uredajIds[0]! : null,
            modelId: s.modelId ?? null,
            naziv: s.naziv,
            kpd: s.kpd ?? null,
            jedinica: s.jedinica,
            kolicina: s.kolicina,
            cijena: centiUDecimal(s.cijena),
            popust: s.popust,
            vrstaIsporuke: s.vrstaIsporuke,
            stopa: s.kategorija.stopa,
            kategorija: s.kategorija.kod,
            iznos: centiUDecimal(s.iznos),
          });
          for (const uredajId of s.uredajIds) naStavkama.push({ firmaId: f, stavkaId, uredajId });
        }
        for (const u of r.uplate)
          uplate.push({
            firmaId: f,
            dokumentId: id,
            datum: dan(u.datum),
            iznos: centiUDecimal(u.iznos),
            nacin: u.nacin,
            opis: "Uvoz iz starog programa",
            korisnikId: akter.korisnikId,
            korisnik: ime,
          });
        const vrsta = vrstaBrojacaRacuna("racun", r.prostor, r.naplatniUredaj);
        const k = `${vrsta}:${godina}`;
        const bc = brojaci.get(k) ?? { vrsta, godina, zadnji: 0, datum: r.datum };
        bc.zadnji = Math.max(bc.zadnji, r.redni);
        if (r.datum > bc.datum) bc.datum = r.datum;
        brojaci.set(k, bc);
      }
      await uSerijama(dokumenti, (s) => tx.prodajniDokument.createMany({ data: s }), 500);
      await uSerijama(stavke, (s) => tx.stavkaProdajnogDokumenta.createMany({ data: s }));
      await uSerijama(naStavkama, (s) => tx.uredajNaStavci.createMany({ data: s }));
      await uSerijama(uplate, (s) => tx.uplata.createMany({ data: s }));
      // nastavak numeracije: sljedeći račun u istom nizu dobiva broj iza zadnjeg uvezenog
      for (const x of brojaci.values())
        await tx.$executeRaw`
          INSERT INTO "Brojac" ("firmaId", "vrsta", "godina", "zadnji", "zadnjiDatum") VALUES (${f}::uuid, ${x.vrsta}, ${x.godina}, ${x.zadnji}, ${x.datum}::date)
          ON CONFLICT ("firmaId", "vrsta", "godina") DO UPDATE SET "zadnji" = GREATEST("Brojac"."zadnji", EXCLUDED."zadnji"),
            "zadnjiDatum" = GREATEST(COALESCE("Brojac"."zadnjiDatum", EXCLUDED."zadnjiDatum"), EXCLUDED."zadnjiDatum")`;

      await zapisiDnevnik(tx, {
        firmaId: f,
        korisnikId: akter.korisnikId,
        ip: akter.ip,
        radnja: "uvoz.stari-program",
        entitet: "Firma",
        entitetId: f,
        opis: `Uvoz iz starog programa: ${Object.entries(iz.brojevi)
          .filter(([k]) => k !== "ugovoriNajma")
          .map(([k, v]) => `${k} ${v}`)
          .join(", ")}; razlika u iznosima: ${iz.razlike.length} računa`,
      });
    },
    { timeout: 60 * 60_000, maxWait: 60_000 },
  );

  // ugovori najma kroz servise najma
  const ugovoriGreske: Poruka[] = [];
  const partneri = new Map(
    (
      await db.partner.findMany({
        where: {
          firmaId: f,
          OR: [
            { napomena: { startsWith: "Uvezeno iz starog programa" } },
            { oib: { in: p.partneri.map((x) => x.oib).filter((x): x is string => !!x) } },
          ],
        },
        select: { id: true, oib: true, napomena: true },
      })
    ).flatMap((x) => {
      const sifra = /\(šifra (.+)\)$/.exec(x.napomena ?? "")?.[1];
      return [...(sifra ? [[`s:${sifra}`, x.id] as const] : []), ...(x.oib ? [[`o:${x.oib}`, x.id] as const] : [])];
    }),
  );
  for (const u of p.ugovori) {
    try {
      const px = p.partneri.find((x) => x.sifra === u.partner)!;
      const partnerId = (px.oib && partneri.get(`o:${px.oib}`)) || partneri.get(`s:${px.sifra}`);
      if (!partnerId) throw new GreskaKorisniku("Najmoprimac nije uvezen.");
      const r = await spremiUgovor(db, akter, null, {
        od: u.od,
        do: u.do,
        rucniBroj: u.broj,
        rokPlacanjaDana: u.rokPlacanjaDana,
        nacinPlacanja: u.nacinPlacanja,
        partnerId,
        poslovnicaId: null,
        uvjeti: null,
        napomenaRacuna: null,
        verzija: 0,
      });
      if (!r.ok) throw new GreskaKorisniku(Object.values(r.polja).join(" "));
      const grupe = new Map<string, { od: string; cijena: number; serijski: string[] }>();
      for (const x of u.uredaji) {
        const k = `${x.od}:${x.cijena}`;
        const g = grupe.get(k) ?? { od: x.od, cijena: x.cijena, serijski: [] };
        g.serijski.push(x.serijski);
        grupe.set(k, g);
      }
      for (const g of grupe.values())
        await dodajUredajeNaUgovor(db, akter, r.id, { serijski: g.serijski, od: g.od, cijena: g.cijena, izvor: "SKLADISTE" });
      if (u.naplacenoDo) await oznaciNaplacenoDo(db, akter, r.id, u.naplacenoDo);
    } catch (e) {
      ugovoriGreske.push({ gdje: `ugovor ${u.broj}`, poruka: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ...iz, ugovoriGreske };
}
