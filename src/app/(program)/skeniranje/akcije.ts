"use server";

import { akcija } from "@/lib/akcija";
import { uredajiPoSerijskim } from "@/queries/uredaji";

/** Podaci o skeniranim uređajima (bez nabavnih cijena). */
export async function provjeriSkeniraneAkcija(serijski: string[]) {
  return akcija("skeniranje.provjera", async (k) => {
    const lista = Array.isArray(serijski) ? serijski.filter((s) => typeof s === "string").slice(0, 500) : [];
    const r = await uredajiPoSerijskim(k.db, k.firmaId, lista);
    return {
      ok: true as const,
      podaci: r.map((u) => ({
        id: u.id,
        serijski: u.serijski,
        stanje: u.stanje,
        model: `${u.model.proizvodjac.naziv} ${u.model.naziv}`,
        lokacija: u.partner?.naziv ?? u.skladiste?.naziv ?? "",
      })),
    };
  });
}
