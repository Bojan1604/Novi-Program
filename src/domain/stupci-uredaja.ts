/** Stupci popisa uređaja — korisnik bira koje vidi (pamti se u kolačiću). */
export const STUPCI_UREDAJA = [
  { kljuc: "model", naslov: "Model", zadano: true },
  { kljuc: "kategorija", naslov: "Kategorija", zadano: false },
  { kljuc: "stanje", naslov: "Stanje", zadano: true },
  { kljuc: "lokacija", naslov: "Skladište / kupac", zadano: true },
  { kljuc: "stanjeRobe", naslov: "Stanje robe", zadano: false },
  { kljuc: "nabavnaCijena", naslov: "Nabavna cijena", zadano: true, osjetljivo: true },
  { kljuc: "nabavniDatum", naslov: "Zaprimljen", zadano: true },
  { kljuc: "jamstvoDo", naslov: "Jamstvo do", zadano: true },
  { kljuc: "primka", naslov: "Primka", zadano: false },
  { kljuc: "cpu", naslov: "Procesor", zadano: false },
  { kljuc: "ram", naslov: "RAM", zadano: false },
  { kljuc: "disk", naslov: "Disk", zadano: false },
  { kljuc: "ekran", naslov: "Ekran", zadano: false },
  { kljuc: "os", naslov: "OS", zadano: false },
  { kljuc: "napomena", naslov: "Napomena", zadano: false },
] as const;
export type KljucStupca = (typeof STUPCI_UREDAJA)[number]["kljuc"];

/** Odabrani stupci iz kolačića (nepoznati se odbacuju; prazno = zadani); osjetljivi samo s pravom. */
export function odabraniStupci(kolacic: string | undefined, vidiNabavne: boolean): KljucStupca[] {
  const svi = STUPCI_UREDAJA.filter((s) => vidiNabavne || !("osjetljivo" in s && s.osjetljivo));
  const trazeni = (kolacic ?? "").split(",").filter(Boolean);
  const odabrani = svi.filter((s) => trazeni.includes(s.kljuc)).map((s) => s.kljuc);
  return odabrani.length ? odabrani : svi.filter((s) => s.zadano).map((s) => s.kljuc);
}

export const SORTIRANJA_UREDAJA = ["serijski", "stanje", "nabavniDatum", "jamstvoDo", "stvoreno", "nabavnaCijena"] as const;
export type SortiranjeUredaja = (typeof SORTIRANJA_UREDAJA)[number];
