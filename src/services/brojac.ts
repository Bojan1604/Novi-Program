import type { Prisma } from "@/generated/prisma/client";

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
