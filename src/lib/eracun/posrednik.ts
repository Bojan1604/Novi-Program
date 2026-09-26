import { randomUUID } from "node:crypto";
import { jeOib } from "@/domain/oib";

/**
 * Informacijski posrednik za eRačun (slanje, status, AMS, eIzvještavanje).
 * Ugrađen je samo demo posrednik; stvarni se spaja kad firma odabere posrednika (ERACUN_POSREDNIK + njegov API).
 */
export type StatusERacuna = "POSLAN" | "ISPORUCEN" | "PRIHVACEN" | "ODBIJEN" | "GRESKA";

export interface Posrednik {
  naziv: string;
  /** je li primatelj (OIB) u adresaru eRačuna (AMS) */
  provjeriPrimatelja(oib: string): Promise<{ aktivan: boolean; adresa: string | null }>;
  posalji(xml: string, p: { posiljatelj: string; primatelj: string; broj: string }): Promise<{ id: string }>;
  status(id: string): Promise<{ status: StatusERacuna; poruka: string | null }>;
  /** eIzvještavanje: naplata ili odbijanje eRačuna Poreznoj upravi */
  izvijesti(i: {
    vrsta: "NAPLATA" | "ODBIJANJE";
    broj: string;
    oibIzdavatelja: string;
    iznos: string;
    datum: string;
    razlog?: string | null;
  }): Promise<{ id: string }>;
}

/**
 * Demo posrednik: ništa ne šalje van. Primatelj je u AMS-u ako mu je OIB ispravan i ne počinje nulom;
 * poslani eRačun je odmah isporučen, a „prihvaćen“ pri prvoj provjeri statusa.
 */
export const demoPosrednik: Posrednik = {
  naziv: "Demo posrednik",
  async provjeriPrimatelja(oib) {
    const aktivan = jeOib(oib) && !oib.startsWith("0");
    return { aktivan, adresa: aktivan ? `9934:${oib}` : null };
  },
  async posalji() {
    return { id: `DEMO-${randomUUID()}` };
  },
  async status(id) {
    return id.startsWith("DEMO-") ? { status: "PRIHVACEN", poruka: null } : { status: "GRESKA", poruka: "Nepoznat eRačun." };
  },
  async izvijesti() {
    return { id: `DEMO-IZ-${randomUUID()}` };
  },
};

export function posrednik(): Posrednik {
  const n = process.env["ERACUN_POSREDNIK"] ?? "demo";
  if (n === "demo") return demoPosrednik;
  throw new Error(`Posrednik „${n}“ nije podržan — postavite ERACUN_POSREDNIK=demo ili dodajte spoj na posrednika.`);
}
