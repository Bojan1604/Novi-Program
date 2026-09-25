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
- **Podaci firme samo kroz `dbFirme(sesija.firma.id)`** (`src/lib/db.ts`) — svakom upitu sam dodaje `firmaId`;
  novi model s `firmaId` obavezno ide u `MODELI_S_FIRMOM` (`src/lib/firma-db.ts`), inače test pukne.
  Goli `db` samo za sustavne tablice (Korisnik, Firma, Sesija, PokusajPrijave). U `$queryRaw` firmaId se piše ručno.
- Radnje koje se ne smiju izvesti dvaput istovremeno: transakcija + `zakljucajKljuc(tx, "vrsta:id")`
  (`src/lib/zakljucavanje.ts`) ili `SELECT … FOR UPDATE`.
- **Prava:** svaka server akcija je `export async function x(…) { return akcija("modul.radnja", async (k) => …) }`
  (`src/lib/akcija.ts`); ključ i potrebno pravo upisuju se u `AKCIJE` (`src/lib/akcije-prava.ts`), a očekivanje
  za svaku ulogu u `src/lib/akcije-prava.test.ts`. `npm run check:use-server` odbija akciju bez `akcija(…)`
  (iznimka: `// javna akcija: razlog`). Stranica počinje s `pristupStranici("/putanja")` (putanja u `STRANICE`),
  API ruta s `pristupApi(…)`. `proxy.ts` je samo brzo preusmjeravanje, ne zaštita.
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
| `npm run db:migrate -- --name <ime>` | nova migracija u razvoju (+ `prisma generate` automatski) |
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
- Prisma 7: klijent se generira u `src/generated/prisma` — nakon promjene sheme `npm run db:migrate`.
- `src/generated/` se generira (`prisma generate` pri `npm install`) i ne ide u git.
