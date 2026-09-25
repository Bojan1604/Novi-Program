-- CreateTable
CREATE TABLE "Dnevnik" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "vrijeme" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "radnja" TEXT NOT NULL,
    "entitet" TEXT NOT NULL,
    "entitetId" TEXT,
    "opis" TEXT NOT NULL,
    "promjene" JSONB NOT NULL DEFAULT '[]',
    "pretraga" TEXT NOT NULL DEFAULT '',
    "ip" TEXT,

    CONSTRAINT "Dnevnik_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dnevnik_firmaId_vrijeme_idx" ON "Dnevnik"("firmaId", "vrijeme" DESC);

-- CreateIndex
CREATE INDEX "Dnevnik_firmaId_entitet_entitetId_vrijeme_idx" ON "Dnevnik"("firmaId", "entitet", "entitetId", "vrijeme" DESC);

-- CreateIndex
CREATE INDEX "Dnevnik_firmaId_korisnikId_vrijeme_idx" ON "Dnevnik"("firmaId", "korisnikId", "vrijeme" DESC);

-- AddForeignKey
ALTER TABLE "Dnevnik" ADD CONSTRAINT "Dnevnik_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
