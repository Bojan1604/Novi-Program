-- AlterTable
ALTER TABLE "Primka" ADD COLUMN     "narudzbenicaId" UUID;

-- AlterTable
ALTER TABLE "Uredaj" ADD COLUMN     "stavkaNarudzbeniceId" UUID;

-- CreateTable
CREATE TABLE "Narudzbenica" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "broj" TEXT NOT NULL,
    "godina" INTEGER NOT NULL,
    "redni" INTEGER NOT NULL,
    "datum" DATE NOT NULL,
    "dobavljacId" UUID NOT NULL,
    "pdvRezim" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OTVORENA',
    "napomena" TEXT,
    "osnovica" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "verzija" INTEGER NOT NULL DEFAULT 0,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Narudzbenica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StavkaNarudzbenice" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "narudzbenicaId" UUID NOT NULL,
    "redoslijed" INTEGER NOT NULL,
    "modelId" UUID NOT NULL,
    "kolicina" INTEGER NOT NULL,
    "cijena" DECIMAL(14,2) NOT NULL,
    "zaprimljeno" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StavkaNarudzbenice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Narudzbenica_firmaId_datum_idx" ON "Narudzbenica"("firmaId", "datum" DESC);

-- CreateIndex
CREATE INDEX "Narudzbenica_firmaId_dobavljacId_idx" ON "Narudzbenica"("firmaId", "dobavljacId");

-- CreateIndex
CREATE UNIQUE INDEX "Narudzbenica_firmaId_id_key" ON "Narudzbenica"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Narudzbenica_firmaId_godina_redni_key" ON "Narudzbenica"("firmaId", "godina", "redni");

-- CreateIndex
CREATE INDEX "StavkaNarudzbenice_firmaId_narudzbenicaId_idx" ON "StavkaNarudzbenice"("firmaId", "narudzbenicaId");

-- CreateIndex
CREATE UNIQUE INDEX "StavkaNarudzbenice_firmaId_id_key" ON "StavkaNarudzbenice"("firmaId", "id");

-- AddForeignKey
ALTER TABLE "Uredaj" ADD CONSTRAINT "Uredaj_firmaId_stavkaNarudzbeniceId_fkey" FOREIGN KEY ("firmaId", "stavkaNarudzbeniceId") REFERENCES "StavkaNarudzbenice"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Primka" ADD CONSTRAINT "Primka_firmaId_narudzbenicaId_fkey" FOREIGN KEY ("firmaId", "narudzbenicaId") REFERENCES "Narudzbenica"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Narudzbenica" ADD CONSTRAINT "Narudzbenica_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Narudzbenica" ADD CONSTRAINT "Narudzbenica_firmaId_dobavljacId_fkey" FOREIGN KEY ("firmaId", "dobavljacId") REFERENCES "Partner"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaNarudzbenice" ADD CONSTRAINT "StavkaNarudzbenice_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaNarudzbenice" ADD CONSTRAINT "StavkaNarudzbenice_firmaId_narudzbenicaId_fkey" FOREIGN KEY ("firmaId", "narudzbenicaId") REFERENCES "Narudzbenica"("firmaId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaNarudzbenice" ADD CONSTRAINT "StavkaNarudzbenice_firmaId_modelId_fkey" FOREIGN KEY ("firmaId", "modelId") REFERENCES "ModelUredaja"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

