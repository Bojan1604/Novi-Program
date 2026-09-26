-- AlterTable
ALTER TABLE "Firma" ADD COLUMN     "adresa" TEXT,
ADD COLUMN     "banka" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "mjesto" TEXT,
ADD COLUMN     "oznakaProstora" TEXT NOT NULL DEFAULT 'PP1',
ADD COLUMN     "oznakaUredaja" TEXT NOT NULL DEFAULT '1',
ADD COLUMN     "pdvPoNaplacenoj" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "podnozje" TEXT,
ADD COLUMN     "postanskiBroj" TEXT,
ADD COLUMN     "rokPlacanjaDana" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "telefon" TEXT,
ADD COLUMN     "uSustavuPdv" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "web" TEXT;

-- CreateTable
CREATE TABLE "ProdajniDokument" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "vrsta" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NACRT',
    "broj" TEXT,
    "godina" INTEGER,
    "redni" INTEGER,
    "datum" DATE NOT NULL,
    "vrijediDo" DATE,
    "dospijece" DATE,
    "partnerId" UUID,
    "poslovnicaId" UUID,
    "popust" INTEGER NOT NULL DEFAULT 0,
    "napomena" TEXT,
    "osnovica" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pdv" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ukupno" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "snimka" JSONB,
    "izvorId" UUID,
    "verzija" INTEGER NOT NULL DEFAULT 0,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "izdano" TIMESTAMPTZ(3),
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProdajniDokument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StavkaProdajnogDokumenta" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "dokumentId" UUID NOT NULL,
    "redoslijed" INTEGER NOT NULL,
    "vrsta" TEXT NOT NULL,
    "namjena" TEXT NOT NULL DEFAULT 'PRODAJA',
    "uredajId" UUID,
    "modelId" UUID,
    "uslugaId" UUID,
    "naziv" TEXT NOT NULL,
    "opis" TEXT,
    "kpd" TEXT,
    "jedinica" TEXT NOT NULL DEFAULT 'kom',
    "kolicina" INTEGER NOT NULL,
    "cijena" DECIMAL(14,2) NOT NULL,
    "popust" INTEGER NOT NULL DEFAULT 0,
    "vrstaIsporuke" TEXT NOT NULL,
    "stopa" INTEGER NOT NULL,
    "kategorija" TEXT NOT NULL,
    "iznos" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "StavkaProdajnogDokumenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProdajniDokument_firmaId_vrsta_datum_idx" ON "ProdajniDokument"("firmaId", "vrsta", "datum" DESC);

-- CreateIndex
CREATE INDEX "ProdajniDokument_firmaId_partnerId_idx" ON "ProdajniDokument"("firmaId", "partnerId");

-- CreateIndex
CREATE INDEX "ProdajniDokument_firmaId_izvorId_idx" ON "ProdajniDokument"("firmaId", "izvorId");

-- CreateIndex
CREATE UNIQUE INDEX "ProdajniDokument_firmaId_id_key" ON "ProdajniDokument"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProdajniDokument_firmaId_vrsta_godina_redni_key" ON "ProdajniDokument"("firmaId", "vrsta", "godina", "redni");

-- CreateIndex
CREATE INDEX "StavkaProdajnogDokumenta_dokumentId_redoslijed_idx" ON "StavkaProdajnogDokumenta"("dokumentId", "redoslijed");

-- CreateIndex
CREATE INDEX "StavkaProdajnogDokumenta_firmaId_uredajId_idx" ON "StavkaProdajnogDokumenta"("firmaId", "uredajId");

-- AddForeignKey
ALTER TABLE "ProdajniDokument" ADD CONSTRAINT "ProdajniDokument_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdajniDokument" ADD CONSTRAINT "ProdajniDokument_firmaId_partnerId_fkey" FOREIGN KEY ("firmaId", "partnerId") REFERENCES "Partner"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdajniDokument" ADD CONSTRAINT "ProdajniDokument_firmaId_poslovnicaId_fkey" FOREIGN KEY ("firmaId", "poslovnicaId") REFERENCES "Poslovnica"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaProdajnogDokumenta" ADD CONSTRAINT "StavkaProdajnogDokumenta_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaProdajnogDokumenta" ADD CONSTRAINT "StavkaProdajnogDokumenta_firmaId_dokumentId_fkey" FOREIGN KEY ("firmaId", "dokumentId") REFERENCES "ProdajniDokument"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaProdajnogDokumenta" ADD CONSTRAINT "StavkaProdajnogDokumenta_firmaId_uredajId_fkey" FOREIGN KEY ("firmaId", "uredajId") REFERENCES "Uredaj"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaProdajnogDokumenta" ADD CONSTRAINT "StavkaProdajnogDokumenta_firmaId_modelId_fkey" FOREIGN KEY ("firmaId", "modelId") REFERENCES "ModelUredaja"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaProdajnogDokumenta" ADD CONSTRAINT "StavkaProdajnogDokumenta_firmaId_uslugaId_fkey" FOREIGN KEY ("firmaId", "uslugaId") REFERENCES "Usluga"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

