import { describe, expect, it } from "vitest";
import { NAJVECI_PRILOG, ocistiNaziv, provjeriPrilog, smijePrikazati, velicinaZaPrikaz, zaglavljeDatoteke } from "./prilozi";

describe("provjera priloga", () => {
  it("dopuštena vrsta po nastavku (bez obzira na velika slova)", () => {
    expect(provjeriPrilog("Račun dobavljača.PDF", 1000)).toEqual({ ok: true, naziv: "Račun dobavljača.PDF", vrsta: "application/pdf" });
    expect(provjeriPrilog("slika.jpeg", 5)).toEqual({ ok: true, naziv: "slika.jpeg", vrsta: "image/jpeg" });
  });

  it("odbija nedopušteno, prazno, preveliko i bez naziva", () => {
    expect(provjeriPrilog("virus.exe", 10)).toEqual({ ok: false, greska: expect.stringContaining("nije dopuštena") });
    expect(provjeriPrilog("stranica.html", 10).ok).toBe(false);
    expect(provjeriPrilog("slika.svg", 10).ok).toBe(false);
    expect(provjeriPrilog("bez-nastavka", 10).ok).toBe(false);
    expect(provjeriPrilog("a.pdf", 0)).toEqual({ ok: false, greska: "Datoteka „a.pdf“ je prazna." });
    expect(provjeriPrilog("a.pdf", NAJVECI_PRILOG)).toMatchObject({ ok: true });
    expect(provjeriPrilog("a.pdf", NAJVECI_PRILOG + 1)).toEqual({ ok: false, greska: "Datoteka „a.pdf“ je veća od 10 MB." });
    expect(provjeriPrilog("", 10).ok).toBe(false);
    expect(provjeriPrilog(".pdf", 10).ok).toBe(false);
  });

  it("naziv bez putanje i opasnih znakova; dugi naziv čuva nastavak", () => {
    expect(ocistiNaziv("C:\\Users\\ana\\ugovor.pdf")).toBe("ugovor.pdf");
    expect(ocistiNaziv("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(ocistiNaziv('a"b<c>\n.pdf')).toBe("abc.pdf");
    const dug = ocistiNaziv(`${"x".repeat(300)}.xlsx`);
    expect(dug).toHaveLength(150);
    expect(dug.endsWith(".xlsx")).toBe(true);
  });

  it("u pregledniku se prikazuju samo sigurne vrste", () => {
    expect(smijePrikazati("application/pdf")).toBe(true);
    expect(smijePrikazati("application/zip")).toBe(false);
    expect(smijePrikazati("application/xml")).toBe(false);
  });

  it("zaglavlje s hrvatskim znakovima", () => {
    expect(zaglavljeDatoteke("Račun š.pdf", false)).toBe(`attachment; filename="Racun s.pdf"; filename*=UTF-8''Ra%C4%8Dun%20%C5%A1.pdf`);
    expect(zaglavljeDatoteke("a.png", true).startsWith("inline;")).toBe(true);
  });

  it("veličina za prikaz", () => {
    expect(velicinaZaPrikaz(512)).toBe("512 B");
    expect(velicinaZaPrikaz(2048)).toBe("2 KB");
    expect(velicinaZaPrikaz(1.5 * 1024 * 1024)).toBe("1,5 MB");
  });
});
