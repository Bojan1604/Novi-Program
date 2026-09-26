import { danas, dodajDane, type Datum } from "../../src/domain/datum";
import { pravaClana, type Akter } from "../../src/services/korisnici";
import { spremiNarudzbenicu, zaprimiPoNarudzbenici } from "../../src/services/nabava";
import { platiUlazni, spremiUlazniRacun } from "../../src/services/ulazni-racuni";
import type { DemoKontekst } from "./index";

/**
 * Nabava kroz iste servise kao program: narudžbenice domaćim dobavljačima (kronološki, zadnjih ~4 mjeseca),
 * zaprimanje po narudžbenici (cijelo ili djelomično), ulazni računi za robu i dio plaćanja. Najnovije ostaju otvorene.
 */
export async function demoNabava(k: DemoKontekst): Promise<void> {
  const { prisma, firmaId, s } = k;
  const akter = async (uloga: string): Promise<Akter> => {
    const korisnikId = k.korisnici[uloga] ?? k.korisnici["Administrator"]!;
    return { firmaId, korisnikId, prava: (await pravaClana(prisma, firmaId, korisnikId))! };
  };
  const admin = await akter("Administrator");
  const skladistar = await akter("Skladištar");
  const dobavljaci = await prisma.partner.findMany({
    where: { firmaId, dobavljac: true, aktivan: true, drzava: "HR" },
    orderBy: { naziv: "asc" },
    select: { id: true },
    take: 50,
  });
  const modeli = await prisma.modelUredaja.findMany({
    where: { firmaId, aktivan: true },
    orderBy: { naziv: "asc" },
    select: { id: true, preporucenaCijena: true },
  });
  const skladiste = await prisma.skladiste.findFirst({ where: { firmaId, aktivan: true }, orderBy: { naziv: "asc" }, select: { id: true } });
  if (!dobavljaci.length || !modeli.length || !skladiste) return;

  const broj = Math.min(200, Math.max(5, Math.floor(k.kolicine.racuna / 20)));
  const danasnji = danas();
  const pocetak = dodajDane(danasnji, -120);
  const najkasnije = (d: Datum) => (d > danasnji ? danasnji : d);
  let serijski = 0;
  let racuna = 0;
  for (let i = 0; i < broj; i++) {
    const datum = dodajDane(pocetak, Math.floor((i * 118) / broj));
    const dobavljacId = s.izaberi(dobavljaci).id;
    const stavke = Array.from({ length: s.cijeli(1, 3) }, () => {
      const m = s.izaberi(modeli);
      const preporucena = Math.round(Number(m.preporucenaCijena ?? 500) * 100);
      return { modelId: m.id, kolicina: s.cijeli(2, 8), cijena: Math.round((preporucena * s.cijeli(70, 82)) / 100) };
    });
    // isti model dvaput na narudžbenici spojen u jednu stavku
    const poModelu = new Map<string, (typeof stavke)[number]>();
    for (const x of stavke) {
      const y = poModelu.get(x.modelId);
      if (y) y.kolicina += x.kolicina;
      else poModelu.set(x.modelId, { ...x });
    }
    const n = await spremiNarudzbenicu(prisma, admin, null, {
      datum,
      dobavljacId,
      napomena: s.vjerojatnost(0.3) ? "Isporuka na skladište, najava dan ranije." : null,
      stavke: [...poModelu.values()],
      verzija: 0,
    });
    // najnovije narudžbenice još čekaju isporuku
    if (i >= broj - 2) continue;
    const datumPrimke = najkasnije(dodajDane(datum, s.cijeli(2, 10)));
    const djelomicno = s.vjerojatnost(0.2);
    const stavkeNar = await prisma.stavkaNarudzbenice.findMany({
      where: { firmaId, narudzbenicaId: n.id },
      orderBy: { redoslijed: "asc" },
      select: { id: true, kolicina: true, cijena: true },
    });
    let osnovica = 0;
    const zaprimanje = stavkeNar.map((st) => {
      const kolicina = djelomicno ? Math.max(1, Math.floor(st.kolicina / 2)) : st.kolicina;
      osnovica += kolicina * Math.round(Number(st.cijena) * 100);
      return { stavkaId: st.id, serijski: Array.from({ length: kolicina }, () => `NAB${String(++serijski).padStart(7, "0")}`) };
    });
    const brojOtpremnice = `OTP-${s.cijeli(1000, 9999)}`;
    const primka = await zaprimiPoNarudzbenici(prisma, skladistar, n.id, {
      datum: datumPrimke,
      skladisteId: skladiste.id,
      dokumentDobavljaca: brojOtpremnice,
      knjiziUTroskove: false,
      stavke: zaprimanje,
    });
    // ulazni račun za zaprimljenu robu (veza na primku → i na narudžbenicu)
    const r = await spremiUlazniRacun(prisma, admin, null, {
      broj: `${s.cijeli(100, 9999)}-1-1`,
      datum: datumPrimke,
      dospijece: dodajDane(datumPrimke, 30),
      dobavljacId,
      dobavljacTekst: null,
      dobavljacOib: null,
      narudzbenicaId: n.id,
      primkaId: primka.id,
      zaRobu: true,
      osnovica,
      pdv: Math.round(osnovica / 4),
      opis: `Roba po ${n.broj}, otpremnica ${brojOtpremnice}`,
      verzija: 0,
    });
    if (!r.ok) throw new Error(`Demo nabava: ${JSON.stringify(r.polja)}`);
    racuna++;
    const datumPlacanja = dodajDane(datumPrimke, s.cijeli(5, 35));
    if (datumPlacanja <= danasnji && s.vjerojatnost(0.8)) {
      const ukupno = osnovica + Math.round(osnovica / 4);
      await platiUlazni(prisma, admin, r.id, { datum: datumPlacanja, iznos: s.vjerojatnost(0.85) ? ukupno : Math.round(ukupno / 2) });
    }
  }
  k.log(`Nabava: ${broj} narudžbenica, ${racuna} ulaznih računa, ${serijski} uređaja zaprimljeno`);
}
