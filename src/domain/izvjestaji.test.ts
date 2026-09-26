import { describe, expect, it } from "vitest";
import { godineZaOdabir, granice, procitajRazdoblje } from "./izvjestaji";

describe("razdoblje izvještaja", () => {
  it("zadano je tekuća godina; „sve“ bez granica; neispravno se zanemaruje", () => {
    expect(procitajRazdoblje({}, "2026-09-26")).toEqual({ godina: 2026, od: null, do: null });
    expect(procitajRazdoblje({ godina: "sve" }, "2026-09-26")).toMatchObject({ godina: "sve" });
    expect(procitajRazdoblje({ godina: "abc", od: "2026-02-30", do: "x" }, "2026-09-26")).toEqual({ godina: 2026, od: null, do: null });
  });

  it("godina i od–do se sijeku", () => {
    expect(granice({ godina: 2026, od: null, do: null })).toEqual({ od: "2026-01-01", do: "2026-12-31" });
    expect(granice({ godina: "sve", od: null, do: null })).toEqual({ od: null, do: null });
    expect(granice({ godina: 2026, od: "2026-03-01", do: null })).toEqual({ od: "2026-03-01", do: "2026-12-31" });
    expect(granice({ godina: 2026, od: "2025-06-01", do: "2027-02-01" })).toEqual({ od: "2026-01-01", do: "2026-12-31" });
    expect(granice({ godina: "sve", od: "2025-06-01", do: "2025-06-30" })).toEqual({ od: "2025-06-01", do: "2025-06-30" });
  });

  it("godine za odabir", () => {
    expect(godineZaOdabir(2024, "2026-01-05")).toEqual([2026, 2025, 2024]);
    expect(godineZaOdabir(null, "2026-01-05")).toEqual([2026]);
  });
});
