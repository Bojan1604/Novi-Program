import { GumbVeza } from "@/components/ui/gumb";
import { Kartica, NaslovStranice, Stranica, Znacka } from "@/components/ui/stranica";
import { PLATFORME, type Platforma } from "@/domain/mdm";
import type { PostavkeProfila } from "@/domain/mdm-upravljanje";
import { imaPravo } from "@/domain/prava";
import { pristupStranici } from "@/lib/akcija";
import { ObrazacProfila } from "../upravljanje";

export const metadata = { title: "MDM profili · ERP-WMS" };
export const dynamic = "force-dynamic";

export default async function Profili() {
  const k = await pristupStranici("/mdm");
  const [profili, organizacije] = await Promise.all([
    k.db.mdmProfil.findMany({
      where: { firmaId: k.firmaId },
      orderBy: [{ platforma: "asc" }, { naziv: "asc" }],
      include: { organizacija: { select: { naziv: true } } },
    }),
    k.db.mdmOrganizacija.findMany({ where: { firmaId: k.firmaId }, orderBy: { naziv: "asc" }, select: { id: true, naziv: true } }),
  ]);
  const smije = imaPravo(k.prava, "mdm", "operativno");
  return (
    <Stranica sirina="5xl">
      <NaslovStranice
        naslov="MDM profili"
        opis="Uređaj dobiva profil svoje organizacije, inače distributera iznad nje, inače opći profil platforme."
        akcije={<GumbVeza href="/mdm">Natrag</GumbVeza>}
      />
      {profili.map((p) => {
        const s = p.postavke as PostavkeProfila;
        return (
          <Kartica
            key={p.id}
            naslov={
              <span className="inline-flex flex-wrap items-center gap-2">
                {p.naziv} <Znacka>{PLATFORME[p.platforma as Platforma]}</Znacka> <Znacka boja="plava">{p.organizacija?.naziv ?? "opći"}</Znacka>
                <Znacka>v{p.verzija}</Znacka>
                {!p.aktivan && <Znacka boja="crvena">neaktivan</Znacka>}
              </span>
            }
          >
            {smije ? (
              <ObrazacProfila
                key={p.verzija}
                id={p.id}
                organizacije={organizacije}
                p={{
                  naziv: p.naziv,
                  organizacijaId: p.organizacijaId ?? "",
                  platforma: p.platforma,
                  lozinkaMin: s.lozinkaMin?.toString() ?? "",
                  zakljucajNakonMin: s.zakljucajNakonMin?.toString() ?? "",
                  kameraDopustena: s.kameraDopustena,
                  usbDopusten: s.usbDopusten,
                  wifiSsid: s.wifiSsid ?? "",
                  imaWifiLozinku: !!p.wifiLozinka,
                  kiosk: s.kiosk ?? "",
                  aktivan: p.aktivan,
                }}
              />
            ) : (
              <p className="text-sm">
                Lozinka zaslona: {s.lozinkaMin ?? "—"} · kamera: {s.kameraDopustena ? "da" : "ne"} · USB: {s.usbDopusten ? "da" : "ne"} · Wi-Fi:{" "}
                {s.wifiSsid ?? "—"}
              </p>
            )}
          </Kartica>
        );
      })}
      {smije && (
        <Kartica naslov="Novi profil">
          <ObrazacProfila
            id={null}
            organizacije={organizacije}
            p={{
              naziv: "",
              organizacijaId: "",
              platforma: "ANDROID",
              lozinkaMin: "",
              zakljucajNakonMin: "",
              kameraDopustena: true,
              usbDopusten: true,
              wifiSsid: "",
              imaWifiLozinku: false,
              kiosk: "",
              aktivan: true,
            }}
          />
        </Kartica>
      )}
    </Stranica>
  );
}
