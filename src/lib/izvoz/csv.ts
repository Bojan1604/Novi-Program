import { bezFormule, tekstVrijednosti, type StupacIzvoza } from "./stupci";

/** CSV za hrvatski Excel: UTF-8 s BOM-om, točka-zarez, decimalni zarez, CRLF. */
export function uCsv<R>(stupci: readonly StupacIzvoza<R>[], redovi: Iterable<R>): string {
  const polje = (t: string) => (/[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
  const linije = [stupci.map((s) => polje(s.naslov)).join(";")];
  for (const r of redovi) {
    linije.push(
      stupci
        .map((s) => {
          const t = tekstVrijednosti(s.vrijednost(r), s.vrsta);
          return polje(s.vrsta === "iznos" || s.vrsta === "broj" ? t : bezFormule(t));
        })
        .join(";"),
    );
  }
  return `﻿${linije.join("\r\n")}\r\n`;
}
