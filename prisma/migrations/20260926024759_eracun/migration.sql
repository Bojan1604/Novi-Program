-- CreateTable
CREATE TABLE "ERacun" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "dokumentId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "posrednik" TEXT NOT NULL,
    "posrednikId" TEXT,
    "poruka" TEXT,
    "xml" TEXT NOT NULL,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "poslano" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provjereno" TIMESTAMPTZ(3),

    CONSTRAINT "ERacun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EIzvjestaj" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "dokumentId" UUID NOT NULL,
    "vrsta" TEXT NOT NULL,
    "iznos" DECIMAL(14,2) NOT NULL,
    "datum" DATE NOT NULL,
    "razlog" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CEKA',
    "posrednikId" TEXT,
    "poruka" TEXT,
    "uplataId" UUID,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poslano" TIMESTAMPTZ(3),

    CONSTRAINT "EIzvjestaj_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ERacun_firmaId_dokumentId_poslano_idx" ON "ERacun"("firmaId", "dokumentId", "poslano" DESC);

-- CreateIndex
CREATE INDEX "ERacun_firmaId_status_idx" ON "ERacun"("firmaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ERacun_firmaId_id_key" ON "ERacun"("firmaId", "id");

-- CreateIndex
CREATE INDEX "EIzvjestaj_firmaId_status_idx" ON "EIzvjestaj"("firmaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EIzvjestaj_firmaId_id_key" ON "EIzvjestaj"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EIzvjestaj_firmaId_uplataId_key" ON "EIzvjestaj"("firmaId", "uplataId");

-- AddForeignKey
ALTER TABLE "ERacun" ADD CONSTRAINT "ERacun_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ERacun" ADD CONSTRAINT "ERacun_firmaId_dokumentId_fkey" FOREIGN KEY ("firmaId", "dokumentId") REFERENCES "ProdajniDokument"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EIzvjestaj" ADD CONSTRAINT "EIzvjestaj_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EIzvjestaj" ADD CONSTRAINT "EIzvjestaj_firmaId_dokumentId_fkey" FOREIGN KEY ("firmaId", "dokumentId") REFERENCES "ProdajniDokument"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

