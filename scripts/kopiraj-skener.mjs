/**
 * Datoteke za skeniranje (čitač barkoda i OCR) poslužuju se iz programa, ne s interneta:
 * kopira ih iz node_modules u public/skener (pokreće se pri npm install).
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const korijen = join(dirname(fileURLToPath(import.meta.url)), "..");
const cilj = join(korijen, "public", "skener");
const nm = (...p) => join(korijen, "node_modules", ...p);

const DATOTEKE = [
  [nm("zxing-wasm", "dist", "reader", "zxing_reader.wasm"), "zxing_reader.wasm"],
  [nm("tesseract.js", "dist", "worker.min.js"), "worker.min.js"],
  [nm("tesseract.js-core", "tesseract-core-lstm.wasm.js"), "tesseract-core-lstm.wasm.js"],
  [nm("tesseract.js-core", "tesseract-core-simd-lstm.wasm.js"), "tesseract-core-simd-lstm.wasm.js"],
  [nm("tesseract.js-core", "tesseract-core-relaxedsimd-lstm.wasm.js"), "tesseract-core-relaxedsimd-lstm.wasm.js"],
  [nm("@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"), "eng.traineddata.gz"],
];

mkdirSync(cilj, { recursive: true });
for (const [izvor, ime] of DATOTEKE) {
  if (!existsSync(izvor)) {
    console.error(`Nedostaje ${izvor} — pokrenite npm install.`);
    process.exit(1);
  }
  copyFileSync(izvor, join(cilj, ime));
}
console.log(`Skener: ${DATOTEKE.length} datoteka u public/skener`);
