#!/bin/sh
# ERP-WMS — prva instalacija na Linux poslužitelju s Dockerom (docs/INSTALACIJA.md).
# Napravi .env sa slučajnim lozinkama (ako ne postoji), izgradi i pokrene sve, pa napravi prvog administratora.
set -eu
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo "Docker nije instaliran (https://docs.docker.com/engine/install/)."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Nedostaje „docker compose“ (Docker Compose v2)."; exit 1; }

slucajno() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }

if [ ! -f .env ]; then
  printf "Domena ili adresa poslužitelja (npr. erp.firma.hr ili 192.168.1.10): "
  read -r DOMENA
  [ -n "$DOMENA" ] || { echo "Domena je obavezna."; exit 1; }
  umask 077
  cat > .env <<KRAJ
# Produkcija (docker-compose.produkcija.yml). Ne mijenjajte TAJNI_KLJUC nakon prvog pokretanja
# (njime su šifrirane SMTP lozinka, fiskalni certifikat i tajne prijave u dva koraka).
BAZA_LOZINKA="$(slucajno 32)"
TAJNI_KLJUC="$(slucajno 48)"
DOMENA="$DOMENA"
# Noćne kopije baze: sat, broj dana čuvanja i (neobavezno) cilj izvan poslužitelja za rclone
KOPIJE_SAT="03:15"
KOPIJE_DANA="30"
KOPIJE_CILJ=""
KRAJ
  echo "Napravljena je datoteka .env (lozinke su slučajne — spremite je na sigurno mjesto)."
fi

mkdir -p kopije
docker compose -f docker-compose.produkcija.yml up -d --build --wait
echo
echo "Prvi administrator (samo ako još nema korisnika):"
docker compose -f docker-compose.produkcija.yml exec program npx tsx scripts/prvi-admin.ts --ako-nema
. ./.env
echo
echo "✔ ERP-WMS radi na https://$DOMENA"
