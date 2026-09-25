/**
 * Prilozi (datoteke uz uređaj, ugovor, račun, servisni nalog…) — čista pravila provjere.
 * Datoteka se sprema u bazu (ide u sigurnosnu kopiju zajedno s podacima).
 */

export const NAJVECI_PRILOG = 10 * 1024 * 1024;
export const NAJVISE_PRILOGA = 50;

/** Dopuštene vrste po nastavku; vrsta se određuje iz nastavka, ne iz onoga što preglednik pošalje. */
export const VRSTE_PRILOGA: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  gif: "image/gif",
  txt: "text/plain",
  csv: "text/csv",
  xml: "application/xml",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  zip: "application/zip",
};

/** Vrste koje se smiju prikazati u pregledniku (ostale se uvijek preuzimaju). */
const PRIKAZIVE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "text/plain"]);

export type ProvjeraPriloga = { ok: true; naziv: string; vrsta: string } | { ok: false; greska: string };

/** Naziv bez putanje i kontrolnih znakova, najviše 150 znakova (nastavak se čuva). */
export function ocistiNaziv(naziv: string): string {
  const bezPutanje = naziv.split(/[\\/]/).pop() ?? "";
  const cist = bezPutanje.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "").trim();
  if (cist.length <= 150) return cist;
  const tocka = cist.lastIndexOf(".");
  const nastavak = tocka > 0 && cist.length - tocka <= 6 ? cist.slice(tocka) : "";
  return cist.slice(0, 150 - nastavak.length) + nastavak;
}

export function provjeriPrilog(naziv: string, velicina: number): ProvjeraPriloga {
  const cist = ocistiNaziv(naziv);
  if (!cist || cist.startsWith(".")) return { ok: false, greska: "Datoteka nema ispravan naziv." };
  if (velicina <= 0) return { ok: false, greska: `Datoteka „${cist}“ je prazna.` };
  if (velicina > NAJVECI_PRILOG) return { ok: false, greska: `Datoteka „${cist}“ je veća od 10 MB.` };
  const nastavak = cist.includes(".") ? cist.split(".").pop()!.toLowerCase() : "";
  const vrsta = Object.hasOwn(VRSTE_PRILOGA, nastavak) ? VRSTE_PRILOGA[nastavak] : undefined;
  if (!vrsta) return { ok: false, greska: `Vrsta datoteke „${cist}“ nije dopuštena (PDF, slike, Office, TXT, CSV, XML, ZIP).` };
  return { ok: true, naziv: cist, vrsta };
}

export function smijePrikazati(vrsta: string): boolean {
  return PRIKAZIVE.has(vrsta);
}

/** Zaglavlje Content-Disposition s nazivom (UTF-8 i ASCII zamjena za stare preglednike). */
export function zaglavljeDatoteke(naziv: string, prikazi: boolean): string {
  const ascii =
    naziv
      .normalize("NFD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/["\\]/g, "") || "prilog";
  return `${prikazi ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(naziv)}`;
}

export function velicinaZaPrikaz(bajtova: number): string {
  if (bajtova < 1024) return `${bajtova} B`;
  if (bajtova < 1024 * 1024) return `${Math.round(bajtova / 1024)} KB`;
  return `${(bajtova / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
