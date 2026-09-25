import type { StavkaIzbornika } from "@/domain/izbornik";
import { STRANICE, type PutanjaStranice } from "./akcije-prava";

const GRUPE: { grupa: string; putanje: PutanjaStranice[] }[] = [
  { grupa: "Pregled", putanje: ["/"] },
  { grupa: "Sustav", putanje: ["/korisnici", "/uloge"] },
];

export const IZBORNIK: StavkaIzbornika[] = GRUPE.flatMap(({ grupa, putanje }) =>
  putanje.map((putanja) => ({ ...STRANICE[putanja], putanja, grupa })),
);
