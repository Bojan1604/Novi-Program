-- CreateTable
CREATE TABLE "Partner" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "kupac" BOOLEAN NOT NULL DEFAULT true,
    "dobavljac" BOOLEAN NOT NULL DEFAULT false,
    "drzava" CHAR(2) NOT NULL DEFAULT 'HR',
    "oib" CHAR(11),
    "pdvBroj" TEXT,
    "adresa" TEXT,
    "postanskiBroj" TEXT,
    "mjesto" TEXT,
    "email" TEXT,
    "telefon" TEXT,
    "eRacunAdresa" TEXT,
    "eRacunAktivan" BOOLEAN,
    "eRacunProvjereno" TIMESTAMPTZ(3),
    "pdvStatus" TEXT,
    "viesValjan" BOOLEAN,
    "viesProvjereno" TIMESTAMPTZ(3),
    "rokPlacanjaDana" INTEGER NOT NULL DEFAULT 15,
    "cjenikId" UUID,
    "napomena" TEXT,
    "aktivan" BOOLEAN NOT NULL DEFAULT true,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poslovnica" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "adresa" TEXT,
    "postanskiBroj" TEXT,
    "mjesto" TEXT,
    "kontakt" TEXT,
    "telefon" TEXT,
    "aktivan" BOOLEAN NOT NULL DEFAULT true,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Poslovnica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cjenik" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "opis" TEXT,
    "popust" DECIMAL(7,2),
    "aktivan" BOOLEAN NOT NULL DEFAULT true,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Cjenik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StavkaCjenika" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "cjenikId" UUID NOT NULL,
    "modelId" UUID,
    "uslugaId" UUID,
    "cijena" DECIMAL(14,2) NOT NULL,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StavkaCjenika_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Partner_firmaId_naziv_idx" ON "Partner"("firmaId", "naziv");

-- CreateIndex
CREATE INDEX "Partner_firmaId_oib_idx" ON "Partner"("firmaId", "oib");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_firmaId_id_key" ON "Partner"("firmaId", "id");

-- CreateIndex
CREATE INDEX "Poslovnica_partnerId_idx" ON "Poslovnica"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "Poslovnica_firmaId_id_key" ON "Poslovnica"("firmaId", "id");

-- CreateIndex
CREATE INDEX "Cjenik_firmaId_naziv_idx" ON "Cjenik"("firmaId", "naziv");

-- CreateIndex
CREATE UNIQUE INDEX "Cjenik_firmaId_id_key" ON "Cjenik"("firmaId", "id");

-- CreateIndex
CREATE INDEX "StavkaCjenika_modelId_idx" ON "StavkaCjenika"("modelId");

-- CreateIndex
CREATE INDEX "StavkaCjenika_uslugaId_idx" ON "StavkaCjenika"("uslugaId");

-- CreateIndex
CREATE UNIQUE INDEX "StavkaCjenika_cjenikId_modelId_key" ON "StavkaCjenika"("cjenikId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "StavkaCjenika_cjenikId_uslugaId_key" ON "StavkaCjenika"("cjenikId", "uslugaId");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_firmaId_cjenikId_fkey" FOREIGN KEY ("firmaId", "cjenikId") REFERENCES "Cjenik"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poslovnica" ADD CONSTRAINT "Poslovnica_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poslovnica" ADD CONSTRAINT "Poslovnica_firmaId_partnerId_fkey" FOREIGN KEY ("firmaId", "partnerId") REFERENCES "Partner"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cjenik" ADD CONSTRAINT "Cjenik_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaCjenika" ADD CONSTRAINT "StavkaCjenika_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaCjenika" ADD CONSTRAINT "StavkaCjenika_firmaId_cjenikId_fkey" FOREIGN KEY ("firmaId", "cjenikId") REFERENCES "Cjenik"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaCjenika" ADD CONSTRAINT "StavkaCjenika_firmaId_modelId_fkey" FOREIGN KEY ("firmaId", "modelId") REFERENCES "ModelUredaja"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaCjenika" ADD CONSTRAINT "StavkaCjenika_firmaId_uslugaId_fkey" FOREIGN KEY ("firmaId", "uslugaId") REFERENCES "Usluga"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

