"use client";

import { useEffect, useRef, useState } from "react";
import { kandidatiIzTeksta, serijskiIzKoda } from "@/domain/skeniranje";
import { Dijalog } from "./dijalog";
import { Gumb } from "./gumb";
import { Obavijest } from "./obavijest";
import { klaseUnosa } from "./polje";
import { kameraDostupna, potvrdiSkeniranje, prepoznajTekst, procitajKodove } from "./skener-citac";

/**
 * Gumbi „Kamera“ i „Iz slike“ uz polje za USB skener. Svaki pronađeni serijski broj predaje `onSerijski`.
 * Skupni način (`skupno`): kamera ostaje otvorena i skenira jedan za drugim.
 * USB skener ne treba ništa posebno: piše u polje kao tipkovnica i završava s Enter.
 */
export function GumbiSkenera({ onSerijski, skupno = false }: { onSerijski: (serijski: string) => void; skupno?: boolean }) {
  const [kamera, setKamera] = useState(false);
  const [bezKamere, setBezKamere] = useState(false);
  const [izbor, setIzbor] = useState<{ naslov: string; kandidati: string[]; ocr: boolean } | null>(null);
  const [rad, setRad] = useState<string | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const datoteka = useRef<HTMLInputElement>(null);

  const izSlike = async (f: File) => {
    setGreska(null);
    setRad("Tražim barkod na slici…");
    try {
      const kodovi = await procitajKodove(f);
      const serijski = [...new Set(kodovi.map(serijskiIzKoda).filter((s): s is string => !!s))];
      if (serijski.length === 1 || (skupno && serijski.length > 1)) {
        serijski.forEach(onSerijski);
        potvrdiSkeniranje();
        return;
      }
      if (serijski.length > 1) {
        setIzbor({ naslov: "Na slici je više kodova — odaberite serijski broj", kandidati: serijski, ocr: false });
        return;
      }
      setRad("Barkoda nema — čitam tekst sa slike…");
      const tekst = await prepoznajTekst(f, (p) => setRad(`Čitam tekst sa slike… ${p} %`));
      setIzbor({ naslov: "Provjerite prepoznati serijski broj", kandidati: kandidatiIzTeksta(tekst), ocr: true });
    } catch {
      setGreska("Slika se ne može pročitati. Pokušajte oštriju sliku ili upišite broj.");
      potvrdiSkeniranje(false);
    } finally {
      setRad(null);
      if (datoteka.current) datoteka.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Gumb
          malen
          onClick={() => {
            if (kameraDostupna()) setKamera(true);
            else setBezKamere(true);
          }}
        >
          Kamera
        </Gumb>
        <Gumb malen onClick={() => datoteka.current?.click()} disabled={!!rad}>
          Iz slike
        </Gumb>
        <input
          ref={datoteka}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Slika barkoda ili naljepnice"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) void izSlike(f);
          }}
        />
      </div>
      {rad && <p className="text-sm text-neutral-600 dark:text-neutral-400">{rad}</p>}
      {greska && <Obavijest vrsta="greska">{greska}</Obavijest>}
      {bezKamere && (
        <Obavijest vrsta="upozorenje">
          Kamera radi samo kad je program otvoren preko <b>https://</b> (ili na samom računalu kao localhost). Pokrenite program s HTTPS-om (vidi
          upute) ili koristite „Iz slike“ — na mobitelu otvara fotoaparat.
        </Obavijest>
      )}
      {kamera && <Kamera skupno={skupno} onSerijski={onSerijski} onZatvori={() => setKamera(false)} />}
      {izbor && (
        <Izbor
          {...izbor}
          onOdabir={(s) => {
            onSerijski(s);
            potvrdiSkeniranje();
            setIzbor(null);
          }}
          onZatvori={() => setIzbor(null)}
        />
      )}
    </div>
  );
}

function Kamera({ skupno, onSerijski, onZatvori }: { skupno: boolean; onSerijski: (s: string) => void; onZatvori: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [poruka, setPoruka] = useState<string | null>(null);
  const [skenirani, setSkenirani] = useState<string[]>([]);
  // zadnji kod i vrijeme — isti kod pred kamerom ne dodaje se svakih 200 ms
  const zadnji = useRef<{ kod: string; vrijeme: number }>({ kod: "", vrijeme: 0 });
  const predaj = useRef(onSerijski);
  const zatvori = useRef(onZatvori);
  useEffect(() => {
    predaj.current = onSerijski;
    zatvori.current = onZatvori;
  });

  useEffect(() => {
    let tok: MediaStream | null = null;
    let kraj = false;
    let odgoda: ReturnType<typeof setTimeout> | undefined;
    const platno = document.createElement("canvas");

    const skeniraj = async () => {
      const v = video.current;
      if (kraj || !v) return;
      if (v.readyState >= 2 && v.videoWidth) {
        const omjer = Math.min(1, 1280 / v.videoWidth);
        platno.width = Math.round(v.videoWidth * omjer);
        platno.height = Math.round(v.videoHeight * omjer);
        const ctx = platno.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0, platno.width, platno.height);
        try {
          const kodovi = await procitajKodove(ctx.getImageData(0, 0, platno.width, platno.height));
          for (const kod of kodovi) {
            const sada = Date.now();
            if (kod === zadnji.current.kod && sada - zadnji.current.vrijeme < 2500) continue;
            zadnji.current = { kod, vrijeme: sada };
            const s = serijskiIzKoda(kod);
            if (!s) {
              setPoruka(`Kod „${kod.slice(0, 40)}“ nije serijski broj.`);
              potvrdiSkeniranje(false);
              continue;
            }
            potvrdiSkeniranje();
            predaj.current(s);
            if (!skupno) {
              kraj = true;
              zatvori.current();
              return;
            }
            setPoruka(null);
            setSkenirani((l) => [s, ...l.filter((x) => x !== s)].slice(0, 5));
          }
        } catch {
          // okvir se nije mogao pročitati — sljedeći
        }
      }
      if (!kraj) odgoda = setTimeout(skeniraj, 200);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (t) => {
        if (kraj) {
          t.getTracks().forEach((x) => x.stop());
          return;
        }
        tok = t;
        const v = video.current!;
        v.srcObject = t;
        await v.play().catch(() => undefined);
        void skeniraj();
      })
      .catch((e: unknown) => {
        const ime = (e as { name?: string }).name;
        setGreska(
          ime === "NotAllowedError"
            ? "Pristup kameri je odbijen. Dopustite kameru u postavkama preglednika za ovu stranicu."
            : ime === "NotFoundError"
              ? "Uređaj nema kameru."
              : "Kamera se ne može pokrenuti (možda je koristi drugi program).",
        );
      });
    return () => {
      kraj = true;
      clearTimeout(odgoda);
      tok?.getTracks().forEach((x) => x.stop());
    };
  }, [skupno]);

  return (
    <Dijalog otvoren onZatvori={onZatvori} naslov={skupno ? "Skeniranje kamerom (skupno)" : "Skeniranje kamerom"} sirina="lg">
      <div className="flex flex-col gap-3">
        {greska ? (
          <Obavijest vrsta="greska">{greska}</Obavijest>
        ) : (
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video ref={video} muted playsInline className="aspect-video w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-[10%] top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
          </div>
        )}
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Usmjerite kameru na barkod ili QR kod serijskog broja.</p>
        {poruka && <Obavijest vrsta="upozorenje">{poruka}</Obavijest>}
        {skupno && skenirani.length > 0 && (
          <div className="text-sm" aria-live="polite">
            Skenirano: <span className="font-mono">{skenirani.join(", ")}</span>
          </div>
        )}
        <div>
          <Gumb onClick={onZatvori}>{skupno ? "Gotovo" : "Zatvori"}</Gumb>
        </div>
      </div>
    </Dijalog>
  );
}

function Izbor({
  naslov,
  kandidati,
  ocr,
  onOdabir,
  onZatvori,
}: {
  naslov: string;
  kandidati: string[];
  ocr: boolean;
  onOdabir: (s: string) => void;
  onZatvori: () => void;
}) {
  const [upis, setUpis] = useState(kandidati[0] ?? "");
  const provjeren = serijskiIzKoda(upis);
  return (
    <Dijalog otvoren onZatvori={onZatvori} naslov={naslov}>
      <div className="flex flex-col gap-3">
        {ocr && kandidati.length === 0 && <Obavijest vrsta="upozorenje">Na slici nije prepoznat serijski broj. Upišite ga ručno.</Obavijest>}
        {ocr && kandidati.length > 0 && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Tekst sa slike može biti krivo pročitan (0/O, 1/I, 8/B) — usporedite s naljepnicom.
          </p>
        )}
        {kandidati.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Pronađeni brojevi">
            {kandidati.map((k) => (
              <Gumb key={k} malen varijanta={k === upis ? "primarni" : "sekundarni"} onClick={() => setUpis(k)} className="font-mono">
                {k}
              </Gumb>
            ))}
          </div>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Serijski broj</span>
          <input className={`${klaseUnosa} font-mono`} value={upis} onChange={(e) => setUpis(e.target.value)} autoFocus />
        </label>
        <div className="flex gap-2">
          <Gumb varijanta="primarni" disabled={!provjeren} onClick={() => provjeren && onOdabir(provjeren)}>
            Dodaj
          </Gumb>
          <Gumb onClick={onZatvori}>Odustani</Gumb>
        </div>
      </div>
    </Dijalog>
  );
}
