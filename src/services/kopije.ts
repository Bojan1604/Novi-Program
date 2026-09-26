import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Gunzip, Gzip, strToU8 } from "fflate";
import { danas, datumUZagrebu, ZONA } from "@/domain/datum";
import { kodUpisa } from "@/domain/mdm";
import { procitajOib } from "@/domain/oib";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { GreskaKorisniku } from "@/lib/greske";
import { zakljucajKljuc } from "@/lib/zakljucavanje";
import { zapisiDnevnik } from "./dnevnik";
import { napraviZadaneUloge, type Akter } from "./korisnici";

/**
 * Sigurnosne kopije firme (korak 6.6).
 *
 * Kopija su svi redci svih tablica s `firmaId` (i sam zapis firme), popis tablica, stupaca i
 * veza čita se iz kataloga baze — nova tablica automatski ulazi u kopiju. Format: gzip NDJSON,
 * prvi redak opis (tablice i stupci), zatim `{m, r}` po retku, zadnji redak broj redaka (kopija
 * odrezana na pola se odbija).
 *
 * Vraćanje uvijek ide u NOVU firmu (izvorna ostaje netaknuta): svaki id iz kopije dobije novi
 * UUID (i u JSON-u — dnevnik, snimke dokumenata), a vrijednosti jedinstvene u cijeloj bazi
 * (kod upisa MDM-a, token uređaja, poveznica portala) se nanovo stvaraju ili brišu. Klijenti portala
 * u kopiji su isključeni i bez lozinke (inače bi se prijavili u kopiju umjesto u izvornu firmu).
 */

export const FORMAT_KOPIJE = "erp-wms-kopija";
const VERZIJA = 1;
/** privremeno (sesije), sama kopija i članstva korisnika (vraća se samo onaj tko vraća) */
export const IZUZETE_TABLICE = new Set(["Sesija", "SesijaPortala", "SigurnosnaKopija", "ClanstvoFirme"]);
/** jedinstveni indeksi preko cijele baze (bez firmaId) koje vraćanje zna obraditi — test pukne za novi */
export const GLOBALNO_JEDINSTVENI = new Set([
  "KorisnikPortala.poveznicaHash",
  "MdmOrganizacija.kodUpisa",
  "MdmUredaj.tokenHash",
  "StavkaCjenika.cjenikId,modelId",
  "StavkaCjenika.cjenikId,uslugaId",
  "StavkaInventure.inventuraId,serijski",
  "StavkaSkladisnogDokumenta.dokumentId,uredajId",
  "UredajNaStavci.stavkaId,uredajId",
]);
export const CUVA_SE = { DNEVNA: 7, RUCNA: 10 } as const;
export type VrstaKopije = keyof typeof CUVA_SE;
/** najveća veličina raspakirane kopije (štiti memoriju kod učitane datoteke) */
const NAJVISE_RASPAKIRANO = 2 * 1024 * 1024 * 1024 - 1;

type Baza = PrismaClient | Prisma.TransactionClient;
type Redak = Record<string, unknown>;

type Veza = { stupci: string[]; cilj: string };
export type TablicaKataloga = { ime: string; stupci: string[]; nullable: Set<string>; veze: Veza[]; imaId: boolean };

/** Tablice s firmaId (bez izuzetih) i njihove veze — iz kataloga baze. */
export async function katalog(db: Baza): Promise<TablicaKataloga[]> {
  const stupci = await db.$queryRaw<{ tablica: string; stupac: string; nullable: boolean }[]>`
    SELECT c.relname AS tablica, a.attname AS stupac, NOT a.attnotnull AS nullable
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND EXISTS (SELECT 1 FROM pg_attribute f WHERE f.attrelid = c.oid AND f.attname = 'firmaId' AND NOT f.attisdropped)
    ORDER BY c.relname, a.attnum`;
  const veze = await db.$queryRaw<{ tablica: string; cilj: string; stupci: string[] }[]>`
    SELECT c.relname AS tablica, t.relname AS cilj,
      ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY u(n, i)
            JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = u.n ORDER BY u.i) AS stupci
    FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_class t ON t.oid = k.confrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE k.contype = 'f' AND n.nspname = 'public'`;
  const po = new Map<string, TablicaKataloga>();
  for (const s of stupci) {
    if (IZUZETE_TABLICE.has(s.tablica)) continue;
    let t = po.get(s.tablica);
    if (!t) po.set(s.tablica, (t = { ime: s.tablica, stupci: [], nullable: new Set(), veze: [], imaId: false }));
    t.stupci.push(s.stupac);
    if (s.nullable) t.nullable.add(s.stupac);
    if (s.stupac === "id") t.imaId = true;
  }
  for (const v of veze) {
    const t = po.get(v.tablica);
    if (!t || v.cilj === "Firma") continue;
    if (!po.has(v.cilj)) throw new Error(`Kopija: ${v.tablica} ima vezu na ${v.cilj} koja nije u kopiji.`);
    t.veze.push({ stupci: v.stupci, cilj: v.cilj });
  }
  return [...po.values()];
}

/**
 * Redoslijed upisa: tablica ide nakon onih na koje pokazuje. Kod kruga (npr. ugovor ↔ račun)
 * i veze na samu sebe veza s praznim (nullable) stupcima upisuje se naknadno.
 */
export function redoslijedUpisa(tablice: TablicaKataloga[]): { tablica: TablicaKataloga; naknadno: string[] }[] {
  const ostale = new Map(tablice.map((t) => [t.ime, t]));
  const smjesteno = new Set<string>();
  const red: { tablica: TablicaKataloga; naknadno: string[] }[] = [];
  const prazniStupci = (t: TablicaKataloga, v: Veza) => v.stupci.filter((s) => s !== "firmaId" && t.nullable.has(s));
  while (ostale.size) {
    const cekaju = (t: TablicaKataloga) => t.veze.filter((v) => v.cilj !== t.ime && !smjesteno.has(v.cilj));
    let sljedeca = [...ostale.values()].find((t) => cekaju(t).length === 0);
    // krug: uzmi tablicu kojoj su sve preostale veze odgodive
    sljedeca ??= [...ostale.values()].find((t) => cekaju(t).every((v) => prazniStupci(t, v).length > 0));
    if (!sljedeca) throw new Error(`Kopija: krug obaveznih veza među tablicama ${[...ostale.keys()].join(", ")}.`);
    const t = sljedeca;
    const naknadno = new Set<string>();
    for (const v of t.veze) if (v.cilj === t.ime || !smjesteno.has(v.cilj)) for (const s of prazniStupci(t, v)) naknadno.add(s);
    if (naknadno.size && !t.imaId) throw new Error(`Kopija: ${t.ime} nema id za naknadni upis veza.`);
    red.push({ tablica: t, naknadno: [...naknadno] });
    smjesteno.add(t.ime);
    ostale.delete(t.ime);
  }
  return red;
}

const q = (ime: string) => `"${ime.replaceAll('"', '""')}"`;

type Opis = {
  format: typeof FORMAT_KOPIJE;
  verzija: number;
  firmaId: string;
  naziv: string;
  oib: string;
  vrijeme: string;
  stupciFirme: string[];
  tablice: Record<string, string[]>;
};

/** Izrada kopije: jedno dosljedno stanje baze (REPEATABLE READ), gzip NDJSON. */
export async function izradiSadrzaj(
  db: PrismaClient,
  firmaId: string,
  sada = new Date(),
): Promise<{ sadrzaj: Uint8Array; redaka: Record<string, number> }> {
  return db.$transaction(
    async (tx) => {
      const tablice = await katalog(tx);
      const [firma] = await tx.$queryRawUnsafe<{ r: Redak }[]>(`SELECT to_jsonb(f) AS r FROM "Firma" f WHERE id = $1::uuid`, firmaId);
      if (!firma) throw new GreskaKorisniku("Firma ne postoji.");
      const dijelovi: Uint8Array[] = [];
      const gz = new Gzip({ level: 6 }, (d) => dijelovi.push(d));
      const pisi = (o: unknown) => gz.push(strToU8(JSON.stringify(o) + "\n"));
      const opis: Opis = {
        format: FORMAT_KOPIJE,
        verzija: VERZIJA,
        firmaId,
        naziv: String(firma.r["naziv"]),
        oib: String(firma.r["oib"]),
        vrijeme: sada.toISOString(),
        stupciFirme: Object.keys(firma.r),
        tablice: Object.fromEntries(tablice.map((t) => [t.ime, t.stupci])),
      };
      pisi(opis);
      pisi({ m: "Firma", r: firma.r });
      const redaka: Record<string, number> = {};
      for (const t of tablice) {
        let n = 0;
        if (t.imaId) {
          let zadnji = "00000000-0000-0000-0000-000000000000";
          for (;;) {
            const dio = await tx.$queryRawUnsafe<{ id: string; r: Redak }[]>(
              `SELECT id::text AS id, to_jsonb(t) AS r FROM ${q(t.ime)} t WHERE "firmaId" = $1::uuid AND id > $2::uuid ORDER BY id LIMIT 200`,
              firmaId,
              zadnji,
            );
            for (const d of dio) pisi({ m: t.ime, r: d.r });
            n += dio.length;
            if (dio.length < 200) break;
            zadnji = dio[dio.length - 1]!.id;
          }
        } else {
          const sve = await tx.$queryRawUnsafe<{ r: Redak }[]>(`SELECT to_jsonb(t) AS r FROM ${q(t.ime)} t WHERE "firmaId" = $1::uuid`, firmaId);
          for (const d of sve) pisi({ m: t.ime, r: d.r });
          n = sve.length;
        }
        if (n) redaka[t.ime] = n;
      }
      pisi({ kraj: true, redaka });
      gz.push(new Uint8Array(0), true);
      const ukupno = dijelovi.reduce((s, d) => s + d.length, 0);
      const sadrzaj = new Uint8Array(ukupno);
      let pomak = 0;
      for (const d of dijelovi) {
        sadrzaj.set(d, pomak);
        pomak += d.length;
      }
      return { sadrzaj, redaka };
    },
    { isolationLevel: "RepeatableRead", timeout: 30 * 60_000, maxWait: 60_000 },
  );
}

/** Nova kopija spremljena u bazu; stare iste vrste iznad CUVA_SE se brišu. */
export async function izradiKopiju(
  db: PrismaClient,
  firmaId: string,
  vrsta: VrstaKopije,
  akter: Pick<Akter, "korisnikId" | "ip"> | null,
  sada = new Date(),
): Promise<{ id: string; velicina: number }> {
  const { sadrzaj, redaka } = await izradiSadrzaj(db, firmaId, sada);
  if (sadrzaj.length > NAJVISE_RASPAKIRANO) throw new GreskaKorisniku("Kopija je prevelika za spremanje u bazu — koristite kopiju cijele baze.");
  return db.$transaction(async (tx) => {
    await zakljucajKljuc(tx, `kopija:${firmaId}`);
    const ime = akter ? ((await tx.korisnik.findUnique({ where: { id: akter.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat") : "Sustav";
    const k = await tx.sigurnosnaKopija.create({
      data: { firmaId, vrsta, velicina: sadrzaj.length, redaka, sadrzaj: Buffer.from(sadrzaj), korisnik: ime, vrijeme: sada },
      select: { id: true, velicina: true },
    });
    const visak = await tx.sigurnosnaKopija.findMany({
      where: { firmaId, vrsta },
      orderBy: { vrijeme: "desc" },
      skip: CUVA_SE[vrsta],
      select: { id: true },
    });
    if (visak.length) await tx.sigurnosnaKopija.deleteMany({ where: { firmaId, id: { in: visak.map((v) => v.id) } } });
    if (akter) {
      await zapisiDnevnik(tx, {
        firmaId,
        korisnikId: akter.korisnikId,
        radnja: "kopije.izrada",
        entitet: "SigurnosnaKopija",
        entitetId: k.id,
        opis: `Ručna sigurnosna kopija (${Math.round(sadrzaj.length / 1024)} KB)`,
        ip: akter.ip ?? null,
      });
    }
    return k;
  });
}

function satUZagrebu(sada: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", hourCycle: "h23" }).format(sada));
}

/** Dnevne kopije svih aktivnih firmi (poslije 02:00, jednom na dan). Greška jedne firme ne zaustavlja ostale. */
export async function dnevneKopije(db: PrismaClient, sada = new Date()): Promise<{ izradeno: number; greske: string[] }> {
  if (satUZagrebu(sada) < 2) return { izradeno: 0, greske: [] };
  const dan = danas(sada);
  const firme = await db.firma.findMany({ where: { aktivna: true }, select: { id: true, naziv: true } });
  let izradeno = 0;
  const greske: string[] = [];
  for (const f of firme) {
    const zadnja = await db.sigurnosnaKopija.findFirst({
      where: { firmaId: f.id, vrsta: "DNEVNA" },
      orderBy: { vrijeme: "desc" },
      select: { vrijeme: true },
    });
    if (zadnja && datumUZagrebu(zadnja.vrijeme) === dan) continue;
    try {
      await izradiKopiju(db, f.id, "DNEVNA", null, sada);
      izradeno++;
    } catch (e) {
      greske.push(`${f.naziv}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { izradeno, greske };
}

/** Raspakirana i provjerena kopija. */
export type ProcitanaKopija = { opis: Opis; firma: Redak; redci: Map<string, Redak[]>; redaka: Record<string, number> };

export function procitajKopiju(sadrzaj: Uint8Array): ProcitanaKopija {
  const nije = () => new GreskaKorisniku("Datoteka nije sigurnosna kopija ovog programa ili je oštećena.");
  const dekoder = new TextDecoder();
  let velicina = 0;
  let ostatak = "";
  const redci: string[] = [];
  try {
    const gz = new Gunzip((d) => {
      velicina += d.length;
      if (velicina > NAJVISE_RASPAKIRANO) throw new GreskaKorisniku("Kopija je prevelika.");
      const tekst = ostatak + dekoder.decode(d, { stream: true });
      const linije = tekst.split("\n");
      ostatak = linije.pop()!;
      for (const l of linije) if (l) redci.push(l);
    });
    gz.push(sadrzaj, true);
  } catch (e) {
    if (e instanceof GreskaKorisniku) throw e;
    throw nije();
  }
  ostatak += dekoder.decode();
  if (ostatak) redci.push(ostatak);
  const citaj = (l: string | undefined): Redak => {
    try {
      const o: unknown = JSON.parse(l ?? "");
      if (!o || typeof o !== "object" || Array.isArray(o)) throw nije();
      return o as Redak;
    } catch {
      throw nije();
    }
  };
  const opis = citaj(redci[0]) as unknown as Opis;
  if (opis.format !== FORMAT_KOPIJE || opis.verzija !== VERZIJA || !opis.tablice || typeof opis.tablice !== "object") throw nije();
  const kraj = citaj(redci[redci.length - 1]);
  if (kraj["kraj"] !== true || !kraj["redaka"] || typeof kraj["redaka"] !== "object") throw nije();
  const redaka = kraj["redaka"] as Record<string, number>;
  let firma: Redak | null = null;
  const po = new Map<string, Redak[]>();
  for (let i = 1; i < redci.length - 1; i++) {
    const z = citaj(redci[i]);
    const m = z["m"];
    const r = z["r"];
    if (typeof m !== "string" || !r || typeof r !== "object" || Array.isArray(r)) throw nije();
    if (m === "Firma") {
      if (firma) throw nije();
      firma = r as Redak;
      continue;
    }
    if (!(m in opis.tablice)) throw nije();
    let l = po.get(m);
    if (!l) po.set(m, (l = []));
    l.push(r as Redak);
  }
  if (!firma) throw nije();
  for (const [m, n] of Object.entries(redaka)) if ((po.get(m)?.length ?? 0) !== n) throw nije();
  for (const [m, l] of po) if (redaka[m] !== l.length) throw nije();
  return { opis, firma, redci: po, redaka };
}

/** Zamjena starih id-eva novima u cijeloj vrijednosti (i u JSON-u). */
function zamijeni(v: unknown, mapa: Map<string, string>): unknown {
  if (typeof v === "string") return mapa.get(v) ?? v;
  if (Array.isArray(v)) return v.map((x) => zamijeni(x, mapa));
  if (v && typeof v === "object") {
    const o: Redak = {};
    for (const [k, x] of Object.entries(v)) o[k] = zamijeni(x, mapa);
    return o;
  }
  return v;
}

const hashTokena = (t: string) => createHash("sha256").update(t).digest("hex");
/** batch do ~4 MB JSON-a (prilozi) */
function* uSerije(redci: Redak[]): Generator<Redak[]> {
  let serija: Redak[] = [];
  let velicina = 0;
  for (const r of redci) {
    const v = JSON.stringify(r).length;
    if (serija.length && (velicina + v > 4_000_000 || serija.length >= 500)) {
      yield serija;
      serija = [];
      velicina = 0;
    }
    serija.push(r);
    velicina += v;
  }
  if (serija.length) yield serija;
}

export type UlazVracanja = { naziv: string; oib: string };

/**
 * Vraćanje kopije u NOVU firmu. Onaj tko vraća postaje administrator nove firme; ostali
 * korisnici nemaju pristup dok ih administrator ne doda. Fiskalizacija nove firme je u
 * demo načinu (kopija ne smije fiskalizirati račune kao druga firma).
 */
export async function vratiUNovuFirmu(
  db: PrismaClient,
  akter: Pick<Akter, "korisnikId" | "ip" | "firmaId">,
  sadrzaj: Uint8Array,
  ulaz: UlazVracanja,
): Promise<{ firmaId: string; redaka: number }> {
  const naziv = ulaz.naziv.trim();
  if (!naziv || naziv.length > 200) throw new GreskaKorisniku("Upišite naziv nove firme.");
  const oib = procitajOib(ulaz.oib);
  if (!oib.ok) throw new GreskaKorisniku(oib.greska);
  const k = procitajKopiju(sadrzaj);

  return db.$transaction(
    async (tx) => {
      await zakljucajKljuc(tx, `firma-oib:${oib.vrijednost}`);
      if (await tx.firma.findUnique({ where: { oib: oib.vrijednost }, select: { id: true } }))
        throw new GreskaKorisniku("Firma s tim OIB-om već postoji — vraćanje ide uvijek u novu firmu.");
      const tablice = await katalog(tx);
      const poImenu = new Map(tablice.map((t) => [t.ime, t]));
      for (const m of k.redci.keys()) if (!poImenu.has(m)) throw new GreskaKorisniku(`Kopija sadrži tablicu koje ovaj program nema (${m}).`);

      // stari id → novi
      const mapa = new Map<string, string>();
      const novaFirma = randomUUID();
      mapa.set(String(k.firma["id"]), novaFirma);
      for (const [m, l] of k.redci) {
        if (!poImenu.get(m)!.imaId) continue;
        for (const r of l) {
          if (typeof r["id"] !== "string") throw new GreskaKorisniku("Kopija je oštećena (zapis bez id-a).");
          if (mapa.has(r["id"])) throw new GreskaKorisniku("Kopija je oštećena (dvostruki id).");
          mapa.set(r["id"], randomUUID());
        }
      }
      const noviIdevi = new Set(mapa.values());

      // firma
      const firma = zamijeni(k.firma, mapa) as Redak;
      Object.assign(firma, { id: novaFirma, naziv, oib: oib.vrijednost, aktivna: true, stvoreno: new Date().toISOString() });
      if (firma["fiskalNacin"] !== "ISKLJUCENA") firma["fiskalNacin"] = "DEMO";
      const stupciFirme = (
        await tx.$queryRaw<
          { s: string }[]
        >`SELECT attname::text AS s FROM pg_attribute WHERE attrelid = '"Firma"'::regclass AND attnum > 0 AND NOT attisdropped`
      ).map((x) => x.s);
      const zajednickiFirme = stupciFirme.filter((s) => k.opis.stupciFirme.includes(s)).map(q);
      await tx.$executeRawUnsafe(
        `INSERT INTO "Firma" (${zajednickiFirme}) SELECT ${zajednickiFirme} FROM jsonb_populate_record(NULL::"Firma", $1::jsonb)`,
        JSON.stringify(firma),
      );

      let ukupno = 0;
      const naknadni: { tablica: TablicaKataloga; stupci: string[]; redci: Redak[] }[] = [];
      for (const { tablica: t, naknadno } of redoslijedUpisa(tablice)) {
        const izvorni = k.redci.get(t.ime);
        if (!izvorni?.length) continue;
        const redci = izvorni.map((r) => {
          const n = zamijeni(r, mapa) as Redak;
          n["firmaId"] = novaFirma;
          return n;
        });
        // veza smije pokazivati samo na zapis iz iste kopije (učitana datoteka ne smije dohvatiti tuđe podatke)
        for (const v of t.veze)
          for (const s of v.stupci)
            if (s !== "firmaId")
              for (const r of redci)
                if (r[s] != null && !noviIdevi.has(String(r[s])))
                  throw new GreskaKorisniku(`Kopija je oštećena (${t.ime}.${s} pokazuje izvan kopije).`);
        if (t.ime === "MdmOrganizacija") for (const r of redci) r["kodUpisa"] = kodUpisa(randomBytes(12));
        if (t.ime === "MdmUredaj")
          for (const r of redci) Object.assign(r, { tokenHash: hashTokena(randomBytes(32).toString("base64url")), ponovniUpis: true });
        // klijent se ne smije moći prijaviti u kopiju umjesto u izvornu firmu (ista adresa i lozinka): pristup se daje nanovo
        if (t.ime === "KorisnikPortala")
          for (const r of redci) Object.assign(r, { poveznicaHash: null, poveznicaIstice: null, lozinkaHash: null, aktivan: false });

        const stupci = t.stupci.filter((s) => k.opis.tablice[t.ime]!.includes(s));
        const popis = stupci.map(q).join(", ");
        const odgodeni = naknadno.filter((s) => stupci.includes(s));
        const zaUpis = odgodeni.length ? redci.map((r) => ({ ...r, ...Object.fromEntries(odgodeni.map((s) => [s, null])) })) : redci;
        for (const serija of uSerije(zaUpis))
          await tx.$executeRawUnsafe(
            `INSERT INTO ${q(t.ime)} (${popis}) SELECT ${popis} FROM jsonb_populate_recordset(NULL::${q(t.ime)}, $1::jsonb)`,
            JSON.stringify(serija),
          );
        if (odgodeni.length) {
          const s = redci
            .filter((r) => odgodeni.some((c) => r[c] != null))
            .map((r) => ({ id: r["id"], ...Object.fromEntries(odgodeni.map((c) => [c, r[c]])) }));
          if (s.length) naknadni.push({ tablica: t, stupci: odgodeni, redci: s });
        }
        ukupno += redci.length;
      }
      for (const { tablica: t, stupci, redci } of naknadni) {
        const postavi = stupci.map((s) => `${q(s)} = s.${q(s)}`).join(", ");
        for (const serija of uSerije(redci))
          await tx.$executeRawUnsafe(
            `UPDATE ${q(t.ime)} t SET ${postavi} FROM jsonb_populate_recordset(NULL::${q(t.ime)}, $1::jsonb) s WHERE t.id = s.id AND t."firmaId" = $2::uuid`,
            JSON.stringify(serija),
            novaFirma,
          );
      }

      // onaj tko vraća = administrator nove firme
      let admin = await tx.uloga.findFirst({ where: { firmaId: novaFirma, naziv: "Administrator" }, select: { id: true } });
      if (!admin) {
        const postojece = new Set((await tx.uloga.findMany({ where: { firmaId: novaFirma }, select: { naziv: true } })).map((u) => u.naziv));
        if (postojece.size === 0) admin = { id: (await napraviZadaneUloge(tx, novaFirma))["Administrator"]! };
        else throw new GreskaKorisniku("U kopiji nema uloge „Administrator“.");
      }
      await tx.clanstvoFirme.create({ data: { firmaId: novaFirma, korisnikId: akter.korisnikId, ulogaId: admin.id } });

      const opis = `Vraćena sigurnosna kopija firme ${k.opis.naziv} (OIB ${k.opis.oib}) od ${k.opis.vrijeme.slice(0, 10)} — ${ukupno} zapisa`;
      await zapisiDnevnik(tx, {
        firmaId: novaFirma,
        korisnikId: akter.korisnikId,
        radnja: "kopije.vracanje",
        entitet: "Firma",
        entitetId: novaFirma,
        opis,
        ip: akter.ip ?? null,
      });
      await zapisiDnevnik(tx, {
        firmaId: akter.firmaId,
        korisnikId: akter.korisnikId,
        radnja: "kopije.vracanje",
        entitet: "SigurnosnaKopija",
        opis: `${opis} u novu firmu ${naziv} (OIB ${oib.vrijednost})`,
        ip: akter.ip ?? null,
      });
      return { firmaId: novaFirma, redaka: ukupno };
    },
    { timeout: 30 * 60_000, maxWait: 60_000 },
  );
}

/** Broj redaka po tablici firme (za usporedbu kopije i izvora). */
export async function brojRedaka(db: Baza, firmaId: string): Promise<Record<string, number>> {
  const r: Record<string, number> = {};
  for (const t of await katalog(db)) {
    const [x] = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${q(t.ime)} WHERE "firmaId" = $1::uuid`, firmaId);
    if (x && x.n > 0n) r[t.ime] = Number(x.n);
  }
  return r;
}
