#!/bin/sh
# ERP-WMS — nova verzija jednom naredbom: preuzmi, izgradi, pokreni (migracije se primijene same pri pokretanju).
# Prije ažuriranja napravi kopiju baze (kontejner „kopije“), pa ako nešto pođe po zlu, podaci su sačuvani.
set -eu
cd "$(dirname "$0")"
DC="docker compose -f docker-compose.produkcija.yml"
echo "[1/4] Kopija baze prije ažuriranja…"
$DC exec -T kopije kopiraj.sh sada
echo "[2/4] Nova verzija programa…"
git pull --ff-only
echo "[3/4] Izgradnja i pokretanje…"
$DC up -d --build --wait
echo "[4/4] Čišćenje starih slika…"
docker image prune -f >/dev/null
echo "✔ Ažurirano: $(git log -1 --format='%h %s')"
