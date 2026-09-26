"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import { akcijaPortala } from "@/lib/portal";
import type { Datoteka } from "@/services/prilozi";
import { prijaviKvarPortal } from "@/services/servis";

export async function prijavaKvaraAkcija(_p: Odgovor | undefined, fd: FormData): Promise<Odgovor> {
  const r = await akcijaPortala(async (k) => {
    const fotografije: Datoteka[] = [];
    for (const f of fd.getAll("fotografije")) {
      if (!(f instanceof File) || (f.size === 0 && !f.name)) continue;
      fotografije.push({ naziv: f.name, velicina: f.size, sadrzaj: new Uint8Array(await f.arrayBuffer()) });
    }
    const n = await prijaviKvarPortal(
      db,
      { firmaId: k.firmaId, partnerId: k.partnerId, ip: k.ip, ime: k.korisnik.ime },
      { uredajId: String(fd.get("uredajId") ?? ""), opisKvara: String(fd.get("opisKvara") ?? ""), kontakt: String(fd.get("kontakt") ?? "") || null },
      fotografije,
    );
    return { ok: true as const, podaci: n };
  });
  if (r.ok) redirect(`/portal/nalozi/${r.podaci.id}`);
  return r;
}
