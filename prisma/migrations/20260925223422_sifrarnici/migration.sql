-- CreateTable
CREATE TABLE "Kategorija" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "aktivan" BOOLEAN NOT NULL DEFAULT true,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Kategorija_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proizvodjac" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "aktivan" BOOLEAN NOT NULL DEFAULT true,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Proizvodjac_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelUredaja" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "proizvodjacId" UUID NOT NULL,
    "kategorijaId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "sifra" TEXT,
    "kpdProdaja" TEXT,
    "kpdNajam" TEXT,
    "jamstvoMjeseci" INTEGER NOT NULL DEFAULT 24,
    "preporucenaCijena" DECIMAL(14,2),
    "marza" DECIMAL(7,2),
    "opis" TEXT NOT NULL DEFAULT '',
    "aktivan" BOOLEAN NOT NULL DEFAULT true,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ModelUredaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skladiste" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "adresa" TEXT NOT NULL DEFAULT '',
    "zadano" BOOLEAN NOT NULL DEFAULT false,
    "aktivan" BOOLEAN NOT NULL DEFAULT true,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Skladiste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StanjeRobe" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "aktivan" BOOLEAN NOT NULL DEFAULT true,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StanjeRobe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usluga" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "sifra" TEXT,
    "jedinica" TEXT NOT NULL DEFAULT 'kom',
    "cijena" DECIMAL(14,2),
    "kpd" TEXT,
    "aktivan" BOOLEAN NOT NULL DEFAULT true,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Usluga_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Kategorija_firmaId_naziv_idx" ON "Kategorija"("firmaId", "naziv");

-- CreateIndex
CREATE INDEX "Proizvodjac_firmaId_naziv_idx" ON "Proizvodjac"("firmaId", "naziv");

-- CreateIndex
CREATE INDEX "ModelUredaja_firmaId_naziv_idx" ON "ModelUredaja"("firmaId", "naziv");

-- CreateIndex
CREATE INDEX "ModelUredaja_proizvodjacId_idx" ON "ModelUredaja"("proizvodjacId");

-- CreateIndex
CREATE INDEX "ModelUredaja_kategorijaId_idx" ON "ModelUredaja"("kategorijaId");

-- CreateIndex
CREATE INDEX "Skladiste_firmaId_naziv_idx" ON "Skladiste"("firmaId", "naziv");

-- CreateIndex
CREATE INDEX "StanjeRobe_firmaId_naziv_idx" ON "StanjeRobe"("firmaId", "naziv");

-- CreateIndex
CREATE INDEX "Usluga_firmaId_naziv_idx" ON "Usluga"("firmaId", "naziv");

-- AddForeignKey
ALTER TABLE "Kategorija" ADD CONSTRAINT "Kategorija_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proizvodjac" ADD CONSTRAINT "Proizvodjac_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelUredaja" ADD CONSTRAINT "ModelUredaja_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelUredaja" ADD CONSTRAINT "ModelUredaja_proizvodjacId_fkey" FOREIGN KEY ("proizvodjacId") REFERENCES "Proizvodjac"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelUredaja" ADD CONSTRAINT "ModelUredaja_kategorijaId_fkey" FOREIGN KEY ("kategorijaId") REFERENCES "Kategorija"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skladiste" ADD CONSTRAINT "Skladiste_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StanjeRobe" ADD CONSTRAINT "StanjeRobe_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usluga" ADD CONSTRAINT "Usluga_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
