import { OTVORENI_STATUSI } from "../../src/domain/servis";
import { pravaClana, type Akter } from "../../src/services/korisnici";
import { dodajKlijentaPortala, novaPoveznicaKlijenta, postaviLozinkuPoveznicom } from "../../src/services/portal-pristup";
import { prijaviKvarPortal } from "../../src/services/servis";
import type { DemoKontekst } from "./index";

/** Prijava na portal klijenta u demo: klijent1@demo.hr / klijent2@demo.hr, lozinka Portal-lozinka-2026 */
export const DEMO_LOZINKA_PORTALA = "Portal-lozinka-2026";

/**
 * Pristup portalu za dva kupca s uređajima (najam i kupljeni) — kroz iste servise kao program:
 * dodavanje klijenta, poveznica za lozinku, klijent postavlja lozinku; jedna prijava kvara s portala.
 */
export async function demoPortal(k: DemoKontekst): Promise<void> {
  const { prisma, firmaId } = k;
  const korisnikId = k.korisnici["Voditelj"] ?? k.korisnici["Administrator"]!;
  const A: Akter = { firmaId, korisnikId, prava: (await pravaClana(prisma, firmaId, korisnikId))! };
  // kupci s uređajima: prvo najmoprimac, zatim kupac (različiti partneri)
  const partneri: { id: string; ime: string }[] = [];
  for (const stanje of ["U_NAJMU", "PRODAN"] as const) {
    const u = await prisma.uredaj.findFirst({
      where: { firmaId, stanje, partnerId: { not: null, notIn: partneri.map((p) => p.id) }, partner: { aktivan: true } },
      orderBy: { serijski: "asc" },
      select: { partner: { select: { id: true, naziv: true } } },
    });
    if (u?.partner) partneri.push({ id: u.partner.id, ime: u.partner.naziv });
  }
  const imena = ["Iva Horvat", "Marko Babić"];
  for (const [i, p] of partneri.entries()) {
    const { id } = await dodajKlijentaPortala(prisma, A, p.id, { ime: imena[i]!, email: `klijent${i + 1}@demo.hr` });
    // poveznica koju bi klijent dobio e-poštom; klijent sam postavlja lozinku
    const token = await novaPoveznicaKlijenta(prisma, A, id);
    await postaviLozinkuPoveznicom(prisma, token, DEMO_LOZINKA_PORTALA);
  }

  // prijava kvara s portala (prvi klijent, uređaj bez otvorenog naloga)
  const prvi = partneri[0];
  if (prvi) {
    const uredaj = await prisma.uredaj.findFirst({
      where: {
        firmaId,
        partnerId: prvi.id,
        stanje: { in: ["U_NAJMU", "PRODAN"] },
        servisniNalozi: { none: { status: { in: [...OTVORENI_STATUSI] } } },
      },
      orderBy: { serijski: "asc" },
      select: { id: true },
    });
    if (uredaj)
      await prijaviKvarPortal(
        prisma,
        { firmaId, partnerId: prvi.id, ip: null, ime: imena[0]! },
        { uredajId: uredaj.id, opisKvara: "Uređaj se sam gasi nakon desetak minuta rada.", kontakt: "091 555 1234" },
        [],
      );
  }
  k.log(`Portal: ${partneri.length} klijenta (lozinka ${DEMO_LOZINKA_PORTALA})`);
}
