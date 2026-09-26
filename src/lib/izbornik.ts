import type { StavkaIzbornika } from "@/domain/izbornik";
import { STRANICE, type PutanjaStranice } from "./akcije-prava";

const GRUPE: { grupa: string; putanje: PutanjaStranice[] }[] = [
  { grupa: "Pregled", putanje: ["/", "/izvjestaji"] },
  { grupa: "Prodaja", putanje: ["/racuni", "/ponude", "/eracuni", "/marze"] },
  { grupa: "Najam", putanje: ["/najam", "/najam/rate"] },
  { grupa: "Servis", putanje: ["/servis", "/mdm"] },
  { grupa: "Nabava", putanje: ["/nabava", "/ulazni", "/troskovi", "/knjigovodja"] },
  { grupa: "Partneri", putanje: ["/partneri", "/cjenici"] },
  { grupa: "Skladište", putanje: ["/uredaji", "/skeniranje", "/primke", "/skladisni", "/odobrenja", "/inventure", "/sifrarnici"] },
  { grupa: "Sustav", putanje: ["/korisnici", "/uloge", "/dnevnik", "/postavke", "/provjera", "/moj-racun"] },
];

export const IZBORNIK: StavkaIzbornika[] = GRUPE.flatMap(({ grupa, putanje }) =>
  putanje.map((putanja) => {
    const { naziv, ...pravo } = STRANICE[putanja];
    return { naziv, putanja, grupa, pravo };
  }),
);
