# Instalacija za svakodnevni rad

Dva načina:

| | Za koga | HTTPS | Kopije |
|---|---|---|---|
| **A. Poslužitelj (preporučeno)** | Linux poslužitelj ili virtualka (u uredu ili u oblaku) | Caddy — Let's Encrypt za javnu domenu, vlastiti certifikat za lokalnu adresu | noćni `pg_dump` + slanje izvan poslužitelja (rclone) |
| B. Jedno Windows računalo | mala firma, program na jednom računalu u uredu | samopotpisani certifikat (`pokreni.bat`) | kopije u programu (Sustav → Sigurnosne kopije) + preuzimanje |

## A. Poslužitelj (Docker)

Potrebno: Linux (Ubuntu 24.04 ili Debian 12), 2 CPU, 4 GB RAM, 40 GB diska; za javnu domenu DNS zapis
(npr. `erp.firma.hr` → IP poslužitelja) i otvoreni portovi 80 i 443.

1. **Docker** — na poslužitelju:
   ```sh
   curl -fsSL https://get.docker.com | sh
   ```
2. **Program**:
   ```sh
   git clone https://github.com/bojan1604/novi-program.git erp-wms
   cd erp-wms
   ```
3. **Instalacija** — jedna naredba:
   ```sh
   ./instaliraj.sh
   ```
   - pita domenu ili adresu poslužitelja,
   - napravi `.env` sa slučajnom lozinkom baze i ključem za šifriranje tajni (**spremite kopiju `.env` na
     sigurno mjesto** — bez `TAJNI_KLJUC` se ne mogu pročitati SMTP lozinka ni fiskalni certifikat),
   - izgradi i pokrene bazu, program, HTTPS i kopije,
   - pita podatke prve firme i administratora.
4. Otvorite `https://<domena>` i prijavite se. Zatim u programu:
   - **Sustav → Postavke firme**: podaci za dokumente, IBAN, logo, boja, SMTP za e-poštu,
   - **Fiskalizacija**: učitajte certifikat (.p12) i prvo odaberite **TEST**, pa tek onda **PRODUKCIJA**,
   - **Sustav → Korisnici**: dodajte korisnike (ili ih pozovite ako već imaju račun u drugoj firmi),
   - **Sustav → Uvoz iz starog programa** ako prenosite podatke (docs/UVOZ.md).

### Ažuriranje (jedna naredba)

```sh
./azuriraj.sh
```

Napravi kopiju baze, preuzme novu verziju, izgradi je i pokrene (migracije baze primijene se same; one
samo dodaju, nikad ne brišu podatke).

### Kopije baze

- Svaku noć u `KOPIJE_SAT` (03:15) kontejner `kopije` spremi cijelu bazu u mapu `kopije/` i čuva
  `KOPIJE_DANA` (30) dana. Kopija odmah: `docker compose -f docker-compose.produkcija.yml exec kopije kopiraj.sh sada`.
- **Izvan poslužitelja** (obavezno — kopija na istom disku ne štiti od kvara diska ili požara): u `.env`
  postavite `KOPIJE_CILJ`, a postavke rclonea u datoteku `kopije.env`, npr. za S3 (Backblaze B2, Wasabi, AWS):
  ```sh
  # kopije.env
  RCLONE_CONFIG_OBLAK_TYPE=s3
  RCLONE_CONFIG_OBLAK_PROVIDER=Other
  RCLONE_CONFIG_OBLAK_ENDPOINT=https://s3.eu-central-003.backblazeb2.com
  RCLONE_CONFIG_OBLAK_ACCESS_KEY_ID=...
  RCLONE_CONFIG_OBLAK_SECRET_ACCESS_KEY=...
  ```
  i u `.env`: `KOPIJE_CILJ="oblak:erp-kopije"`. Za SFTP na drugo računalo: `RCLONE_CONFIG_NAS_TYPE=sftp`,
  `..._HOST`, `..._USER`, `..._PASS` (lozinka iz `rclone obscure`), `KOPIJE_CILJ="nas:/kopije/erp"`.
  Zatim `docker compose -f docker-compose.produkcija.yml up -d` i provjera: `... exec kopije kopiraj.sh sada`.
- **Vraćanje cijele baze** (npr. na novi poslužitelj nakon instalacije):
  ```sh
  docker compose -f docker-compose.produkcija.yml stop program
  docker compose -f docker-compose.produkcija.yml exec -T baza pg_restore -U erp -d erp_wms --clean --if-exists < kopije/erp-2026-09-26-0315.dump
  docker compose -f docker-compose.produkcija.yml start program
  ```
  Za vraćanje treba i isti `TAJNI_KLJUC` u `.env`.
- Uz to program ima i **kopije po firmi** (Sustav → Sigurnosne kopije) koje se mogu vratiti u novu firmu.

### Provjera stanja

```sh
docker compose -f docker-compose.produkcija.yml ps          # svi „healthy“ / „running“
docker compose -f docker-compose.produkcija.yml logs -f program
```

## B. Jedno Windows računalo

1. Instalirajte [Node.js 22 LTS](https://nodejs.org) i [Docker Desktop](https://www.docker.com/products/docker-desktop/), pokrenite Docker Desktop.
2. Preuzmite program (zip s GitHuba ili `git clone`) i dvaput kliknite **`pokreni.bat`**.
3. Prvi put napravi `.env` (slučajna lozinka baze i ključ tajni), pita podatke firme i administratora,
   izgradi i pokrene program na `https://localhost:3000`. S mobitela u istoj mreži: adresa se ispiše u prozoru.
4. Ažuriranje: preuzmite novu verziju u istu mapu (datoteku `.env` ostavite) i ponovno pokrenite `pokreni.bat`.
5. Kopije: **Sustav → Sigurnosne kopije** — dnevne kopije rade same; povremeno preuzmite kopiju na
   drugo mjesto (USB, oblak).

## Nakon instalacije — vanjske postavke

| Što | Gdje | Bez toga |
|---|---|---|
| Fiskalni certifikat (.p12) i lozinka | Postavke firme → Fiskalizacija | računi se fiskaliziraju u demo načinu (lažni JIR) |
| Posrednik za eRačun | `ERACUN_POSREDNIK` u `.env` — spoj na odabranog posrednika treba dodati uz njegove pristupne podatke i API (`src/lib/eracun/posrednik.ts`) | eRačuni se izrađuju (UBL 2.1) i šalju demo posredniku |
| SMTP | Postavke firme → E-pošta | slanje kroz program za poštu (mailto) |
| Sudski registar (`SUDREG_CLIENT_ID`, `SUDREG_CLIENT_SECRET`) | `.env` | podaci o firmi upisuju se ručno |
