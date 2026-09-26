# Brzina na velikoj bazi (korak 7.2)

Mjereno na bazi napunjenoj s `npm run db:velika` (isti kod kao demo podaci): **301.875 uređaja,
100.043 računa, 3.000 ugovora najma (79.901 rata), 5.003 partnera** — baza 571 MB.
Izgrađeni program (`npm run build`, `node posluzitelj/index.mjs`), PostgreSQL 17 na istom računalu.

```sh
DATABASE_URL=postgresql://…/erp_wms_velika npm run db:velika        # ~7 min
DATABASE_URL=postgresql://…/erp_wms_velika npm run mjerenje -- http://localhost:3000 --sve
```

Granice: **0,5 s na poslužitelju i 1 MB** po stranici (najbolje od 3 učitavanja). Mjeri se svaka stranica
izbornika, popisi s 200 redaka (`?velicina=200`), svi izvještaji i po jedna kartica svake vrste.

Ispravljeno u ovom koraku:

| Stranica | Prije | Poslije | Uzrok |
|---|---:|---:|---|
| `/marze` | 3.967 ms | 180 ms | podupit nabave za svaki od 100.000 računa i zbrajanje u programu → jedno grupiranje u bazi |
| `/izvjestaji/marze-mjeseci` | 1.284 ms | 72 ms | isto |
| `/izvjestaji/zaliha-modeli` | 583 ms | 61 ms | spajanje 300.000 uređaja s nazivima prije grupiranja → grupiranje po id-evima, nazivi na grupama |

## Rezultat (sve stranice)

| Stranica | ms | KB |
|---|---:|---:|
| `/provjera` | 201 | 33 |
| `/marze` | 180 | 61 |
| `/racuni?velicina=200` | 155 | 721 |
| `/izvjestaji/prihod-modeli` | 144 | 48 |
| `/uredaji/[id]` | 137 | 48 |
| `/` | 113 | 40 |
| `/uredaji?velicina=200` | 111 | 624 |
| `/racuni` | 111 | 215 |
| `/najam/rate` | 106 | 134 |
| `/` | 105 | 40 |
| `/izvjestaji/potrazivanja` | 101 | 157 |
| `/uredaji` | 92 | 187 |
| `/izvjestaji/najam-ugovori` | 85 | 139 |
| `/izvjestaji/prihod-kupci` | 58 | 155 |
| `/izvjestaji/prihod-mjeseci` | 53 | 55 |
| `/izvjestaji/zaliha-modeli` | 52 | 71 |
| `/izvjestaji/troskovi-kategorije` | 51 | 48 |
| `/izvjestaji/servis-mjeseci` | 50 | 48 |
| `/izvjestaji/marze-mjeseci` | 49 | 58 |
| `/ulazni?velicina=200` | 46 | 614 |
| `/primke?velicina=200` | 44 | 526 |
| `/nabava?velicina=200` | 44 | 523 |
| `/najam?velicina=200` | 42 | 444 |
| `/partneri?velicina=200` | 41 | 480 |
| `/mdm/[id]` | 39 | 394 |
| `/troskovi` | 38 | 149 |
| `/servis?velicina=200` | 33 | 310 |
| `/primke` | 33 | 159 |
| `/mdm` | 33 | 389 |
| `/inventure` | 33 | 35 |
| `/troskovi?velicina=200` | 32 | 149 |
| `/dnevnik` | 31 | 143 |
| `/najam/[id]` | 28 | 60 |
| `/servis` | 27 | 168 |
| `/partneri` | 27 | 146 |
| `/knjigovodja` | 27 | 116 |
| `/ulazni` | 25 | 178 |
| `/racuni/[id]` | 25 | 45 |
| `/najam` | 23 | 133 |
| `/inventure/[id]` | 22 | 35 |
| `/cjenici/[id]` | 22 | 63 |
| `/primke/[id]` | 21 | 132 |
| `/nabava` | 21 | 153 |
| `/korisnici` | 21 | 47 |
| `/dnevnik?velicina=200` | 21 | 143 |
| `/nabava/[id]` | 20 | 39 |
| `/kopije` | 20 | 29 |
| `/servis/[id]` | 18 | 44 |
| `/ponude/[id]` | 18 | 42 |
| `/partneri/[id]` | 18 | 44 |
| `/mdm/uredaji/[id]` | 18 | 36 |
| `/cjenici` | 18 | 27 |
| `/ulazni/[id]` | 17 | 40 |
| `/skladisni/[id]` | 17 | 35 |
| `/skladisni` | 17 | 43 |
| `/postavke` | 17 | 49 |
| `/najam/[id]/raspored` | 17 | 37 |
| `/izvjestaji` | 17 | 33 |
| `/eracuni` | 17 | 26 |
| `/troskovi/[id]` | 16 | 34 |
| `/ponude` | 16 | 47 |
| `/opasna-zona` | 16 | 29 |
| `/odobrenja` | 16 | 28 |
| `/moj-racun` | 16 | 28 |
| `/firme` | 16 | 29 |
| `/uloge` | 15 | 31 |
| `/skeniranje` | 15 | 25 |
| `/sifrarnici` | 15 | 29 |
| `/uvoz` | 14 | 27 |
