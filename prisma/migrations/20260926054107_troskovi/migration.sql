-- CreateTable
CREATE TABLE "KategorijaTroska" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "aktivna" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "KategorijaTroska_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trosak" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "datum" DATE NOT NULL,
    "kategorijaId" UUID NOT NULL,
    "opis" TEXT NOT NULL,
    "iznos" DECIMAL(14,2) NOT NULL,
    "pdv" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "placeno" BOOLEAN NOT NULL DEFAULT false,
    "datumPlacanja" DATE,
    "ponavljajuciId" UUID,
    "mjesec" DATE,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trosak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PonavljajuciTrosak" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "kategorijaId" UUID NOT NULL,
    "opis" TEXT NOT NULL,
    "iznos" DECIMAL(14,2) NOT NULL,
    "pdv" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dan" INTEGER NOT NULL,
    "od" DATE NOT NULL,
    "do" DATE,
    "zadnji" DATE,
    "aktivan" BOOLEAN NOT NULL DEFAULT true,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PonavljajuciTrosak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KategorijaTroska_firmaId_id_key" ON "KategorijaTroska"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "KategorijaTroska_firmaId_naziv_key" ON "KategorijaTroska"("firmaId", "naziv");

-- CreateIndex
CREATE INDEX "Trosak_firmaId_datum_idx" ON "Trosak"("firmaId", "datum" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Trosak_firmaId_id_key" ON "Trosak"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Trosak_firmaId_ponavljajuciId_mjesec_key" ON "Trosak"("firmaId", "ponavljajuciId", "mjesec");

-- CreateIndex
CREATE UNIQUE INDEX "PonavljajuciTrosak_firmaId_id_key" ON "PonavljajuciTrosak"("firmaId", "id");

-- AddForeignKey
ALTER TABLE "KategorijaTroska" ADD CONSTRAINT "KategorijaTroska_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trosak" ADD CONSTRAINT "Trosak_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trosak" ADD CONSTRAINT "Trosak_firmaId_kategorijaId_fkey" FOREIGN KEY ("firmaId", "kategorijaId") REFERENCES "KategorijaTroska"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trosak" ADD CONSTRAINT "Trosak_firmaId_ponavljajuciId_fkey" FOREIGN KEY ("firmaId", "ponavljajuciId") REFERENCES "PonavljajuciTrosak"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PonavljajuciTrosak" ADD CONSTRAINT "PonavljajuciTrosak_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PonavljajuciTrosak" ADD CONSTRAINT "PonavljajuciTrosak_firmaId_kategorijaId_fkey" FOREIGN KEY ("firmaId", "kategorijaId") REFERENCES "KategorijaTroska"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

