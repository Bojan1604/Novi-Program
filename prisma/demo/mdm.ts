import { pravaClana, type Akter } from "../../src/services/korisnici";
import { javiSe, spremiOrganizaciju, upisiUredaj } from "../../src/services/mdm";
import type { DemoKontekst } from "./index";

/**
 * MDM kroz iste servise kao program: distributer (vezan na partnera) s dvije organizacije klijenata
 * i nekoliko uređaja upisanih kodom organizacije (kao agent), svaki se jednom javio s izvještajem.
 */
export async function demoMdm(k: DemoKontekst): Promise<void> {
  const { prisma, firmaId, s } = k;
  const korisnikId = k.korisnici["Administrator"]!;
  const A: Akter = { firmaId, korisnikId, prava: (await pravaClana(prisma, firmaId, korisnikId))! };
  // klijenti: najmoprimci (njihovi uređaji se upisuju); distributer: drugi aktivni kupac
  const klijenti: { id: string; naziv: string }[] = [];
  for (let i = 0; i < 2; i++) {
    const u = await prisma.uredaj.findFirst({
      where: { firmaId, stanje: "U_NAJMU", partnerId: { not: null, notIn: klijenti.map((x) => x.id) } },
      orderBy: { serijski: "asc" },
      select: { partner: { select: { id: true, naziv: true } } },
    });
    if (u?.partner) klijenti.push(u.partner);
  }
  const distributer = await prisma.partner.findFirst({
    where: { firmaId, kupac: true, aktivan: true, drzava: "HR", id: { notIn: klijenti.map((x) => x.id) } },
    orderBy: { naziv: "desc" },
    select: { id: true, naziv: true },
  });
  if (!distributer) return;

  const dId = await spremiOrganizaciju(prisma, A, null, {
    naziv: distributer.naziv,
    vrsta: "DISTRIBUTER",
    nadredenaId: null,
    partnerId: distributer.id,
    aktivna: true,
  });
  let upisano = 0;
  for (const kl of klijenti) {
    const oId = await spremiOrganizaciju(prisma, A, null, { naziv: kl.naziv, vrsta: "KLIJENT", nadredenaId: dId, partnerId: kl.id, aktivna: true });
    const { kodUpisa } = await prisma.mdmOrganizacija.findUniqueOrThrow({ where: { id: oId }, select: { kodUpisa: true } });
    const uredaji = await prisma.uredaj.findMany({
      where: { firmaId, partnerId: kl.id, stanje: "U_NAJMU" },
      orderBy: { serijski: "asc" },
      take: 3,
      select: { serijski: true, os: true, model: { select: { naziv: true, kategorija: { select: { naziv: true } } } } },
    });
    for (const [i, u] of uredaji.entries()) {
      const android = ["Tablet", "Mobitel"].includes(u.model.kategorija.naziv);
      const { token } = await upisiUredaj(
        prisma,
        {
          kod: kodUpisa,
          serijski: u.serijski,
          platforma: android ? "ANDROID" : "WINDOWS",
          naziv: `${android ? "TAB" : "PC"}-${String(i + 1).padStart(2, "0")}`,
          model: u.model.naziv,
          osVerzija: android ? "Android 14" : "Windows 11 Pro 23H2",
          verzijaAgenta: "1.4.2",
        },
        null,
      );
      await javiSe(prisma, token, {
        baterija: s.cijeli(35, 100),
        slobodno: `${s.cijeli(20, 400)} GB`,
        ip: `192.168.1.${s.cijeli(10, 250)}`,
        aplikacija: "ERP skener 2.1",
      });
      upisano++;
    }
  }
  k.log(`MDM: ${klijenti.length + 1} organizacije, ${upisano} uređaja`);
}
