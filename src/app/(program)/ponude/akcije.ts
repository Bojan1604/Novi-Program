"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { jeUuid } from "@/domain/id";
import { normalizirajSerijski } from "@/domain/stanja-uredaja";
import { akcija } from "@/lib/akcija";
import { db } from "@/lib/db";
import type { Odgovor } from "@/lib/greske";
import {
  cijenaZaKupca,
  izdajPonudu,
  izdajRacun,
  napraviOdobrenje,
  obrisiNacrt,
  pretvori,
  spremiNacrt,
  statusKupca,
  stornirajRacun,
  dodajPredujam,
} from "@/services/prodaja";

const putanja = (vrsta: string) => (["RACUN", "STORNO", "ODOBRENJE", "PREDUJAM"].includes(vrsta) ? "/racuni" : "/ponude");

const id = z.string().max(40).nullable().optional();
const STAVKA = z.object({
  vrsta: z.enum(["UREDAJ", "MODEL", "USLUGA", "RUCNA"]),
  namjena: z.enum(["PRODAJA", "NAJAM"]),
  uredajId: id,
  modelId: id,
  uslugaId: id,
  naziv: z.string().max(300),
  opis: z.string().max(2000).nullable().optional(),
  kpd: z.string().max(20).nullable().optional(),
  jedinica: z.string().max(20),
  kolicina: z.number().int(),
  cijena: z.number().int(),
  popust: z.number().int(),
  stopa: z.number().int(),
  vrstaIsporuke: z.enum(["ROBA", "USLUGA"]).optional(),
  izvornaStavkaId: z.string().max(40).nullable().optional(),
});
const DOKUMENT = z.object({
  id: z.string().max(40).nullable(),
  vrsta: z.string().max(20),
  verzija: z.number().int(),
  partnerId: z.string().max(40).nullable(),
  poslovnicaId: z.string().max(40).nullable(),
  datum: z.string().max(10),
  vrijediDo: z.string().max(10).nullable(),
  dospijece: z.string().max(10).nullable(),
  popust: z.number().int(),
  napomena: z.string().max(5000).nullable(),
  nacinPlacanja: z.enum(["T", "G", "K", "O"]).optional(),
  stavke: z.array(STAVKA).max(1000),
});

export async function spremiDokumentAkcija(_p: Odgovor<{ id: string; verzija: number }> | undefined, fd: FormData) {
  const r = await akcija("prodaja.spremi", async (k) => {
    let podaci: unknown;
    try {
      podaci = JSON.parse(String(fd.get("podaci") ?? ""));
    } catch {
      return { ok: false as const, greska: "Neispravni podaci obrasca." };
    }
    const p = DOKUMENT.safeParse(podaci);
    if (!p.success) return { ok: false as const, greska: "Neispravni podaci obrasca." };
    const { id: dokId, ...ulaz } = p.data;
    const s = await spremiNacrt(db, k, dokId, { ...ulaz, napomena: ulaz.napomena?.trim() || null });
    revalidatePath("/ponude");
    revalidatePath("/racuni");
    return { ok: true as const, poruka: "Spremljeno.", podaci: { ...s, novi: !dokId, vrsta: ulaz.vrsta } };
  });
  if (r.ok && r.podaci.novi) redirect(`${putanja(r.podaci.vrsta)}/${r.podaci.id}`);
  return r.ok ? { ok: true as const, poruka: r.poruka, podaci: { id: r.podaci.id, verzija: r.podaci.verzija } } : r;
}

export async function izdajAkcija(dokId: string) {
  return akcija("prodaja.izdaj", async (k) => {
    const dok = jeUuid(dokId) ? await k.db.prodajniDokument.findFirst({ where: { id: dokId, firmaId: k.firmaId }, select: { vrsta: true } }) : null;
    if (!dok) return { ok: false as const, greska: "Dokument ne postoji." };
    const { broj } = ["RACUN", "ODOBRENJE", "PREDUJAM"].includes(dok.vrsta) ? await izdajRacun(db, k, dokId) : await izdajPonudu(db, k, dokId);
    revalidatePath(`${putanja(dok.vrsta)}/${dokId}`);
    revalidatePath(putanja(dok.vrsta));
    revalidatePath("/uredaji");
    return { ok: true as const, poruka: `Izdano: ${broj}` };
  });
}

export async function pretvoriAkcija(dokId: string, u: string) {
  const r = await akcija("prodaja.pretvori", async (k) => ({ ok: true as const, podaci: await pretvori(db, k, dokId, u) }));
  if (r.ok) redirect(`${putanja(u)}/${r.podaci.id}`);
  return r;
}

export async function obrisiNacrtAkcija(dokId: string) {
  const r = await akcija("prodaja.obrisi", async (k) => {
    const dok = jeUuid(dokId) ? await k.db.prodajniDokument.findFirst({ where: { id: dokId, firmaId: k.firmaId }, select: { vrsta: true } }) : null;
    await obrisiNacrt(db, k, dokId);
    return { ok: true as const, podaci: { vrsta: dok?.vrsta ?? "PONUDA" } };
  });
  if (r.ok) redirect(putanja(r.podaci.vrsta));
  return r;
}

/** Podaci kupca za nacrt: porezni status (PDV uživo), rok plaćanja, poslovnice i cijene stavki po njegovom cjeniku. */
export async function podaciKupcaAkcija(partnerId: string | null, artikli: { modelId?: string | null; uslugaId?: string | null }[]) {
  return akcija("prodaja.podaci", async (k) => {
    if (partnerId !== null && !jeUuid(partnerId)) return { ok: false as const, greska: "Neispravan kupac." };
    const p = partnerId
      ? await k.db.partner.findFirst({
          where: { id: partnerId, firmaId: k.firmaId },
          select: { drzava: true, pdvBroj: true, pdvStatus: true, rokPlacanjaDana: true },
        })
      : null;
    const poslovnice = partnerId
      ? await k.db.poslovnica.findMany({
          where: { firmaId: k.firmaId, partnerId, aktivan: true },
          orderBy: { naziv: "asc" },
          select: { id: true, naziv: true },
        })
      : [];
    const cijene = await Promise.all(
      artikli
        .slice(0, 1000)
        .map((a) =>
          a.modelId && jeUuid(a.modelId)
            ? cijenaZaKupca(db, k.firmaId, partnerId, { modelId: a.modelId })
            : a.uslugaId && jeUuid(a.uslugaId)
              ? cijenaZaKupca(db, k.firmaId, partnerId, { uslugaId: a.uslugaId })
              : Promise.resolve(null),
        ),
    );
    return { ok: true as const, podaci: { statusKupca: statusKupca(p), rokPlacanja: p?.rokPlacanjaDana ?? null, poslovnice, cijene } };
  });
}

/** Artikl za novu stavku: uređaj po serijskom, model ili usluga — naziv, KPD, jedinica i cijena za kupca. */
export async function artiklAkcija(vrsta: "UREDAJ" | "MODEL" | "USLUGA", oznaka: string, partnerId: string | null) {
  return akcija("prodaja.podaci", async (k) => {
    const kupac = partnerId && jeUuid(partnerId) ? partnerId : null;
    if (vrsta === "UREDAJ") {
      const u = await k.db.uredaj.findFirst({
        where: { firmaId: k.firmaId, serijski: normalizirajSerijski(String(oznaka)).slice(0, 100) },
        select: {
          id: true,
          serijski: true,
          stanje: true,
          modelId: true,
          model: { select: { naziv: true, kpdProdaja: true, kpdNajam: true, proizvodjac: { select: { naziv: true } } } },
        },
      });
      if (!u) return { ok: false as const, greska: `Uređaj ${normalizirajSerijski(String(oznaka))} nije u programu.` };
      return {
        ok: true as const,
        podaci: {
          uredajId: u.id,
          modelId: u.modelId,
          naziv: `${u.model.proizvodjac.naziv} ${u.model.naziv}`,
          opis: `S/N: ${u.serijski}`,
          serijski: u.serijski,
          stanje: u.stanje,
          kpdProdaja: u.model.kpdProdaja,
          kpdNajam: u.model.kpdNajam,
          jedinica: "kom",
          cijena: await cijenaZaKupca(db, k.firmaId, kupac, { modelId: u.modelId }),
        },
      };
    }
    if (!jeUuid(oznaka)) return { ok: false as const, greska: "Neispravan odabir." };
    if (vrsta === "MODEL") {
      const m = await k.db.modelUredaja.findFirst({
        where: { firmaId: k.firmaId, id: oznaka },
        select: { id: true, naziv: true, kpdProdaja: true, kpdNajam: true, proizvodjac: { select: { naziv: true } } },
      });
      if (!m) return { ok: false as const, greska: "Model ne postoji." };
      return {
        ok: true as const,
        podaci: {
          uredajId: null,
          modelId: m.id,
          naziv: `${m.proizvodjac.naziv} ${m.naziv}`,
          opis: null,
          serijski: null,
          stanje: null,
          kpdProdaja: m.kpdProdaja,
          kpdNajam: m.kpdNajam,
          jedinica: "kom",
          cijena: await cijenaZaKupca(db, k.firmaId, kupac, { modelId: m.id }),
        },
      };
    }
    const u = await k.db.usluga.findFirst({
      where: { firmaId: k.firmaId, id: oznaka },
      select: { id: true, naziv: true, kpd: true, jedinica: true },
    });
    if (!u) return { ok: false as const, greska: "Usluga ne postoji." };
    return {
      ok: true as const,
      podaci: {
        uredajId: null,
        modelId: null,
        uslugaId: u.id,
        naziv: u.naziv,
        opis: null,
        serijski: null,
        stanje: null,
        kpdProdaja: u.kpd,
        kpdNajam: u.kpd,
        jedinica: u.jedinica,
        cijena: await cijenaZaKupca(db, k.firmaId, kupac, { uslugaId: u.id }),
      },
    };
  });
}

export async function odobrenjeAkcija(racunId: string) {
  const r = await akcija("prodaja.odobrenje", async (k) => ({ ok: true as const, podaci: await napraviOdobrenje(db, k, racunId) }));
  if (r.ok) redirect(`/racuni/${r.podaci.id}`);
  return r;
}

export async function stornoAkcija(racunId: string, skladisteId: string) {
  const r = await akcija("prodaja.storno", async (k) => {
    const s = await stornirajRacun(db, k, racunId, String(skladisteId));
    revalidatePath("/racuni");
    revalidatePath("/uredaji");
    return { ok: true as const, podaci: s };
  });
  if (r.ok) redirect(`/racuni/${r.podaci.id}`);
  return r;
}

export async function dodajPredujamAkcija(racunId: string, predujamId: string) {
  return akcija("prodaja.spremi", async (k) => {
    await dodajPredujam(db, k, racunId, predujamId);
    revalidatePath(`/racuni/${racunId}`);
    return { ok: true as const, poruka: "Predujam je odbijen na računu." };
  });
}
