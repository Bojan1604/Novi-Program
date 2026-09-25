import { describe, expect, it } from "vitest";
import { iznimkeIzObrasca, pravaIzObrasca } from "./obrazac";

describe("čitanje prava iz obrasca", () => {
  it("prava uloge; nepoznato se ignorira", () => {
    const fd = new FormData();
    fd.set("modul.prodaja", "puno");
    fd.set("modul.najam", "sve");
    fd.set("modul.izmisljeno", "puno");
    fd.set("posebno.costs", "on");
    const p = pravaIzObrasca(fd);
    expect(p.moduli.prodaja).toBe("puno");
    expect(p.moduli.najam).toBe("nema");
    expect(p.posebna.costs).toBe(true);
    expect(p.posebna.log).toBe(false);
  });

  it("iznimke: prazno = prema ulozi", () => {
    const fd = new FormData();
    fd.set("iznimka.modul.prodaja", "");
    fd.set("iznimka.modul.najam", "pregled");
    fd.set("iznimka.posebno.costs", "ne");
    fd.set("iznimka.posebno.log", "");
    expect(iznimkeIzObrasca(fd)).toEqual({ moduli: { najam: "pregled" }, posebna: { costs: false } });
  });
});
