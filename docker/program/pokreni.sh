#!/bin/sh
# Pokretanje u kontejneru: migracije (samo dodaju), pa poslužitelj. Greška migracije zaustavlja pokretanje.
set -e
npx prisma migrate deploy
exec node posluzitelj/index.mjs
