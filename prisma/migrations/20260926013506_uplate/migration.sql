-- AlterTable
ALTER TABLE "ProdajniDokument" ADD COLUMN     "placeno" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Uplata" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "dokumentId" UUID NOT NULL,
    "datum" DATE NOT NULL,
    "iznos" DECIMAL(14,2) NOT NULL,
    "nacin" TEXT NOT NULL DEFAULT 'T',
    "opis" TEXT,
    "ponistena" BOOLEAN NOT NULL DEFAULT false,
    "razlogPonistenja" TEXT,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Uplata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Uplata_firmaId_dokumentId_idx" ON "Uplata"("firmaId", "dokumentId");

-- CreateIndex
CREATE INDEX "Uplata_firmaId_datum_idx" ON "Uplata"("firmaId", "datum" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Uplata_firmaId_id_key" ON "Uplata"("firmaId", "id");

-- AddForeignKey
ALTER TABLE "Uplata" ADD CONSTRAINT "Uplata_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Uplata" ADD CONSTRAINT "Uplata_firmaId_dokumentId_fkey" FOREIGN KEY ("firmaId", "dokumentId") REFERENCES "ProdajniDokument"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

