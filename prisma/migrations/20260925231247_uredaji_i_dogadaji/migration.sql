-- CreateEnum
CREATE TYPE "StanjeUredaja" AS ENUM ('U_DOLASKU', 'NA_SKLADISTU', 'REZERVIRAN', 'PRODAN', 'U_NAJMU', 'NA_SERVISU', 'OTPISAN');

-- CreateTable
CREATE TABLE "Uredaj" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "serijski" TEXT NOT NULL,
    "modelId" UUID NOT NULL,
    "stanje" "StanjeUredaja" NOT NULL,
    "stanjePrijeServisa" "StanjeUredaja",
    "skladisteId" UUID,
    "stanjeRobeId" UUID,
    "partnerId" UUID,
    "poslovnicaId" UUID,
    "nabavnaCijena" DECIMAL(14,2),
    "nabavniDatum" DATE,
    "jamstvoDo" DATE,
    "cpu" TEXT,
    "ram" TEXT,
    "disk" TEXT,
    "ekran" TEXT,
    "os" TEXT,
    "napomena" TEXT,
    "verzija" INTEGER NOT NULL DEFAULT 0,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Uredaj_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DogadajUredaja" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "uredajId" UUID NOT NULL,
    "vrijeme" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "radnja" TEXT NOT NULL,
    "staroStanje" "StanjeUredaja",
    "novoStanje" "StanjeUredaja",
    "skladisteOdId" UUID,
    "skladisteDoId" UUID,
    "partnerId" UUID,
    "dokumentVrsta" TEXT,
    "dokumentId" UUID,
    "dokumentBroj" TEXT,
    "opis" TEXT,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',

    CONSTRAINT "DogadajUredaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Uredaj_firmaId_stanje_idx" ON "Uredaj"("firmaId", "stanje");

-- CreateIndex
CREATE INDEX "Uredaj_firmaId_modelId_idx" ON "Uredaj"("firmaId", "modelId");

-- CreateIndex
CREATE INDEX "Uredaj_firmaId_skladisteId_idx" ON "Uredaj"("firmaId", "skladisteId");

-- CreateIndex
CREATE INDEX "Uredaj_firmaId_partnerId_idx" ON "Uredaj"("firmaId", "partnerId");

-- CreateIndex
CREATE INDEX "Uredaj_firmaId_stvoreno_idx" ON "Uredaj"("firmaId", "stvoreno" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Uredaj_firmaId_serijski_key" ON "Uredaj"("firmaId", "serijski");

-- CreateIndex
CREATE UNIQUE INDEX "Uredaj_firmaId_id_key" ON "Uredaj"("firmaId", "id");

-- CreateIndex
CREATE INDEX "DogadajUredaja_uredajId_vrijeme_idx" ON "DogadajUredaja"("uredajId", "vrijeme" DESC);

-- CreateIndex
CREATE INDEX "DogadajUredaja_firmaId_dokumentVrsta_dokumentId_idx" ON "DogadajUredaja"("firmaId", "dokumentVrsta", "dokumentId");

-- AddForeignKey
ALTER TABLE "Uredaj" ADD CONSTRAINT "Uredaj_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Uredaj" ADD CONSTRAINT "Uredaj_firmaId_modelId_fkey" FOREIGN KEY ("firmaId", "modelId") REFERENCES "ModelUredaja"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Uredaj" ADD CONSTRAINT "Uredaj_firmaId_skladisteId_fkey" FOREIGN KEY ("firmaId", "skladisteId") REFERENCES "Skladiste"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Uredaj" ADD CONSTRAINT "Uredaj_firmaId_stanjeRobeId_fkey" FOREIGN KEY ("firmaId", "stanjeRobeId") REFERENCES "StanjeRobe"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Uredaj" ADD CONSTRAINT "Uredaj_firmaId_partnerId_fkey" FOREIGN KEY ("firmaId", "partnerId") REFERENCES "Partner"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Uredaj" ADD CONSTRAINT "Uredaj_firmaId_poslovnicaId_fkey" FOREIGN KEY ("firmaId", "poslovnicaId") REFERENCES "Poslovnica"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DogadajUredaja" ADD CONSTRAINT "DogadajUredaja_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DogadajUredaja" ADD CONSTRAINT "DogadajUredaja_firmaId_uredajId_fkey" FOREIGN KEY ("firmaId", "uredajId") REFERENCES "Uredaj"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

