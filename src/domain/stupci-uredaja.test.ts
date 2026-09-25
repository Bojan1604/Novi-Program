import { describe, expect, it } from "vitest";
import { odabraniStupci } from "./stupci-uredaja";

describe("stupci popisa uređaja", () => {
  it("prazan kolačić → zadani; bez prava nema nabavne cijene", () => {
    expect(odabraniStupci(undefined, true)).toContain("nabavnaCijena");
    expect(odabraniStupci(undefined, false)).not.toContain("nabavnaCijena");
  });
  it("odabrani iz kolačića, nepoznati odbačeni, redoslijed kao u definiciji", () => {
    expect(odabraniStupci("os,cpu,nepostojeci,model", true)).toEqual(["model", "cpu", "os"]);
  });
  it("nabavna cijena ni kad je u kolačiću ako nema prava", () => {
    expect(odabraniStupci("nabavnaCijena,model", false)).toEqual(["model"]);
  });
});
