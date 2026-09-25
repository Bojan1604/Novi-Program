-- Pretraga po dijelu serijskog broja: trigramski indeks (pg_trgm)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "Uredaj_serijski_trgm" ON "Uredaj" USING GIN ("serijski" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Uredaj_firmaId_nabavniDatum_idx" ON "Uredaj"("firmaId", "nabavniDatum" DESC);

-- CreateIndex
CREATE INDEX "Uredaj_firmaId_jamstvoDo_idx" ON "Uredaj"("firmaId", "jamstvoDo");

