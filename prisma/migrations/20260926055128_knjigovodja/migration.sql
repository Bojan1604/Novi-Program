-- AlterTable
ALTER TABLE "Firma" ADD COLUMN     "epostaKnjigovodje" TEXT;

-- CreateTable
CREATE TABLE "PredajaKnjigovodji" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "mjesec" DATE NOT NULL,
    "nacin" TEXT NOT NULL,
    "prima" TEXT,
    "izlaznih" INTEGER NOT NULL,
    "ulaznih" INTEGER NOT NULL,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "vrijeme" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredajaKnjigovodji_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PredajaKnjigovodji_firmaId_mjesec_idx" ON "PredajaKnjigovodji"("firmaId", "mjesec");

-- CreateIndex
CREATE UNIQUE INDEX "PredajaKnjigovodji_firmaId_id_key" ON "PredajaKnjigovodji"("firmaId", "id");

-- AddForeignKey
ALTER TABLE "PredajaKnjigovodji" ADD CONSTRAINT "PredajaKnjigovodji_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

