import { describe, expect, it } from "vitest";
import { pocetno, pretrazivac, type Radnja, type Stanje } from "./pretrazivac-stanje";

const A = { id: "1", naziv: "Alfa d.o.o." };
const AB = { id: "2", naziv: "Alfa Beta d.d." };
const B = { id: "3", naziv: "Beta j.d.o.o." };

const niz = (...radnje: Radnja[]): Stanje => radnje.reduce(pretrazivac, pocetno());

describe("odabir s pretragom — brzi Enter nikad ne bira krivu stavku", () => {
  it("Enter prije nego stignu rezultati za upisani tekst: čeka pa bira prvi svježi", () => {
    let s = niz(
      { tip: "tipkanje", upit: "a" },
      { tip: "rezultati", za: "a", stavke: [A, AB, B] },
      { tip: "tipkanje", upit: "alfa b" },
      { tip: "enter" },
    );
    expect(s.odabrano).toBeNull(); // NE bira Alfa d.o.o. iz rezultata za „a“
    expect(s.cekaEnter).toBe(true);
    s = pretrazivac(s, { tip: "rezultati", za: "alfa b", stavke: [AB] });
    expect(s.odabrano).toEqual(AB);
    expect(s.upit).toBe(AB.naziv);
  });

  it("rezultati za stari upit koji stignu kasno se odbacuju", () => {
    let s = niz({ tip: "tipkanje", upit: "a" }, { tip: "tipkanje", upit: "be" }, { tip: "rezultati", za: "be", stavke: [B] });
    s = pretrazivac(s, { tip: "rezultati", za: "a", stavke: [A, AB] }); // spori odgovor za „a“
    expect(s.rezultati).toEqual([B]);
    s = pretrazivac(s, { tip: "enter" });
    expect(s.odabrano).toEqual(B);
  });

  it("Enter sa svježim rezultatima bira istaknutu stavku (strelice)", () => {
    const s = niz({ tip: "tipkanje", upit: "alfa" }, { tip: "rezultati", za: "alfa", stavke: [A, AB] }, { tip: "dolje" }, { tip: "enter" });
    expect(s.odabrano).toEqual(AB);
    expect(s.otvoren).toBe(false);
  });

  it("strelice ne pomiču istaknuto dok su rezultati zastarjeli", () => {
    const s = niz({ tip: "tipkanje", upit: "a" }, { tip: "rezultati", za: "a", stavke: [A, AB] }, { tip: "tipkanje", upit: "al" }, { tip: "dolje" });
    expect(s.istaknut).toBe(0);
  });

  it("istaknuto ne ide izvan popisa", () => {
    const s = niz(
      { tip: "tipkanje", upit: "x" },
      { tip: "rezultati", za: "x", stavke: [A] },
      { tip: "dolje" },
      { tip: "dolje" },
      { tip: "gore" },
      { tip: "gore" },
    );
    expect(s.istaknut).toBe(0);
  });

  it("Enter bez rezultata ne bira ništa; prazan upit ne čeka", () => {
    expect(niz({ tip: "tipkanje", upit: "zzz" }, { tip: "rezultati", za: "zzz", stavke: [] }, { tip: "enter" }).odabrano).toBeNull();
    expect(niz({ tip: "enter" }).cekaEnter).toBe(false);
    // čekani Enter bez ijednog rezultata: ništa se ne bira i više se ne čeka
    const s = niz({ tip: "tipkanje", upit: "q" }, { tip: "enter" }, { tip: "rezultati", za: "q", stavke: [] });
    expect(s.odabrano).toBeNull();
    expect(s.cekaEnter).toBe(false);
  });

  it("Esc zatvara popis i poništava čekani Enter", () => {
    const s = niz({ tip: "tipkanje", upit: "a" }, { tip: "enter" }, { tip: "esc" }, { tip: "rezultati", za: "a", stavke: [A] });
    expect(s.otvoren).toBe(false);
    expect(s.odabrano).toBeNull();
  });

  it("nastavak tipkanja poništava čekani Enter", () => {
    const s = niz({ tip: "tipkanje", upit: "a" }, { tip: "enter" }, { tip: "tipkanje", upit: "ab" }, { tip: "rezultati", za: "ab", stavke: [AB] });
    expect(s.odabrano).toBeNull();
  });

  it("klik bira stavku; tipkanje poništava odabir", () => {
    const s = niz({ tip: "tipkanje", upit: "b" }, { tip: "klik", stavka: B });
    expect(s.odabrano).toEqual(B);
    expect(pretrazivac(s, { tip: "tipkanje", upit: "Beta j.d.o.o" }).odabrano).toBeNull();
  });

  it("početni odabir i čišćenje", () => {
    const s = pocetno(A);
    expect(s.upit).toBe(A.naziv);
    expect(s.odabrano).toEqual(A);
    expect(pretrazivac(s, { tip: "ocisti" }).odabrano).toBeNull();
  });
});
