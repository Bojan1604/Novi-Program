import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { procitajUpis } from "@/domain/mdm";
import { napraviFirmu, napraviKorisnika, ocistiBazu, testnaPrisma } from "@/test/baza";
import { pravaClana, type Akter } from "./korisnici";
import { spremiOrganizaciju, upisiUredaj } from "./mdm";
import {
  aplikacijaZaAgenta,
  datotekaZaAgenta,
  dodajAplikaciju,
  dodajDatoteku,
  dodijeliAplikaciju,
  javljanjeAgenta,
  otkaziNaredbu,
  posaljiNaredbu,
  rezultatNaredbe,
  snimkaAgenta,
  spremiProfil,
  zapisnikAgenta,
} from "./mdm-upravljanje";

const prisma = testnaPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => ocistiBazu(prisma));

const apk = (n = 100) => ({ naziv: "app.apk", sadrzaj: new Uint8Array(n).fill(7) });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

async function pripremi() {
  const firma = await napraviFirmu(prisma);
  const akter = async (uloga: string) => {
    const k = await napraviKorisnika(prisma, firma.id, { uloga });
    return { firmaId: firma.id, korisnikId: k.id, prava: (await pravaClana(prisma, firma.id, k.id))! } satisfies Akter;
  };
  const A = await akter("Administrator");
  const V = await akter("Voditelj");
  const d1 = await spremiOrganizaciju(prisma, A, null, { naziv: "D1", vrsta: "DISTRIBUTER", nadredenaId: null, partnerId: null, aktivna: true });
  const k1 = await spremiOrganizaciju(prisma, A, null, { naziv: "K1", vrsta: "KLIJENT", nadredenaId: d1, partnerId: null, aktivna: true });
  const d2 = await spremiOrganizaciju(prisma, A, null, { naziv: "D2", vrsta: "DISTRIBUTER", nadredenaId: null, partnerId: null, aktivna: true });
  const upis = async (org: string, serijski: string, platforma: "ANDROID" | "WINDOWS" = "ANDROID") => {
    const kod = (await prisma.mdmOrganizacija.findUniqueOrThrow({ where: { id: org } })).kodUpisa;
    const r = procitajUpis({ kod, serijski, platforma });
    if (!r.ok) throw new Error(r.greska);
    return upisiUredaj(prisma, r.vrijednost, null);
  };
  return { firma, A, V, d1, k1, d2, upis };
}

describe("MDM: nova verzija aplikacije stiže na uređaje", () => {
  it("dodjela distributeru vrijedi za klijenta ispod; instalacija jednom; nova verzija ponovno", async () => {
    const { A, d1, k1, d2, upis } = await pripremi();
    const t = await upis(k1, "TAB-1");
    const tudji = await upis(d2, "TAB-2");
    const v1 = await dodajAplikaciju(prisma, A, {
      naziv: "Firma",
      paket: "com.firma.app",
      platforma: "ANDROID",
      verzija: "1.0",
      verzijaKod: 1,
      datoteka: apk(),
    });
    await dodijeliAplikaciju(prisma, A, d1, { paket: "com.firma.app", platforma: "ANDROID" }, true);

    const o1 = (await javljanjeAgenta(prisma, t.token, { aplikacije: [] }))!;
    expect(o1.aplikacije.map((a) => a.id)).toEqual([v1]);
    expect(o1.naredbe).toEqual([expect.objectContaining({ vrsta: "INSTALIRAJ", parametri: { aplikacijaId: v1 } })]);
    const o2 = (await javljanjeAgenta(prisma, t.token, { aplikacije: [] }))!;
    expect(o2.naredbe).toHaveLength(1); // ista naredba, ne nova
    expect(await rezultatNaredbe(prisma, tudji.token, { naredbaId: o2.naredbe[0]!.id, uspjeh: true, poruka: null })).toBe(false);
    expect(await rezultatNaredbe(prisma, t.token, { naredbaId: o2.naredbe[0]!.id, uspjeh: true, poruka: "OK" })).toBe(true);
    expect((await javljanjeAgenta(prisma, t.token, { aplikacije: [{ paket: "com.firma.app", verzijaKod: 1 }] }))!.naredbe).toEqual([]);
    expect(await aplikacijaZaAgenta(prisma, t.token, v1)).not.toBeNull();
    expect(await aplikacijaZaAgenta(prisma, tudji.token, v1)).toBeNull();

    await expect(
      dodajAplikaciju(prisma, A, { naziv: "Firma", paket: "com.firma.app", platforma: "ANDROID", verzija: "0.9", verzijaKod: 1, datoteka: apk() }),
    ).rejects.toThrow("veći broj");
    await expect(
      dodajAplikaciju(prisma, A, {
        naziv: "Firma",
        paket: "com.firma.app",
        platforma: "ANDROID",
        verzija: "2",
        verzijaKod: 2,
        datoteka: { naziv: "a.msi", sadrzaj: new Uint8Array(3) },
      }),
    ).rejects.toThrow("APK");
    const v2 = await dodajAplikaciju(prisma, A, {
      naziv: "Firma",
      paket: "com.firma.app",
      platforma: "ANDROID",
      verzija: "2.0",
      verzijaKod: 2,
      datoteka: apk(200),
    });
    const o3 = (await javljanjeAgenta(prisma, t.token, { aplikacije: [{ paket: "com.firma.app", verzijaKod: 1 }] }))!;
    expect(o3.naredbe).toEqual([expect.objectContaining({ vrsta: "INSTALIRAJ", parametri: { aplikacijaId: v2 } })]);
    expect(o3.aplikacije.map((a) => a.verzija)).toEqual(["2.0"]);
    expect((await javljanjeAgenta(prisma, tudji.token, { aplikacije: [] }))!.naredbe).toEqual([]);
  });
});

describe("MDM: profili, naredbe, datoteke, zaslon, zapisnik", () => {
  it("važeći profil s distributera; Wi-Fi lozinka šifrirana u bazi, agentu čista, nikad u dnevniku", async () => {
    const { A, d1, k1, upis } = await pripremi();
    const t = await upis(k1, "TAB-1");
    await spremiProfil(prisma, A, null, {
      naziv: "Opći",
      organizacijaId: null,
      platforma: "ANDROID",
      postavke: {},
      wifiLozinka: null,
      aktivan: true,
    });
    await spremiProfil(prisma, A, null, {
      naziv: "Distributer",
      organizacijaId: d1,
      platforma: "ANDROID",
      postavke: { lozinkaMin: "6", kameraDopustena: false, wifiSsid: "Ured" },
      wifiLozinka: "Tajna-wifi-99",
      aktivan: true,
    });
    const o = (await javljanjeAgenta(prisma, t.token, {}))!;
    expect(o.profil).toMatchObject({ lozinkaMin: 6, kameraDopustena: false, wifiSsid: "Ured", wifiLozinka: "Tajna-wifi-99", verzija: 1 });
    const p = await prisma.mdmProfil.findFirstOrThrow({ where: { naziv: "Distributer" } });
    expect(p.wifiLozinka).not.toContain("Tajna-wifi-99");
    expect(JSON.stringify(await prisma.dnevnik.findMany())).not.toContain("Tajna-wifi-99");
  });

  it("naredbe: platforma, puno pravo za brisanje, blokiran uređaj, otkaz; snimka i zapisnik samo za svoj uređaj", async () => {
    const { A, V, k1, upis } = await pripremi();
    const t = await upis(k1, "TAB-1");
    const w = await upis(k1, "PC-1", "WINDOWS");
    await expect(posaljiNaredbu(prisma, A, t.id, "SNIMI_ZASLON", {})).rejects.toThrow("Androidu");
    await expect(posaljiNaredbu(prisma, V, t.id, "OBRISI_PODATKE", {})).rejects.toThrow("puno pravo");
    const brisi = await posaljiNaredbu(prisma, A, t.id, "OBRISI_PODATKE", {});
    await otkaziNaredbu(prisma, A, brisi);
    const poruka = await posaljiNaredbu(prisma, V, t.id, "PORUKA", { tekst: "Vratite tablet" });
    const o = (await javljanjeAgenta(prisma, t.token, {}))!;
    expect(o.naredbe.map((n) => [n.id, n.parametri])).toEqual([[poruka, { tekst: "Vratite tablet" }]]);

    const snimi = await posaljiNaredbu(prisma, A, w.id, "SNIMI_ZASLON", {});
    await expect(snimkaAgenta(prisma, w.token, snimi, new Uint8Array([1, 2, 3]))).rejects.toThrow("PNG");
    expect(await snimkaAgenta(prisma, "lazni-token-lazni-token-lazni", snimi, PNG)).toBe(false);
    expect(await snimkaAgenta(prisma, w.token, snimi, PNG)).toBe(true);
    expect((await prisma.mdmNaredba.findUniqueOrThrow({ where: { id: snimi } })).status).toBe("IZVRSENA");
    // snimka tuđe naredbe se sprema uz uređaj koji ju je poslao, a tuđa naredba ostaje netaknuta
    expect(await snimkaAgenta(prisma, t.token, snimi, PNG)).toBe(true);
    expect(await prisma.mdmSnimka.count({ where: { mdmUredajId: t.id, naredbaId: null } })).toBe(1);

    expect(await zapisnikAgenta(prisma, t.token, [{ razina: "GRESKA", poruka: "Instalacija nije uspjela" }, { poruka: "" }, 5])).toBe(1);
    expect(await zapisnikAgenta(prisma, "lazni-token-lazni-token-lazni", [{ poruka: "x" }])).toBeNull();

    await prisma.mdmUredaj.update({ where: { id: t.id }, data: { stanje: "BLOKIRAN" } });
    await expect(posaljiNaredbu(prisma, A, t.id, "ZAKLJUCAJ", {})).rejects.toThrow("blokiran");
    expect(await javljanjeAgenta(prisma, t.token, {})).toBeNull();
  });

  it("datoteke idu uređajima organizacije i organizacija ispod; tuđi uređaj ih ne može preuzeti", async () => {
    const { A, d1, k1, d2, upis } = await pripremi();
    const t = await upis(k1, "TAB-1");
    const tudji = await upis(d2, "TAB-2");
    const id = await dodajDatoteku(prisma, A, d1, { putanja: "Download/Firma", datoteka: { naziv: "upute.pdf", sadrzaj: new Uint8Array(10) } });
    await expect(dodajDatoteku(prisma, A, d1, { putanja: "../../etc", datoteka: { naziv: "x", sadrzaj: new Uint8Array(1) } })).rejects.toThrow("..");
    expect((await javljanjeAgenta(prisma, t.token, {}))!.datoteke.map((d) => [d.naziv, d.putanja])).toEqual([["upute.pdf", "Download/Firma"]]);
    expect((await javljanjeAgenta(prisma, tudji.token, {}))!.datoteke).toEqual([]);
    expect(await datotekaZaAgenta(prisma, t.token, id)).not.toBeNull();
    expect(await datotekaZaAgenta(prisma, tudji.token, id)).toBeNull();
  });
});
