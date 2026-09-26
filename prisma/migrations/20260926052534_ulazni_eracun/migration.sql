-- DropIndex
DROP INDEX "UlazniRacun_firmaId_eRacunId_idx";

-- AlterTable
ALTER TABLE "UlazniRacun" ADD COLUMN     "izvjestajId" TEXT;

-- CreateTable
CREATE TABLE "PlacanjeUlaznog" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "ulazniRacunId" UUID NOT NULL,
    "datum" DATE NOT NULL,
    "iznos" DECIMAL(14,2) NOT NULL,
    "ponisteno" BOOLEAN NOT NULL DEFAULT false,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlacanjeUlaznog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlacanjeUlaznog_firmaId_ulazniRacunId_idx" ON "PlacanjeUlaznog"("firmaId", "ulazniRacunId");

-- CreateIndex
CREATE UNIQUE INDEX "PlacanjeUlaznog_firmaId_id_key" ON "PlacanjeUlaznog"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "UlazniRacun_firmaId_eRacunId_key" ON "UlazniRacun"("firmaId", "eRacunId");

-- AddForeignKey
ALTER TABLE "PlacanjeUlaznog" ADD CONSTRAINT "PlacanjeUlaznog_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacanjeUlaznog" ADD CONSTRAINT "PlacanjeUlaznog_firmaId_ulazniRacunId_fkey" FOREIGN KEY ("firmaId", "ulazniRacunId") REFERENCES "UlazniRacun"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

