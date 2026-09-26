import { Znacka } from "@/components/ui/stranica";
import { STATUSI_DOKUMENTA, type StatusDokumenta } from "@/domain/skladisni-dokumenti";

export function ZnackaStatusa({ status }: { status: string }) {
  if (status === "IZDAN") return null;
  return <Znacka boja={status === "ODBIJEN" ? "crvena" : "zuta"}>{STATUSI_DOKUMENTA[status as StatusDokumenta] ?? status}</Znacka>;
}
