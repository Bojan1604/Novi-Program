-- AlterEnum
ALTER TYPE "StanjeUredaja" ADD VALUE 'ZAMJENSKI';

-- CreateTable
CREATE TABLE "ServisniNalog" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "broj" TEXT NOT NULL,
    "godina" INTEGER NOT NULL,
    "redni" INTEGER NOT NULL,
    "datum" DATE NOT NULL,
    "uredajId" UUID NOT NULL,
    "partnerId" UUID,
    "ugovorNajmaId" UUID,
    "stanjePrije" "StanjeUredaja" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ZAPRIMLJEN',
    "opisKvara" TEXT NOT NULL,
    "dijagnoza" TEXT,
    "napomenaKlijentu" TEXT,
    "kontakt" TEXT,
    "izvor" TEXT NOT NULL DEFAULT 'PROGRAM',
    "zamjenskiUredajId" UUID,
    "zamjenaOd" DATE,
    "zamjenaDo" DATE,
    "imaoZamjenu" BOOLEAN NOT NULL DEFAULT false,
    "zatvoren" DATE,
    "verzija" INTEGER NOT NULL DEFAULT 0,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ServisniNalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DogadajServisa" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "nalogId" UUID NOT NULL,
    "vrijeme" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT,
    "opis" TEXT NOT NULL,
    "javno" BOOLEAN NOT NULL DEFAULT true,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',

    CONSTRAINT "DogadajServisa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServisniNalog_firmaId_status_idx" ON "ServisniNalog"("firmaId", "status");

-- CreateIndex
CREATE INDEX "ServisniNalog_firmaId_uredajId_idx" ON "ServisniNalog"("firmaId", "uredajId");

-- CreateIndex
CREATE INDEX "ServisniNalog_firmaId_partnerId_idx" ON "ServisniNalog"("firmaId", "partnerId");

-- CreateIndex
CREATE INDEX "ServisniNalog_firmaId_datum_idx" ON "ServisniNalog"("firmaId", "datum" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ServisniNalog_firmaId_id_key" ON "ServisniNalog"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ServisniNalog_firmaId_godina_redni_key" ON "ServisniNalog"("firmaId", "godina", "redni");

-- CreateIndex
CREATE INDEX "DogadajServisa_firmaId_nalogId_vrijeme_idx" ON "DogadajServisa"("firmaId", "nalogId", "vrijeme");

-- AddForeignKey
ALTER TABLE "ServisniNalog" ADD CONSTRAINT "ServisniNalog_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServisniNalog" ADD CONSTRAINT "ServisniNalog_firmaId_uredajId_fkey" FOREIGN KEY ("firmaId", "uredajId") REFERENCES "Uredaj"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServisniNalog" ADD CONSTRAINT "ServisniNalog_firmaId_zamjenskiUredajId_fkey" FOREIGN KEY ("firmaId", "zamjenskiUredajId") REFERENCES "Uredaj"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServisniNalog" ADD CONSTRAINT "ServisniNalog_firmaId_partnerId_fkey" FOREIGN KEY ("firmaId", "partnerId") REFERENCES "Partner"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServisniNalog" ADD CONSTRAINT "ServisniNalog_firmaId_ugovorNajmaId_fkey" FOREIGN KEY ("firmaId", "ugovorNajmaId") REFERENCES "UgovorNajma"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DogadajServisa" ADD CONSTRAINT "DogadajServisa_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DogadajServisa" ADD CONSTRAINT "DogadajServisa_firmaId_nalogId_fkey" FOREIGN KEY ("firmaId", "nalogId") REFERENCES "ServisniNalog"("firmaId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
