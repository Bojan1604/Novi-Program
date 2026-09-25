import { describe, expect, it } from "vitest";
import { provjeriPristupStranice, provjeriUnutarnjiUseServer, provjeriUseServer, provjeriZastituAkcija } from "./use-server";

const sDirektivom = (kod: string) => `"use server";\n${kod}`;

describe("provjeriUseServer — dopušteno", () => {
  it.each([
    ["async funkcija", "export async function spremi() {}"],
    ["default async funkcija", "export default async function spremi() {}"],
    ["async strelica", "export const spremi = async () => {};"],
    ["async function izraz", "export const spremi = async function () {};"],
    ["tipovi i sučelja", "export type A = string;\nexport interface B { x: number }\nexport type { C } from './c';"],
    ["neizvezene pomoćne stvari", "const x = 1;\nfunction pomoc() {}\nexport async function spremi() { return x; }"],
  ])("%s", (_, kod) => {
    expect(provjeriUseServer(sDirektivom(kod))).toEqual([]);
  });

  it("datoteka bez direktive se ne provjerava", () => {
    expect(provjeriUseServer("export const x = 1;")).toEqual([]);
  });

  it("direktiva koja nije na vrhu se ne računa (Next je tada ignorira)", () => {
    expect(provjeriUseServer('import x from "x";\n"use server";\nexport const y = 1;')).toEqual([]);
  });
});

describe("provjeriUseServer — zabranjeno", () => {
  it.each([
    ["konstanta", "export const LIMIT = 10;"],
    ["sinkrona funkcija", "export function spremi() {}"],
    ["sinkrona strelica", "export const spremi = () => {};"],
    ["objekt", "export const shema = { a: 1 };"],
    ["re-export", "export { spremi } from './spremi';"],
    ["export zvjezdica", "export * from './spremi';"],
    ["enum", "export enum Stanje { A }"],
    ["klasa", "export class Servis {}"],
    ["default nije async", "export default function spremi() {}"],
    ["default vrijednost", "export default 5;"],
  ])("%s", (_, kod) => {
    const greske = provjeriUseServer(sDirektivom(kod), "src/app/akcije.ts");
    expect(greske).toHaveLength(1);
    expect(greske[0]).toMatch(/^src\/app\/akcije\.ts:2 — /);
  });

  it("javlja svaku grešku posebno", () => {
    const kod = "export const A = 1;\nexport async function ok() {}\nexport function b() {}";
    expect(provjeriUseServer(sDirektivom(kod))).toHaveLength(2);
  });

  it("radi i s jednostrukim navodnicima i .tsx", () => {
    expect(provjeriUseServer("'use server'\nexport const A = 1;", "a.tsx")).toHaveLength(1);
  });
});

describe("provjeriZastituAkcija", () => {
  it("akcija koja poziva akcija(…) je u redu", () => {
    const kod = '"use server";\nexport async function spremi(fd: FormData) {\n  return akcija("x.y", async (k) => ({ ok: true }));\n}';
    expect(provjeriZastituAkcija(kod)).toEqual([]);
  });

  it("javna akcija s razlogom je u redu", () => {
    const kod = '"use server";\n// javna akcija: prijava se radi prije sesije\nexport async function prijaviSe() {}';
    expect(provjeriZastituAkcija(kod)).toEqual([]);
  });

  it("akcija bez provjere prava je greška", () => {
    const kod = '"use server";\nexport async function obrisiSve() {\n  await db.x.deleteMany();\n}';
    const g = provjeriZastituAkcija(kod, "a.ts");
    expect(g).toHaveLength(1);
    expect(g[0]).toContain("obrisiSve");
  });

  it("oznaka bez razloga nije dovoljna", () => {
    expect(provjeriZastituAkcija('"use server";\n// javna akcija:\nexport async function x() {}')).toHaveLength(1);
  });

  it("datoteka bez 'use server' se ne provjerava", () => {
    expect(provjeriZastituAkcija("export async function x() {}")).toEqual([]);
  });
});

describe("ništa prije provjere prava", () => {
  it("await prije akcija(…) je greška (npr. brisanje prije provjere)", () => {
    const kod =
      '"use server";\nexport async function x() {\n  await db.uloga.deleteMany();\n  return akcija("uloge.obrisi", async () => ({ ok: true }));\n}';
    expect(provjeriZastituAkcija(kod)).toEqual([expect.stringContaining("prije provjere prava")]);
  });

  it("sinkrone pripreme prije akcija(…) su u redu; await unutar akcija je u redu", () => {
    const kod =
      '"use server";\nexport async function x(k: string) {\n  const def = definicija(k);\n  if (!def) return { ok: false };\n  const r = await akcija("a.b", async () => { await db.x(); return { ok: true }; });\n  if (r.ok) redirect("/");\n  return r;\n}';
    expect(provjeriZastituAkcija(kod)).toEqual([]);
  });
});

describe("'use server' unutar funkcije", () => {
  it("je zabranjen", () => {
    expect(provjeriUnutarnjiUseServer('export default function P() {\n  async function spremi() {\n    "use server";\n  }\n}', "p.tsx")).toHaveLength(
      1,
    );
    expect(provjeriUnutarnjiUseServer('"use server";\nexport async function a() {}')).toEqual([]);
  });
});

describe("stranice i rute provjeravaju pristup", () => {
  it("stranica bez provjere je greška", () => {
    expect(provjeriPristupStranice("export default async function P() { return null; }", "p.tsx", "stranica")).toHaveLength(1);
    expect(provjeriPristupStranice('const k = await pristupStranici("/x");', "p.tsx", "stranica")).toEqual([]);
    expect(provjeriPristupStranice("// javna stranica: poruka o grešci\nexport default function P() {}", "p.tsx", "stranica")).toEqual([]);
  });

  it("ruta bez pristupApi je greška", () => {
    expect(provjeriPristupStranice("export async function GET() {}", "r.ts", "ruta")).toHaveLength(1);
    expect(provjeriPristupStranice('const k = await pristupApi({ posebno: "log" });', "r.ts", "ruta")).toEqual([]);
  });
});
