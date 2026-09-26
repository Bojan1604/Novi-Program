# ERP-WMS MDM agent za Android

Izvorni kod aplikacije (Kotlin, minSdk 26) — gradi se u Android Studiju: *Build → Generate Signed APK*.
Aplikacija mora biti **Device Owner** (tvornički resetiran uređaj):

- QR postavljanje (Android Enterprise): na zaslonu dobrodošlice 6× dodirnuti ekran pa skenirati QR s
  `android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME = hr.erpwms.mdm/.AdminReceiver`,
  poveznicom na potpisani APK, njegovim SHA-256 i `PROVISIONING_ADMIN_EXTRAS_BUNDLE = { "adresa": "https://…", "kod": "…" }`.
- Za testiranje: `adb shell dpm set-device-owner hr.erpwms.mdm/.AdminReceiver`, pa u aplikaciji upisati adresu i kod.

Agent se javlja svakih 15 minuta (najkraći razmak WorkManagera). Podržano: zaključavanje, ponovno pokretanje,
vraćanje na tvorničke postavke, poruka, instalacija/uklanjanje aplikacija bez pitanja korisnika, profil
(duljina PIN-a, zaključavanje, kamera, USB, Wi-Fi, kiosk), datoteke, zapisnik. Snimka zaslona na Androidu nije
podržana (Android je ne dopušta bez korisnikove potvrde) — program je za Android i ne nudi.
Nova verzija agenta distribuira se kao obična MDM aplikacija (paket `hr.erpwms.mdm`, veći versionCode).
