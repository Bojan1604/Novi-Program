/** Greška čija je poruka namijenjena korisniku (prikazuje se u sučelju). */
export class GreskaKorisniku extends Error {
  constructor(poruka: string) {
    super(poruka);
    this.name = "GreskaKorisniku";
  }
}

export type Neuspjeh = { ok: false; greska: string; polja?: Record<string, string> };
export type Uspjeh<T = undefined> = { ok: true; poruka?: string; podaci?: T };
export type Odgovor<T = undefined> = Uspjeh<T> | Neuspjeh;
