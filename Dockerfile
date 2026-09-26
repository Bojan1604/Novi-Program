# ERP-WMS — slika programa za produkciju (docker-compose.produkcija.yml).
# Izgradnja: npm ci → prisma generate → next build. Pri pokretanju: migracije, pa poslužitelj.
FROM node:22-bookworm-slim AS izgradnja
WORKDIR /program
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NEXT_TELEMETRY_DISABLED=1 HUSKY=0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY scripts/kopiraj-skener.mjs ./scripts/kopiraj-skener.mjs
RUN npm ci
COPY . .
# za build je dovoljna bilo koja adresa baze (stranice su dinamične); prava dolazi iz okoline pri pokretanju
RUN DATABASE_URL="postgresql://izgradnja:izgradnja@localhost:5432/izgradnja" npm run build

FROM node:22-bookworm-slim
WORKDIR /program
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 TZ=Europe/Zagreb PORT=3000 HOST=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tzdata && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --home /program erp
COPY --from=izgradnja --chown=erp:erp /program ./
USER erp
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:3000/api/zdravlje').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "docker/program/pokreni.sh"]
