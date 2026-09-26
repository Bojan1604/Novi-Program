import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { provjeriDatume, provjeriPocetniBroj } from "@/domain/numeracija";
import { GreskaKorisniku } from "@/lib/greske";
import { zapisiDnevnik } from "./dnevnik";
import type { Akter } from "./korisnici";

/**
 * Sljedeći redni broj dokumenta (po firmi, vrsti i godini). Mora se pozvati u transakciji
 * dokumenta: redak brojača ostaje zaključan do kraja transakcije (drugi dokument čeka),
 * a ako transakcija ne uspije, broj se ne troši — nema rupa ni duplih brojeva.
 */
export async function sljedeciBroj(tx: Prisma.TransactionClient, firmaId: string, vrsta: string, godina: number): Promise<number> {
  const [r] = await tx.$queryRaw<{ zadnji: number }[]>`
    INSERT INTO "Brojac" ("firmaId", "vrsta", "godina", "zadnji") VALUES (${firmaId}::uuid, ${vrsta}, ${godina}, 1)
    ON CONFLICT ("firmaId", "vrsta", "godina") DO UPDATE SET "zadnji" = "Brojac"."zadnji" + 1
    RETURNING "zadnji"`;
  return r!.zadnji;
}

/**
 * Sljedeći broj uz pravila datuma (računi i slični dokumenti): redak brojača zaključan do kraja transakcije,
 * datum ne raniji od zadnjeg izdanog u istoj godini. Ako transakcija ne uspije, ni broj ni datum se ne troše.
 */
export async function sljedeciBrojSDatumom(
  tx: Prisma.TransactionClient,
  firmaId: string,
  vrsta: string,
  p: { datum: string; dospijece?: string | null; danas: string },
): Promise<number> {
  const godina = Number(p.datum.slice(0, 4));
  await tx.$executeRaw`INSERT INTO "Brojac" ("firmaId", "vrsta", "godina", "zadnji") VALUES (${firmaId}::uuid, ${vrsta}, ${godina}, 0) ON CONFLICT DO NOTHING`;
  const [b] = await tx.$queryRaw<{ zadnji: number; zadnjiDatum: Date | null }[]>`
    SELECT "zadnji", "zadnjiDatum" FROM "Brojac" WHERE "firmaId" = ${firmaId}::uuid AND "vrsta" = ${vrsta} AND "godina" = ${godina} FOR UPDATE`;
  const greska = provjeriDatume({ ...p, zadnjiUGodini: b!.zadnjiDatum ? b!.zadnjiDatum.toISOString().slice(0, 10) : null });
  if (greska) throw new GreskaKorisniku(greska);
  const redni = b!.zadnji + 1;
  await tx.$executeRaw`
    UPDATE "Brojac" SET "zadnji" = ${redni}, "zadnjiDatum" = GREATEST(COALESCE("zadnjiDatum", ${p.datum}::date), ${p.datum}::date)
    WHERE "firmaId" = ${firmaId}::uuid AND "vrsta" = ${vrsta} AND "godina" = ${godina}`;
  return redni;
}

/** Početni broj niza (npr. nastavak numeracije starog programa): sljedeći izdani dokument dobiva `pocetni`. */
export async function postaviPocetniBroj(db: PrismaClient, akter: Akter, vrsta: string, godina: number, pocetni: number): Promise<void> {
  if (!Number.isInteger(godina) || godina < 2000 || godina > 2100) throw new GreskaKorisniku("Godina nije ispravna.");
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO "Brojac" ("firmaId", "vrsta", "godina", "zadnji") VALUES (${akter.firmaId}::uuid, ${vrsta}, ${godina}, 0) ON CONFLICT DO NOTHING`;
    const [b] = await tx.$queryRaw<{ zadnji: number }[]>`
      SELECT "zadnji" FROM "Brojac" WHERE "firmaId" = ${akter.firmaId}::uuid AND "vrsta" = ${vrsta} AND "godina" = ${godina} FOR UPDATE`;
    const greska = provjeriPocetniBroj(pocetni, b!.zadnji);
    if (greska) throw new GreskaKorisniku(greska);
    await tx.brojac.update({ where: { firmaId_vrsta_godina: { firmaId: akter.firmaId, vrsta, godina } }, data: { zadnji: pocetni - 1 } });
    await zapisiDnevnik(tx, {
      firmaId: akter.firmaId,
      korisnikId: akter.korisnikId,
      ip: akter.ip,
      radnja: "brojac.pocetni",
      entitet: "Firma",
      entitetId: akter.firmaId,
      opis: `Početni broj ${vrsta} za ${godina}: ${pocetni}`,
      staro: { zadnji: b!.zadnji },
      novo: { zadnji: pocetni - 1 },
    });
  });
}
