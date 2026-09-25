import type { Prisma } from "@/generated/prisma/client";
import { razlika, tekstZaPretragu, type Promjena } from "@/domain/dnevnik";

type Tx = Pick<Prisma.TransactionClient, "dnevnik" | "korisnik">;

export type ZapisDnevnika = {
  firmaId: string;
  /** null = sustav */
  korisnikId: string | null;
  radnja: string;
  entitet: string;
  entitetId?: string | null;
  opis: string;
  /** stanje prije (null kod stvaranja) i poslije (null kod brisanja) — razlika se računa sama */
  staro?: Record<string, unknown> | null;
  novo?: Record<string, unknown> | null;
  /** dodatna osjetljiva polja osim zadanih (nabavne cijene, marže) */
  osjetljiva?: readonly string[];
  /** gotove promjene umjesto staro/novo */
  promjene?: Promjena[];
  ip?: string | null;
};

/**
 * Zapis u dnevnik — pozvati u ISTOJ transakciji kao promjenu, da se zapis i promjena
 * ne mogu razići (promjena bez zapisa ili zapis bez promjene).
 */
export async function zapisiDnevnik(tx: Tx, z: ZapisDnevnika): Promise<void> {
  const promjene =
    z.promjene ?? (z.staro !== undefined || z.novo !== undefined ? razlika(z.staro ?? null, z.novo ?? null, { osjetljiva: z.osjetljiva }) : []);
  let ime = "Sustav";
  if (z.korisnikId) {
    ime = (await tx.korisnik.findUnique({ where: { id: z.korisnikId }, select: { ime: true } }))?.ime ?? "Nepoznat";
  }
  await tx.dnevnik.create({
    data: {
      firmaId: z.firmaId,
      korisnikId: z.korisnikId,
      korisnik: ime,
      radnja: z.radnja,
      entitet: z.entitet,
      entitetId: z.entitetId ?? null,
      opis: z.opis,
      promjene: promjene as unknown as Prisma.InputJsonValue,
      pretraga: tekstZaPretragu(`${z.opis} ${ime}`, promjene),
      ip: z.ip ?? null,
    },
  });
}
