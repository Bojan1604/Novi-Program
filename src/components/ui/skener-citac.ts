"use client";

/**
 * Čitanje barkoda/QR koda iz slike ili okvira kamere i prepoznavanje teksta (OCR) — samo u pregledniku.
 * Datoteke čitača su u /skener (kopira ih scripts/kopiraj-skener.mjs) — ništa se ne dohvaća s interneta.
 */

type Detektor = { detect: (izvor: ImageBitmapSource) => Promise<{ rawValue: string }[]> };
type KonstruktorDetektora = { new (o?: { formats?: string[] }): Detektor; getSupportedFormats?: () => Promise<string[]> };

let detektor: Promise<Detektor | null> | null = null;

/** Ugrađeni čitač preglednika (Chrome na Androidu, Safari) — brži; inače null. */
function ugradeni(): Promise<Detektor | null> {
  detektor ??= (async () => {
    const K = (globalThis as { BarcodeDetector?: KonstruktorDetektora }).BarcodeDetector;
    if (!K) return null;
    try {
      const podrzani = (await K.getSupportedFormats?.()) ?? [];
      return podrzani.length ? new K({ formats: podrzani }) : null;
    } catch {
      return null;
    }
  })();
  return detektor;
}

let zxing: Promise<typeof import("zxing-wasm/reader")> | null = null;
function zxingCitac() {
  zxing ??= import("zxing-wasm/reader").then((m) => {
    m.prepareZXingModule({ overrides: { locateFile: (put: string, prefiks: string) => (put.endsWith(".wasm") ? `/skener/${put}` : prefiks + put) } });
    return m;
  });
  return zxing;
}

/** Svi kodovi pronađeni na slici (tekst koda, bez ponavljanja). */
export async function procitajKodove(slika: ImageData | Blob): Promise<string[]> {
  const d = await ugradeni();
  if (d) {
    try {
      const izvor = slika instanceof Blob ? await createImageBitmap(slika) : slika;
      const r = await d.detect(izvor);
      if (r.length) return [...new Set(r.map((x) => x.rawValue))];
    } catch {
      // ugrađeni ne zna ovaj format slike → zxing
    }
  }
  const m = await zxingCitac();
  const r = await m.readBarcodes(slika, { tryHarder: true, maxNumberOfSymbols: 8 });
  return [...new Set(r.filter((x) => x.isValid && x.text).map((x) => x.text))];
}

/** Prepoznati tekst sa slike (engleski znakovi; serijski brojevi su latinica i brojke). */
export async function prepoznajTekst(slika: Blob, napredak?: (postotak: number) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const radnik = await createWorker("eng", 1, {
    workerPath: "/skener/worker.min.js",
    corePath: "/skener",
    langPath: "/skener",
    workerBlobURL: false,
    logger: (p: { status: string; progress: number }) => {
      if (p.status === "recognizing text") napredak?.(Math.round(p.progress * 100));
    },
  });
  try {
    const r = await radnik.recognize(slika);
    return r.data.text;
  } finally {
    await radnik.terminate();
  }
}

/** Kratki zvuk i vibracija nakon uspješnog skeniranja (na mobitelu korisnik ne gleda u ekran). */
export function potvrdiSkeniranje(uspjeh = true): void {
  try {
    navigator.vibrate?.(uspjeh ? 60 : [40, 60, 40]);
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = uspjeh ? 1400 : 300;
    g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (uspjeh ? 0.08 : 0.25));
    o.onended = () => void ctx.close();
  } catch {
    // zvuk nije bitan
  }
}

/** Kamera radi samo u sigurnom kontekstu (https ili localhost). */
export function kameraDostupna(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}
