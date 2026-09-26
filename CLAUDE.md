@AGENTS.md

# ERP-WMS — upute za rad na projektu

Program za skladište, prodaju, najam, nabavu i servis uređaja (serijski broj je središnji objekt).
Gradi se u 8 faza, korak po korak, prema dokumentu „ERP-WMS iz početka — upute korak po korak“.

## Način rada (svaki korak isti)

1. **Plan** — na naredbu koraka prvo odgovori planom (što, koje tablice i ekrani, pravila,
   rubni slučajevi, pitanja). **Ništa se ne programira prije potvrde.**
2. **Izrada** — prvo čista pravila u `src/domain/`, pa servisi, pa ekrani.
3. **Testovi** — za svako pravilo test; za svaki novac/stanje test s ručno izračunatim očekivanim iznosom.
4. **Provjera** — pokreni program i prođi funkciju u pregledniku (računalo i mobitel 390 px).
5. **Commit i push** — tek kad sve prolazi (`npm run verify`). Jedan korak = jedan commit, poruka na hrvatskom.
6. Korisnik proba; sljedeći korak tek kad kaže „OK“.

Jedna naredba = jedna funkcija. Nova ideja usred koraka se zapiše za kasnije, ne radi se usput.

## Temeljne odluke (ne mijenjaju se usput)

- Next.js (App Router) + TypeScript strict + PostgreSQL + Prisma; zod za provjeru ulaza.
- Sučelje na hrvatskom.
- **Novac:** u domeni cijeli broj centi (`Centi` iz `src/domain/novac.ts`); u bazi `Decimal @db.Decimal(14, 2)`.
  Nikad `Float` u bazi ni float za računanje. Pretvorba samo kroz `centiIzDecimala` / `centiUDecimal`.
- **Datumi:** poslovni datum je `YYYY-MM-DD` po Europe/Zagreb (`Datum` iz `src/domain/datum.ts`);
  u bazi `@db.Date`. „Danas“ uvijek `danas()`, nikad `new Date()` u lokalnoj zoni poslužitelja.
- **Migracije samo dodaju** — nikad ne brišu stupce, tablice ni podatke.
- Svaki poslovni model ima `firmaId`; svaki upit filtriran po firmi (od koraka 0.2).

## Arhitektura

```
src/domain/    čista pravila (novac, datumi, stanja, PDV, rate) — bez baze, bez Reacta; 100 % testovi
src/services/  radnje koje pišu u bazu: transakcija, zaključavanje retka, provjera prava, dnevnik
src/queries/   čitanja za ekrane: stranice, sortiranje, filtri i zbrojevi u bazi
src/app/       ekrani, server akcije i API rute — tanki: provjera prava + poziv servisa/upita
src/lib/       infrastruktura (db, sesija, pomoćne funkcije)
prisma/        schema.prisma, migracije, seed.ts (demo podaci)
scripts/       provjere i pomoćne skripte (s testovima u scripts/lib)
```

Smjer ovisnosti: `app → services/queries → domain`. `domain` ne uvozi ništa iz ostalih slojeva.

## Pravila od prvog dana

Svako pravilo je stvarna greška koju su testeri našli na prethodnom projektu.

| # | Pravilo | Zašto (što se dogodilo) |
|---|---|---|
| 1 | Novac i razdoblja računa čista funkcija s testovima, bez baze i ekrana. | Dvostruka naplata rata, krivi iznosi kod sezone i kvartalne naplate. |
| 2 | Promjena uvjeta nikad ne mijenja fakturirano: vrijedi od prve neizdane rate. | Promjena načina naplate i cijene vraćala je plaćene mjesece. |
| 3 | Jedno pravilo za trošak robe po narudžbenici, pozvano nakon svake promjene. | Trošak robe se knjižio dvaput u 4 različita redoslijeda radnji. |
| 4 | Pravo „nabavne cijene“ provjerava poslužitelj; podatak se ne šalje pregledniku. | Curenje nabavnih cijena na 12 mjesta: ispis, izvoz, dnevnik, skener, knjigovođa, privici. |
| 5 | Izdani dokument je zaključan i pamti postavke u trenutku izdavanja. | Stari računi su mijenjali izgled kad su se promijenile postavke firme. |
| 6 | Datumi: račun ne u budućnosti, ne ranije od zadnjeg izdanog, dospijeće ne prije datuma. | Račun od 31.12. blokirao je izdavanje do kraja godine. |
| 7 | Svaka radnja koja izdaje ili knjiži zaključava redak u bazi (dvije kartice, dva korisnika). | Ista rata izdana dvaput iz ručnog i automatskog izdavanja. |
| 8 | Svaki popis s mogućih 1.000+ redaka ima stranice i zbrojeve iz baze od prvog dana. | Stranice od 5–17 MB, nadzorna ploča 5 s na 300.000 uređaja. |
| 9 | Prava se provjeravaju na poslužitelju za svaku akciju i API rutu; ne-admin ne upravlja korisnikom s većim pravima. | Preuzimanje računa administratora preko promjene lozinke. |
| 10 | Iznosi se upisuju strogo („1.500“ = 1500; „abc“ = greška, nikad 0) — uvijek `procitajIznos`. | Tekst u polju za iznos spremao se kao 0 €, „1.500“ kao 1,50 €. |
| 11 | Kolačić prijave `Secure` samo preko HTTPS-a. | Mobitel na lokalnoj mreži vraćao se na prijavu nakon svakog klika. |
| 12 | Demo podaci se učitavaju u praznu bazu u CI-u pri svakoj promjeni (`npm run test:seed`). | Punjenje demo podataka puklo je nakon novih pravila datuma. |
| 13 | Build se pokreće prije svakog commita (`npm run verify`). | Jednom je poslan kod koji se nije mogao izgraditi. |
| 14 | Zajedničke komponente (odabir partnera, izbornici) imaju vlastiti test u pregledniku. | Brzi Enter birao je krivog partnera na svim ekranima. |
| 15 | Jedan agent mijenja jedno područje; spajanje se testira odmah. | Najviše regresija nastalo je na spoju dijelova koje su radili različiti agenti. |

Dodatno:
- **Složeni strani ključevi:** svaka veza između dva modela firme ide preko `(firmaId, id)` — npr.
  `@relation(fields: [firmaId, ulogaId], references: [firmaId, id])` i `@@unique([firmaId, id])` na cilju — pa baza
  sama odbija vezu na zapis druge firme (test u `firma-db.test.ts` provjerava shemu).
- Kroz `dbFirme` se u `include/select` ne ulazi u relacije Korisnik/Firma prema drugim firmama (`RELACIJE_PREMA_FIRMAMA`),
  a ugniježđeni `create` mora imati `firmaId` — inače iznimka.
- **Id-evi od klijenta** (iz obrasca, URL-a) provjeravaju se s `jeUuid` prije upita (`src/domain/id.ts`).
- **Podaci firme samo kroz `dbFirme(sesija.firma.id)`** (`src/lib/db.ts`) — svakom upitu sam dodaje `firmaId`;
  novi model s `firmaId` obavezno ide u `MODELI_S_FIRMOM` (`src/lib/firma-db.ts`), inače test pukne.
  Goli `db` samo za sustavne tablice (Korisnik, Firma, Sesija, PokusajPrijave). U `$queryRaw` firmaId se piše ručno.
- Radnje koje se ne smiju izvesti dvaput istovremeno: transakcija + `zakljucajKljuc(tx, "vrsta:id")`
  (`src/lib/zakljucavanje.ts`) ili `SELECT … FOR UPDATE`.
- **Prava:** svaka server akcija je `export async function x(…) { return akcija("modul.radnja", async (k) => …) }`
  (`src/lib/akcija.ts`); ključ i potrebno pravo upisuju se u `AKCIJE` (`src/lib/akcije-prava.ts`), a očekivanje
  za svaku ulogu u `src/lib/akcije-prava.test.ts`. `npm run check:use-server` odbija akciju bez `akcija(…)`
  (iznimka: `// javna akcija: razlog`). Stranica počinje s `pristupStranici("/putanja")` (putanja u `STRANICE`),
  API ruta s `pristupApi(…)`. `proxy.ts` je samo brzo preusmjeravanje, ne zaštita. Prije `akcija(…)` nema `await`
  (ništa se ne radi prije provjere prava); `'use server'` samo na vrhu datoteke. Javna stranica/ruta mora imati
  komentar `// javna stranica: razlog` / `// javna ruta: razlog` — sve to provjerava `npm run check:use-server`.
- **Obrasci:** `<Obrazac akcija={posalji}>` (`src/components/ui/obrazac.tsx`) umjesto `<form action>` — neuspjelo
  spremanje ne smije obrisati upisano. Greške polja vraćaju se kao `{ ok: false, greska, polja: { ime: poruka } }`.
- **Adresa klijenta:** program se pokreće s `node posluzitelj/index.mjs` (`npm start`), koji adresu uzima iz TCP veze
  (`x-erp-ip`); zaglavljima proxyja vjeruje samo uz `VJERUJ_PROXYJU=1`. Nikad ne čitati `x-forwarded-for` u programu.
- Ograničenje prijava: 5 po e-pošti+adresi, 20 po adresi, 50 po e-pošti (napadač ne može zaključati tuđi račun).
- **Dnevnik:** svaka radnja koja mijenja podatke poziva `zapisiDnevnik(tx, …)` (`src/services/dnevnik.ts`) u ISTOJ
  transakciji, sa `staro`/`novo` (razlika se računa sama). Nabavne cijene i marže (`OSJETLJIVA_POLJA` u
  `src/domain/dnevnik.ts`) maskiraju se na poslužitelju za korisnike bez prava „costs“; lozinke se nikad ne zapisuju.
- Poslovna greška za korisnika: `throw new GreskaKorisniku("…")` u servisu → `akcija` je vraća kao `{ ok: false, greska }`.
- **Zajedničke komponente** (`src/components/ui`): `Tablica` (na mobitelu kartice; sortiranje su veze, radi u bazi),
  `Stranicenje`, `PoljePretrage`, `FilterVise` (više vrijednosti: `?status=a&status=b`), `Pretrazivac` (odabir s
  pretragom — logika u `pretrazivac-stanje.ts`), `Dijalog`, `usePoruke()`, `GumbiIzvoza` (+ izvor u `src/lib/izvoz/izvori.ts`).
  Parametri popisa uvijek kroz `src/domain/popis.ts` (sortiranje samo po dopuštenim ključevima). Nova ili promijenjena
  zajednička komponenta dobiva test u `e2e/komponente.spec.ts` (testna stranica `/razvoj/komponente`, samo uz `E2E_KOMPONENTE=1`).
- Izvoz: stupci s `osjetljivo: true` izbacuju se na poslužitelju bez prava „costs“; svaki izvoz se zapisuje u dnevnik.
- Mobitel: nijedna stranica ne smije biti šira od 390 px (`bezVodoravnogPomicanja` u e2e); `fieldset` uvijek s `min-w-0`.
- Datoteka s `'use server'` izvozi **samo async funkcije** (i tipove) — provjerava `npm run check:use-server`.
- Testovi nad bazom i demo podaci rade samo nad bazom kojoj ime sadrži „test“ (`DATABASE_URL_TEST`).
- Zakonske stvari (PDV, fiskalizacija, KPD) potvrđuje knjigovođa prije koraka.

## Naredbe

| Naredba | Što radi |
|---|---|
| `npm run dev` | razvoj na http://localhost:3000 |
| `npm test` | jedinični testovi (bez baze) — `*.test.ts` |
| `npm run test:db` | testovi nad testnom bazom — `*.db.test.ts`; prije toga primijeni migracije |
| `npm run test:seed` | nova privremena prazna baza → migracije → demo podaci → ukloni privremenu bazu |
| `npm run check:use-server` | provjera `'use server'` datoteka |
| `npm run typecheck` / `lint` / `build` | TypeScript, ESLint, izgradnja |
| `npm run test:e2e` | testovi u pregledniku (Playwright, računalo 1440 px i mobitel 390 px) nad buildom i testnom bazom |
| `npm run verify` | **sve gore redom — obavezno prije svakog commita** |
| `npm run db:migrate -- <ime>` | nova migracija iz razlike sheme i baze (radi bez terminala; odbija DROP), primijeni + generate |
| `npm run db:velika` | velika baza za mjerenje (300.000 uređaja…) u praznu bazu s „velika“ u imenu |
| `npm run mjerenje -- <adresa> <putanje…>` | vrijeme poslužitelja i veličina stranica (granice 0,5 s i 1 MB) |
| `npm run admin:prvi` | prva firma i administrator (`--ako-nema`: samo ako nema korisnika) |

Git kukice (husky): prije commita typecheck + lint + `use server` + jedinični testovi; prije pusha build.
CI (GitHub Actions) pokreće sve provjere s PostgreSQL-om na svaki push.

Baza lokalno: `docker compose up -d --wait baza` (PostgreSQL 17, pravi `erp_wms` i `erp_wms_test`).
Na Windowsu sve pokreće `pokreni.bat`.

## Konvencije

- Nazivi u kodu domene i poruke korisniku na hrvatskom (`procitajIznos`, `danas`); tehnički pojmovi okvira ostaju engleski.
- Rezultat provjere korisničkog upisa: `{ ok: true, vrijednost } | { ok: false, greska }` — greška je rečenica za korisnika.
- Test uz datoteku: `novac.ts` → `novac.test.ts`; test nad bazom → `*.db.test.ts` (pomoć: `src/test/baza.ts`);
  test u pregledniku → `e2e/*.spec.ts` (podaci u `e2e/priprema-baze.ts`).
- **Demo podaci** (`prisma/demo/`): svaki modul dodaje korak u `KORACI` (`prisma/demo/index.ts`) koji koristi
  `Slucajno` (isto sjeme = isti podaci; ispravni OIB-i, kronološki datumi) i poštuje `k.kolicine` — isti kod puni
  i veliku bazu. Za velike količine `createMany` u serijama. Prijava u demo: admin@demo.hr / Demo-lozinka-2026.
- Prisma 7: klijent se generira u `src/generated/prisma` — nakon promjene sheme `npm run db:migrate -- ime`.
- **Stanje uređaja** mijenja se SAMO kroz `promijeniStanje(tx, …)` (`src/services/uredaji.ts`), unutar transakcije:
  zaključava retke (FOR UPDATE, redom po id-u), provjerava `prijelaz` (`src/domain/stanja-uredaja.ts`), mijenja
  lokaciju/kupca i zapisuje `DogadajUredaja` s dokumentom. Nova radnja = novi redak u `RADNJE` + redak u matrici testa.
- **Brzina:** popis s 1.000+ redaka mjeri se na velikoj bazi (`npm run db:velika` u `erp_wms_velika`, zatim
  `npm run mjerenje`): ispod 0,3 s i 1 MB i s `?velicina=200`. Pretraga ne spaja velike tablice — prvo nađi id-eve u
  maloj tablici (npr. `modeliZaPretragu`). Stil ćelija tablice je u `globals.css` (`.tbl-*`), ne u svakoj ćeliji.
- Svaki upit popisa ima test nad bazom koji ga vrti kroz SVA sortiranja i filtre (greška u `orderBy` se inače vidi tek u pregledniku).
- Partner: kad novi modul počne koristiti partnera (računi, ugovori, uređaji), dodati ga u `REFERENCE_PARTNERA`
  (`src/services/partneri.ts`); cijena za kupca uvijek kroz `cijenaZaKupca` (cjenik → popust → preporučena).
- Dnevnik: `opis` se nikad ne maskira — u opis ne pisati nabavne cijene ni marže.
- `src/generated/` se generira (`prisma generate` pri `npm install`) i ne ide u git.
- **Prilozi:** `dodajPriloge`/`obrisiPrilog` (`src/services/prilozi.ts`) za svaki zapis; nova vrsta zapisa = unos u `VLASNICI`
  (postoji li zapis u firmi) i u `PRAVA_PRILOGA` (`src/lib/akcije-prava.ts`, tko smije preuzeti). Vrsta datoteke iz nastavka
  (`src/domain/prilozi.ts`), preuzimanje samo kroz `/api/prilozi/[id]`.
- **Kartica uređaja:** serijski i model zaključani čim je uređaj na dokumentu osim svoje primke (`dopustenaPolja`);
  svaki novi dokument mora u `promijeniStanje` predati `dokument` — tako ga kartica vidi kao vezu.
- **Skeniranje:** `GumbiSkenera` (`src/components/ui/skener.tsx`: kamera, slika, OCR) uz polje za USB skener (Enter);
  sadržaj koda → serijski uvijek kroz `serijskiIzKoda` (`src/domain/skeniranje.ts`). Čitač i OCR poslužuju se iz
  `public/skener` (kopira `scripts/kopiraj-skener.mjs` pri `npm install`) — nikad s CDN-a. Kamera traži HTTPS:
  `HTTPS=1` u `.env` → samopotpisani certifikat (`posluzitelj/https.mjs`); e2e i CI rade s `HTTPS=0`.
- **Skladišni dokumenti** (međuskladišnica, izlaz, povrat): `izdajDokument` (`src/services/skladisni-dokumenti.ts`) —
  uređaji na `StavkaSkladisnogDokumenta`, promjena stanja kroz `promijeniStanje` s dokumentom. Izlaz čeka odobrenje.
- **Odobrenja:** `Odobrenje` + `odluciOZahtjevu` — nitko ne odlučuje o vlastitom zahtjevu, odbijanje traži razlog;
  nova vrsta zahtjeva = grana u `odluciOZahtjevu` i putanja u `/odobrenja`.
- **Inventura** (`src/services/inventure.ts`): svaki sken odmah u bazu (`StavkaInventure`), zaključenje uspoređuje
  sa stanjem u programu (`usporedi` u `src/domain/inventura.ts`) i ne mijenja uređaje — razlike se ispravljaju dokumentima.
