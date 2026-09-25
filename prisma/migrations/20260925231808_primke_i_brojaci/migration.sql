-- AlterTable
ALTER TABLE "Uredaj" ADD COLUMN     "primkaId" UUID;

-- CreateTable
CREATE TABLE "Brojac" (
    "firmaId" UUID NOT NULL,
    "vrsta" TEXT NOT NULL,
    "godina" INTEGER NOT NULL,
    "zadnji" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Brojac_pkey" PRIMARY KEY ("firmaId","vrsta","godina")
);

-- CreateTable
CREATE TABLE "Primka" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "broj" TEXT NOT NULL,
    "godina" INTEGER NOT NULL,
    "redni" INTEGER NOT NULL,
    "datum" DATE NOT NULL,
    "dobavljacId" UUID,
    "skladisteId" UUID NOT NULL,
    "dokumentDobavljaca" TEXT,
    "napomena" TEXT,
    "knjiziUTroskove" BOOLEAN NOT NULL DEFAULT false,
    "brojUredaja" INTEGER NOT NULL,
    "nabavnaVrijednost" DECIMAL(14,2),
    "status" TEXT NOT NULL DEFAULT 'IZDANA',
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Primka_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Primka_firmaId_datum_idx" ON "Primka"("firmaId", "datum" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Primka_firmaId_id_key" ON "Primka"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Primka_firmaId_godina_redni_key" ON "Primka"("firmaId", "godina", "redni");

-- CreateIndex
CREATE INDEX "Uredaj_primkaId_idx" ON "Uredaj"("primkaId");

-- AddForeignKey
ALTER TABLE "Uredaj" ADD CONSTRAINT "Uredaj_firmaId_primkaId_fkey" FOREIGN KEY ("firmaId", "primkaId") REFERENCES "Primka"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brojac" ADD CONSTRAINT "Brojac_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Primka" ADD CONSTRAINT "Primka_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Primka" ADD CONSTRAINT "Primka_firmaId_dobavljacId_fkey" FOREIGN KEY ("firmaId", "dobavljacId") REFERENCES "Partner"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Primka" ADD CONSTRAINT "Primka_firmaId_skladisteId_fkey" FOREIGN KEY ("firmaId", "skladisteId") REFERENCES "Skladiste"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

