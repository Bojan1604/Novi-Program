import { describe, expect, it } from "vitest";
import { provjeriUseServer } from "./use-server";

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
