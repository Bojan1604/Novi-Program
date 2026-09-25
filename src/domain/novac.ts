/**
 * Novac — čista logika, bez baze i ekrana.
 *
 * U domeni se iznos uvijek drži kao cijeli broj centi (`Centi`).
 * U bazi je iznos Decimal(14,2); pretvorba ide samo kroz `centiIzDecimala`
 * i `centiUDecimal`. Float se nikad ne koristi za računanje novca.
 */

export type Centi = number;

export type Rezultat<T> = { ok: true; vrijednost: T } | { ok: false; greska: string };

const NAJVECI_IZNOS_CENTI = 99_999_999_999_99; // 99.999.999.999,99 € — stane u Decimal(14,2)

export type OpcijeUpisa = {
  /** Dopušta negativan iznos (npr. odobrenje). Zadano: ne. */
  dopustiNegativno?: boolean;
};

/**
 * Strogo čitanje iznosa koji je korisnik upisao (hrvatski zapis).
 *
 * Točka je isključivo odvajanje tisućica, zarez je decimalni znak:
 *   „1.500“ → 150000, „1.500,5“ → 150050, „1 500,00 €“ → 150000.
 * Sve što nije nedvosmisleno je greška, nikad 0:
 *   „abc“, „1.5“, „1,505“, „1.50.000“, „“ → greška.
 */
export function procitajIznos(upis: string, opcije: OpcijeUpisa = {}): Rezultat<Centi> {
  let tekst = upis.trim().replace(/\s*€$/, "").replace(/\s*EUR$/i, "").trim();

  if (tekst === "") return { ok: false, greska: "Upišite iznos." };

  let negativno = false;
  if (tekst.startsWith("-")) {
    negativno = true;
    tekst = tekst.slice(1).trim();
  }

  // razmaci (i nerazdvojni razmaci) kao odvajanje tisućica: „1 500 000“
  tekst = tekst.replace(/[\s  ]+/g, " ");

  const dijelovi = tekst.split(",");
  if (dijelovi.length > 2) return { ok: false, greska: "Iznos smije imati samo jedan decimalni zarez." };

  const cijeliDio = dijelovi[0] ?? "";
  const decimalniDio = dijelovi[1];

  if (cijeliDio === "") return { ok: false, greska: "Prije zareza mora biti broj (npr. 0,50)." };

  let znamenke: string;
  if (/^\d+$/.test(cijeliDio)) {
    znamenke = cijeliDio;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cijeliDio) || /^\d{1,3}( \d{3})+$/.test(cijeliDio)) {
    znamenke = cijeliDio.replace(/[. ]/g, "");
  } else if (/^\d*\.\d{1,2}$/.test(cijeliDio) && decimalniDio === undefined) {
    return { ok: false, greska: "Za decimale koristite zarez (npr. 1,50); točka odvaja tisućice." };
  } else {
    return { ok: false, greska: "Iznos nije ispravan broj." };
  }

  let centiDio = 0;
  if (decimalniDio !== undefined) {
    if (!/^\d{1,2}$/.test(decimalniDio)) {
      return { ok: false, greska: "Iznos smije imati najviše dvije decimale." };
    }
    centiDio = Number(decimalniDio.padEnd(2, "0"));
  }

  const eura = Number(znamenke);
  const centi = eura * 100 + centiDio;
  if (!Number.isSafeInteger(centi) || centi > NAJVECI_IZNOS_CENTI) {
    return { ok: false, greska: "Iznos je prevelik." };
  }

  if (negativno && centi !== 0) {
    if (!opcije.dopustiNegativno) return { ok: false, greska: "Iznos ne smije biti negativan." };
    return { ok: true, vrijednost: -centi };
  }
  return { ok: true, vrijednost: centi };
}

/** 150050 → „1.500,50“ (uz `sValutom`: „1.500,50 €“). */
export function formatirajIznos(centi: Centi, sValutom = false): string {
  provjeriCenti(centi);
  const negativno = centi < 0;
  const apsolutno = Math.abs(centi);
  const eura = Math.floor(apsolutno / 100);
  const ostatak = apsolutno % 100;
  const tisucice = String(eura).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const tekst = `${negativno ? "-" : ""}${tisucice},${String(ostatak).padStart(2, "0")}`;
  return sValutom ? `${tekst} €` : tekst;
}

/**
 * Decimal iz baze (kao tekst, npr. `decimal.toString()` → „1500.5“) u cente.
 * Baca grešku za sve što nije točan iznos s najviše dvije decimale.
 */
export function centiIzDecimala(vrijednost: string): Centi {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(vrijednost.trim());
  if (!m) throw new Error(`Neispravan iznos iz baze: "${vrijednost}"`);
  const centi = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(centi)) throw new Error(`Iznos iz baze je prevelik: "${vrijednost}"`);
  return m[1] && centi !== 0 ? -centi : centi;
}

/** Centi u tekst za Decimal(14,2) u bazi: 150050 → „1500.50“. */
export function centiUDecimal(centi: Centi): string {
  provjeriCenti(centi);
  const apsolutno = Math.abs(centi);
  const tekst = `${Math.floor(apsolutno / 100)}.${String(apsolutno % 100).padStart(2, "0")}`;
  return centi < 0 ? `-${tekst}` : tekst;
}

/** Zbroj iznosa u centima; baca grešku ako bilo koji nije cijeli broj centi. */
export function zbroji(iznosi: readonly Centi[]): Centi {
  let zbroj = 0;
  for (const iznos of iznosi) {
    provjeriCenti(iznos);
    zbroj += iznos;
  }
  provjeriCenti(zbroj);
  return zbroj;
}

function provjeriCenti(centi: Centi): void {
  if (!Number.isSafeInteger(centi)) {
    throw new Error(`Iznos mora biti cijeli broj centi, a dobiven je: ${centi}`);
  }
}
