import { describe, expect, it } from "vitest";
import { adresaKlijenta, ocistiZaglavlja, ZAGLAVLJE_IP } from "./ip.mjs";

describe("adresa klijenta", () => {
  it("bez proxyja: adresa veze, lažni X-Forwarded-For se ignorira", () => {
    expect(adresaKlijenta({ "x-forwarded-for": "1.2.3.4" }, "::ffff:192.168.1.20", false)).toBe("192.168.1.20");
  });

  it("iza proxyja: zadnja adresa (dopisao ju je naš proxy), ne prva (poslao ju je klijent)", () => {
    expect(adresaKlijenta({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }, "127.0.0.1", true)).toBe("203.0.113.9");
    expect(adresaKlijenta({}, "10.0.0.5", true)).toBe("10.0.0.5");
  });

  it("zaglavlja proxyja brišu se kad mu se ne vjeruje; postavlja se naše zaglavlje", () => {
    const req = {
      headers: { "x-forwarded-for": "1.2.3.4", "x-forwarded-proto": "https", [ZAGLAVLJE_IP]: "9.9.9.9", host: "a" },
      socket: { remoteAddress: "192.168.1.7" },
    };
    ocistiZaglavlja(req as never, false);
    // lažni „https“ od klijenta zamijenjen stvarnim protokolom veze
    expect(req.headers).toEqual({ host: "a", [ZAGLAVLJE_IP]: "192.168.1.7", "x-forwarded-proto": "http" });
  });

  it("bez proxyja preko HTTPS-a (HTTPS=1): protokol iz šifrirane veze", () => {
    const req = { headers: {} as Record<string, string>, socket: { remoteAddress: "192.168.1.8", encrypted: true } };
    ocistiZaglavlja(req as never, false);
    expect(req.headers["x-forwarded-proto"]).toBe("https");
  });

  it("iza proxyja zaglavlja ostaju (Secure kolačić ovisi o x-forwarded-proto)", () => {
    const req = {
      headers: { "x-forwarded-for": "5.5.5.5", "x-forwarded-proto": "https" } as Record<string, string>,
      socket: { remoteAddress: "127.0.0.1" },
    };
    ocistiZaglavlja(req as never, true);
    expect(req.headers["x-forwarded-proto"]).toBe("https");
    expect(req.headers[ZAGLAVLJE_IP]).toBe("5.5.5.5");
  });
});
