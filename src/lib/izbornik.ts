import type { StavkaIzbornika } from "@/domain/izbornik";
import { STRANICE, type PutanjaStranice } from "./akcije-prava";

const GRUPE: { grupa: string; putanje: PutanjaStranice[] }[] = [
  { grupa: "Pregled", putanje: ["/"] },
  { grupa: "Sustav", putanje: ["/korisnici", "/uloge", "/dnevnik"] },
];

export const IZBORNIK: StavkaIzbornika[] = GRUPE.flatMap(({ grupa, putanje }) =>
  putanje.map((putanja) => {
    const { naziv, ...pravo } = STRANICE[putanja];
    return { naziv, putanja, grupa, pravo };
  }),
);
