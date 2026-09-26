# Testno okruženje ePoslovanja (korak 7.5)

Fiskalizacija i eRačun rade u programu u **demo načinu** bez ikakvih vanjskih podataka. Prije rada s pravim
računima sve se prolazi na **testnom okruženju** Porezne uprave (CIS) i posrednika — na računalu na kojem
program radi, jer su tamo mreža i certifikat.

## 1. Fiskalizacija (CIS) na testu

Potrebno: **demo certifikat za fiskalizaciju** (FINA → „Demo certifikati“ → aplikacijski certifikat za
fiskalizaciju, izdan na OIB firme) i lozinka. Test adresa CIS-a: `cistest.apis-it.hr:8449` — izlazni port 8449
mora biti dopušten.

1. **Postavke firme → Fiskalizacija**: učitajte demo certifikat (.p12) i lozinku, oznaka poslovnog prostora i
   naplatnog uređaja (kako su prijavljeni), način **TEST**.
2. Na poslužitelju:
   ```sh
   npm run eposlovanje:provjera -- --oib <OIB firme> --posalji
   # u Dockeru:
   docker compose -f docker-compose.produkcija.yml exec program npm run eposlovanje:provjera -- --oib <OIB> --posalji
   ```
   Provjeri dostupnost CIS-a (Echo), certifikat (čita se, vrijedi) i pošalje **jedan probni račun samo na TEST**
   (nikad na produkciju) — očekuje se `✔ … JIR …`.
3. U programu izdajte po jedan dokument svake vrste i provjerite JIR na dokumentu (i QR kod na PDF-u):

| # | Dokument | Očekivano |
|---|---|---|
| 1 | Račun, gotovina (G), kupac s OIB-om | JIR odmah |
| 2 | Račun, kartica (K) | JIR odmah |
| 3 | Račun, transakcijski (T), kupac **bez** OIB-a (građanin) | JIR (fiskalizira se) |
| 4 | Račun, transakcijski (T), kupac s OIB-om | ne fiskalizira se (nije potrebno) |
| 5 | Storno fiskaliziranog računa | JIR, iznosi s minusom |
| 6 | Odobrenje (povrat) | JIR |
| 7 | Račun za predujam i konačni račun s odbitkom predujma | JIR na oba |
| 8 | Račun za najam iz „Rate za izdati“ | JIR |
| 9 | Račun izdan dok CIS nije dostupan (isključite mrežu) | status „čeka“, pa naknadna dostava sama za ~1 min (oznaka naknadne dostave) |

4. Tek kad sve prođe: pravi (produkcijski) certifikat i način **PRODUKCIJA**. Od tada se fiskalizirani
   računi ne mogu obrisati (opasna zona) — čuvaju se 11 godina.

## 2. eRačun

Program izrađuje eRačun (UBL 2.1, HR-CIUS s KPD oznakama), provjerava primatelja u adresaru (AMS), šalje,
prati status, prima ulazne eRačune i radi eIzvještavanje — preko **informacijskog posrednika**. Ugrađen je
**demo posrednik** (`ERACUN_POSREDNIK=demo`), koji ništa ne šalje van.

Za stvarno slanje treba odabrati posrednika (ugovor, testni pristupni podaci i njegova API dokumentacija) i
dodati spoj u `src/lib/eracun/posrednik.ts` — sučelje `Posrednik` ima sedam radnji:

| Radnja | Što posrednik radi |
|---|---|
| `provjeriPrimatelja(oib)` | je li primatelj u AMS-u i njegova adresa |
| `posalji(xml, …)` | šalje UBL, vraća id |
| `status(id)` | isporučen / prihvaćen / odbijen / greška |
| `izvijesti(…)` | eIzvještavanje: naplata ili odbijanje |
| `preuzmi(oib)` / `potvrdi(oib, id)` | ulazni eRačuni i potvrda preuzimanja |
| `odgovori(id, status, razlog)` | prihvat ili odbijanje ulaznog eRačuna |

Zatim `ERACUN_POSREDNIK=<ime>` u `.env` i na testu posrednika: po jedan eRačun svake vrste (račun, odobrenje,
storno, predujam), primatelj u AMS-u i izvan njega, ulazni eRačun (prihvat i odbijanje), eIzvještavanje naplate.
`npm run eposlovanje:provjera` ispiše koji je posrednik postavljen.
