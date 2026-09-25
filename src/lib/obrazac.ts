import { jeRazina, POPIS_MODULA, POPIS_POSEBNIH, praznaPrava, type Iznimke, type Prava } from "@/domain/prava";

/** Tekst iz obrasca (prazno ako polje ne postoji). */
export function tekst(fd: FormData, ime: string): string {
  const v = fd.get(ime);
  return typeof v === "string" ? v.trim() : "";
}

/** Prava iz obrasca uloge: `modul.<m>` = razina, `posebno.<p>` = "on". */
export function pravaIzObrasca(fd: FormData): Prava {
  const p = praznaPrava();
  for (const m of POPIS_MODULA) {
    const r = tekst(fd, `modul.${m}`);
    if (jeRazina(r)) p.moduli[m] = r;
  }
  for (const x of POPIS_POSEBNIH) p.posebna[x] = fd.get(`posebno.${x}`) === "on";
  return p;
}

/** Iznimke iz obrasca korisnika: `iznimka.modul.<m>` = "" | razina, `iznimka.posebno.<p>` = "" | "da" | "ne". */
export function iznimkeIzObrasca(fd: FormData): Iznimke {
  const iz: Iznimke = {};
  for (const m of POPIS_MODULA) {
    const r = tekst(fd, `iznimka.modul.${m}`);
    if (jeRazina(r)) (iz.moduli ??= {})[m] = r;
  }
  for (const x of POPIS_POSEBNIH) {
    const v = tekst(fd, `iznimka.posebno.${x}`);
    if (v === "da" || v === "ne") (iz.posebna ??= {})[x] = v === "da";
  }
  return iz;
}
