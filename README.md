# ERP-WMS

Skladište, prodaja, najam, nabava i servis uređaja.

## Pokretanje na Windowsu

1. Instalirajte [Node.js 22 LTS](https://nodejs.org) i [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Pokrenite Docker Desktop.
3. Dvaput kliknite `pokreni.bat`.

Skripta pokrene bazu, instalira pakete, primijeni migracije, izgradi program i pokrene ga
na http://localhost:3000. Ako nešto ne uspije, zaustavi se i napiše što.

## Razvoj

```bash
cp .env.example .env
docker compose up -d --wait baza
npm install
npm run dev
```

Prije svakog commita: `npm run verify`. Pravila i arhitektura su u [CLAUDE.md](CLAUDE.md).

## Dokumentacija

- [Instalacija za svakodnevni rad](docs/INSTALACIJA.md) — poslužitelj (Docker, HTTPS, kopije izvan poslužitelja, ažuriranje jednom naredbom) ili jedno Windows računalo
- [Uvoz iz starog programa](docs/UVOZ.md) — format JSON-a i postupak
- [Brzina na velikoj bazi](docs/BRZINA.md) — mjerenje svih stranica
- [Testno okruženje ePoslovanja](docs/EPOSLOVANJE.md) — fiskalizacija na testu CIS-a i spoj posrednika za eRačun
- Demo: `npx prisma db seed` u praznu bazu, prijava `admin@demo.hr` / `Demo-lozinka-2026` (portal: `klijent1@demo.hr` / `Portal-lozinka-2026`)
