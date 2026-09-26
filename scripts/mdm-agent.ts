/**
 * Ispitni MDM agent (simulacija uređaja) — provjera poslužitelja bez pravog uređaja.
 *
 *   npm run mdm:agent -- --adresa http://localhost:3000 --kod ABCD-EFGH-JKMN --serijski TEST-1 [--platforma WINDOWS] [--jednom]
 *
 * Token se pamti u .mdm-agent-<serijski>.json. „Instalira“ dodijeljene aplikacije (preuzme i provjeri SHA-256,
 * zapamti verziju), izvršava naredbe (ispis), javlja rezultate i zapisnik, šalje malu PNG snimku zaslona.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: a } = parseArgs({
  options: {
    adresa: { type: "string", default: "http://localhost:3000" },
    kod: { type: "string" },
    serijski: { type: "string", default: "TEST-AGENT-1" },
    platforma: { type: "string", default: "ANDROID" },
    razmak: { type: "string", default: "30" },
    jednom: { type: "boolean", default: false },
  },
});
const datoteka = `.mdm-agent-${a.serijski}.json`;
type Stanje = { token: string; aplikacije: Record<string, number>; izvrsene: string[] };
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

async function zahtjev(put: string, tijelo: unknown, token?: string) {
  const r = await fetch(new URL(put, a.adresa), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(tijelo),
  });
  const j = (await r.json()) as Record<string, unknown>;
  if (!r.ok) throw new Error(`${put}: ${r.status} ${String(j["greska"] ?? "")}`);
  return j;
}

async function upis(): Promise<Stanje> {
  if (existsSync(datoteka)) return JSON.parse(readFileSync(datoteka, "utf8")) as Stanje;
  if (!a.kod) throw new Error("Uređaj nije upisan — navedite --kod.");
  const r = await zahtjev("/api/mdm/upis", {
    kod: a.kod,
    serijski: a.serijski,
    platforma: a.platforma,
    model: "Ispitni agent",
    verzijaAgenta: "test",
  });
  const s: Stanje = { token: String(r["token"]), aplikacije: {}, izvrsene: [] };
  writeFileSync(datoteka, JSON.stringify(s, null, 2));
  console.log(`Upisan: ${String(r["uredajId"])}`);
  return s;
}

type Odgovor = {
  naredbe: { id: string; vrsta: string; parametri: Record<string, string> }[];
  aplikacije: { id: string; paket: string; verzija: string; verzijaKod: number; sha256: string; adresa: string }[];
  profil: unknown;
};

async function krug(s: Stanje) {
  const o = (await zahtjev(
    "/api/mdm/javi",
    {
      izvjestaj: {
        baterija: 90,
        verzijaAgenta: "test",
        aplikacije: Object.entries(s.aplikacije).map(([paket, verzijaKod]) => ({ paket, verzijaKod })),
      },
    },
    s.token,
  )) as unknown as Odgovor;
  if (o.profil) console.log("Profil:", JSON.stringify(o.profil));
  const zapisi: { razina: string; poruka: string }[] = [];
  for (const n of o.naredbe) {
    if (s.izvrsene.includes(n.id)) continue;
    let rezultat = "OK";
    let uspjeh = true;
    try {
      if (n.vrsta === "INSTALIRAJ") {
        const ap = o.aplikacije.find((x) => x.id === n.parametri["aplikacijaId"]);
        if (!ap) throw new Error("Aplikacija nije dodijeljena.");
        const r = await fetch(new URL(ap.adresa, a.adresa), { headers: { Authorization: `Bearer ${s.token}` } });
        const b = Buffer.from(await r.arrayBuffer());
        if (createHash("sha256").update(b).digest("hex") !== ap.sha256) throw new Error("SHA-256 ne odgovara.");
        s.aplikacije[ap.paket] = ap.verzijaKod;
        rezultat = `Instalirano ${ap.paket} ${ap.verzija}`;
      } else if (n.vrsta === "SNIMI_ZASLON") {
        await fetch(new URL("/api/mdm/zaslon", a.adresa), {
          method: "POST",
          headers: { Authorization: `Bearer ${s.token}`, "X-Naredba": n.id },
          body: PNG,
        });
        s.izvrsene.push(n.id);
        continue;
      } else if (n.vrsta === "DEINSTALIRAJ") {
        delete s.aplikacije[n.parametri["paket"] ?? ""];
      } else rezultat = `Izvršeno: ${n.vrsta} ${JSON.stringify(n.parametri)}`;
    } catch (g) {
      uspjeh = false;
      rezultat = g instanceof Error ? g.message : String(g);
    }
    await zahtjev("/api/mdm/rezultat", { naredbaId: n.id, uspjeh, poruka: rezultat }, s.token);
    zapisi.push({ razina: uspjeh ? "INFO" : "GRESKA", poruka: `${n.vrsta}: ${rezultat}` });
    s.izvrsene.push(n.id);
    console.log(zapisi.at(-1)!.poruka);
  }
  if (zapisi.length) await zahtjev("/api/mdm/zapisnik", { zapisi }, s.token);
  writeFileSync(datoteka, JSON.stringify(s, null, 2));
}

async function glavno() {
  const s = await upis();
  for (;;) {
    await krug(s);
    if (a.jednom) return;
    await new Promise((r) => setTimeout(r, Number(a.razmak) * 1000));
  }
}

glavno().catch((g: unknown) => {
  console.error(g instanceof Error ? g.message : g);
  process.exit(1);
});
