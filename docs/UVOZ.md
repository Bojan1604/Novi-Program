# Uvoz iz starog programa

Stranica **Sustav → Uvoz iz starog programa** (`/uvoz`, samo administrator) uvozi podatke iz jedne JSON
datoteke. Stari program (ili skripta nad njegovom bazom) izvozi podatke u format opisan ovdje;
potpun primjer je [`primjer-uvoza.json`](primjer-uvoza.json).

## Postupak

1. **Sigurnosna kopija** firme (Sustav → Sigurnosne kopije).
2. **Provjeri** — ništa se ne upisuje. Prikazuje:
   - **greške** (uvoz nije moguć dok se ne isprave u izvozu),
   - **upozorenja** (npr. neispravan OIB — partner se uvozi bez njega),
   - **izvještaj razlika**: za svaki račun iznos starog programa (`ukupno`) i iznos koji program
     izračuna iz stavki, zbrojeve po godinama i nastavak numeracije.
3. **Uvezi** — sve osim ugovora najma ide u jednoj transakciji (sve ili ništa). Ugovori najma uvoze se
   nakon toga kroz ista pravila kao ručni unos; ugovor koji ne prođe prikazuje se u izvještaju.
4. **Provjera dosljednosti** (Sustav) nakon uvoza.

Ponovni uvoz iste datoteke se odbija (serijski brojevi, brojevi računa i ugovora već postoje).

## Format

```json
{ "format": "erp-wms-uvoz", "verzija": 1, "kategorije": [], "proizvodjaci": [], "skladista": [],
  "modeli": [], "usluge": [], "partneri": [], "uredaji": [], "racuni": [], "ugovoriNajma": [] }
```

Pravila za vrijednosti:

- **Iznosi** su broj (`899.9`) ili tekst s točkom (`"899.90"`), najviše dvije decimale, **bez PDV-a**
  (osim `ukupno` i uplata). Sve ostalo (`"899,90"`, `"abc"`) je greška — nikad 0.
- **Datumi** `YYYY-MM-DD`, mjeseci `YYYY-MM`.
- **Postoci** (`popust`, `stopa`) u postocima: `10`, `25`.
- Postojeći zapisi se ne dupliciraju: kategorije, proizvođači, skladišta, usluge i modeli po nazivu
  (modeli i po šifri), partneri po OIB-u.

| Dio | Polja (obavezna **podebljana**) |
|---|---|
| `kategorije`, `proizvodjaci`, `skladista` | popis naziva (tekst) |
| `modeli` | **`naziv`**, **`proizvodjac`**, **`kategorija`**, `sifra` (ključ za uređaje; inače naziv), `preporucenaCijena`, `jamstvoMjeseci` (24), `kpd` |
| `usluge` | **`naziv`**, `sifra`, `jedinica` (kom), `cijena`, `kpd` |
| `partneri` | **`sifra`** (ključ iz starog programa), **`naziv`**, `oib`, `pdvBroj` (za HR sam: HR+OIB), `drzava` (HR), `adresa`, `postanskiBroj`, `mjesto`, `email`, `telefon`, `kupac` (true), `dobavljac` (false), `rokPlacanjaDana` (15) |
| `uredaji` | **`serijski`**, **`model`** (šifra ili naziv modela), `stanje` (`NA_SKLADISTU`, `PRODAN`, `U_NAJMU`, `OTPISAN`; `NA_SERVISU` → na skladište), `skladiste` (naziv; bez njega zadano), `partner` (šifra kupca/najmoprimca), `nabavnaCijena`, `nabavniDatum`, `jamstvoDo`, `cpu`, `ram`, `disk`, `os`, `napomena` |
| `racuni` | **`broj`** (`redni/prostor/uređaj`, npr. `41/PP1/1`; vodeće nule se zanemaruju, broj ne smije postojati ni na odobrenju ni stornu u programu), **`datum`**, **`stavke`**, `dospijece`, `partner` (šifra), `nacinPlacanja` (`T`, `G`, `K`, `O`), `popust`, `napomena`, `ukupno` (s PDV-om, za izvještaj razlika), `uplate` (`datum`, `iznos`, `nacin`), `zki`, `jir` |
| stavka računa | **`naziv`**, **`cijena`** (bez PDV-a), `kolicina` (1; do 3 decimale), `jedinica` (kom), `popust`, `stopa` (25; 0, 5, 13, 25), `serijski` (veza na uvezeni uređaj), `vrstaIsporuke` (`ROBA`/`USLUGA`), `kpd` |
| `ugovoriNajma` | **`broj`**, **`partner`** (šifra), **`od`**, `do`, `rokPlacanjaDana`, `nacinPlacanja`, `naplacenoDo` (`YYYY-MM` — zadnji mjesec koji je stari program već naplatio), **`uredaji`** (`serijski`, **`cijena`** mjesečno bez PDV-a, `od`) |

## Što program radi s uvezenim podacima

- **Uređaji** dobivaju stanje iz datoteke i događaj „uvoz“ na kartici. Uređaji s ugovora najma
  prvo idu na skladište, a ugovor ih premješta u najam (kao ručni unos).
- **Računi** su izdani i zaključani; PDV i iznosi računaju se iz stavki istim izračunom kao novi računi
  (razlika prema starom programu vidi se u izvještaju prije uvoza). Snimka podataka firme i kupca je
  današnja. Račun s JIR-om vodi se kao fiskaliziran u produkciji (čuva se 11 godina — opasna zona ga
  ne briše); bez JIR-a kao nefiskaliziran. **Uvezeni računi nikad se ne šalju CIS-u ni u eIzvještavanje.** Ni kao eRačun se ne šalju ponovno (poslani su iz starog programa).
- **Numeracija** se nastavlja: brojač niza `prostor/uređaj` za godinu postavlja se na najveći uvezeni
  redni broj, pa sljedeći račun u istom nizu i godini dobiva broj iza njega.
- **Najam**: mjeseci do `naplacenoDo` označe se „izdano izvan programa“ — program ih ne nudi za naplatu.
- Sve je zapisano u dnevniku (jedan zapis za uvoz, jedan po ugovoru).
