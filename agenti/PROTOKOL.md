# MDM agent — protokol

Agent (Windows ili Android) razgovara s poslužiteljem ERP-WMS preko HTTPS-a, JSON-om.
Svi zahtjevi nakon upisa nose zaglavlje `Authorization: Bearer <token>`; token se dobiva
samo jednom (pri upisu), agent ga čuva zaštićeno (Windows: ProgramData s ACL-om samo za
SYSTEM i administratore; Android: EncryptedSharedPreferences). U bazi se čuva samo hash.

## 1. Upis

QR organizacije sadrži `{"erpMdm":1,"adresa":"https://poslužitelj","kod":"ABCD-EFGH-JKMN"}`;
kod se može i upisati ručno (mala slova, razmaci i crtice su dopušteni).

```
POST /api/mdm/upis
{ "kod": "ABCD-EFGH-JKMN", "serijski": "R58N1234", "platforma": "ANDROID" | "WINDOWS",
  "naziv": "Tablet skladište 1", "model": "Galaxy Tab A9", "osVerzija": "14", "verzijaAgenta": "1.0.0" }
→ 200 { "uredajId": "…", "token": "…" }      400 { "greska": "…" }
```

Isti serijski u istoj firmi ponovno se upisuje (novi token, stari prestaje vrijediti), osim ako je uređaj blokiran.

## 2. Javljanje (svakih 5 minuta i odmah nakon izvršene naredbe)

```
POST /api/mdm/javi
{ "izvjestaj": { "baterija": 81, "slobodnoGB": 12.5, "ip": "10.0.0.15", "korisnik": "…",
                 "aplikacije": [ { "paket": "com.firma.app", "verzijaKod": 3 } ] } }
→ 200 {
  "naredbe":   [ { "id": "…", "vrsta": "ZAKLJUCAJ" | "PONOVNO_POKRENI" | "SNIMI_ZASLON" | "PORUKA" |
                   "POSALJI_ZAPISNIK" | "INSTALIRAJ" | "DEINSTALIRAJ" | "OBRISI_PODATKE",
                   "parametri": { "tekst": "…" } | { "aplikacijaId": "…" } | { "paket": "…" } | {} } ],
  "profil":    null | { "verzija": 3, "lozinkaMin": 6, "zakljucajNakonMin": 5, "kameraDopustena": false,
                        "usbDopusten": true, "wifiSsid": "Ured", "wifiLozinka": "…", "kiosk": null },
  "aplikacije":[ { "id": "…", "paket": "com.firma.app", "verzija": "2.0", "verzijaKod": 4,
                   "sha256": "…", "velicina": 12345, "adresa": "/api/mdm/aplikacije/<id>" } ],
  "datoteke":  [ { "id": "…", "naziv": "upute.pdf", "putanja": "Download/Firma", "sha256": "…",
                   "velicina": 999, "adresa": "/api/mdm/datoteke/<id>" } ] }
401 = uređaj nije upisan ili je blokiran (agent prestaje i čeka novi upis).
```

- Popis `aplikacije` u izvještaju je obavezan za automatsko ažuriranje: kad je javljena verzija starija
  od najnovije dodijeljene, poslužitelj sam dodaje naredbu `INSTALIRAJ` (samo jednom dok čeka).
- Naredbe se vraćaju dok agent ne javi rezultat — agent ih izvršava idempotentno (pamti id-eve izvršenih).
- Profil primjenjuje samo kad se `verzija` promijeni.
- Datoteke preuzima kad lokalno nema datoteke s istim SHA-256.

## 3. Rezultat naredbe, zapisnik, snimka zaslona

```
POST /api/mdm/rezultat  { "naredbaId": "…", "uspjeh": true, "poruka": "Instalirano 2.0" }
POST /api/mdm/zapisnik  { "zapisi": [ { "razina": "INFO" | "UPOZORENJE" | "GRESKA", "poruka": "…", "vrijeme": "ISO-8601" } ] }
POST /api/mdm/zaslon    tijelo = PNG ili JPEG (do 8 MB), zaglavlje X-Naredba: <id naredbe SNIMI_ZASLON>
GET  /api/mdm/aplikacije/<id>   → APK/MSI (zaglavlje X-Sha256 — agent provjerava prije instalacije)
GET  /api/mdm/datoteke/<id>     → datoteka (X-Sha256)
```

## Agenti

- `windows/` — PowerShell agent (Windows 10/11), radi kao zakazani zadatak pod SYSTEM-om.
- `android/` — Kotlin agent (Device Owner), izvorni kod za Android Studio.
- `scripts/mdm-agent.ts` — ispitni agent (simulacija uređaja) za provjeru poslužitelja bez pravog uređaja:
  `npm run mdm:agent -- --adresa http://localhost:3000 --kod ABCD-EFGH-JKMN --serijski TEST-1`.
