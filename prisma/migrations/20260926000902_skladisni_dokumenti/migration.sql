-- CreateTable
CREATE TABLE "SkladisniDokument" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "vrsta" TEXT NOT NULL,
    "broj" TEXT NOT NULL,
    "godina" INTEGER NOT NULL,
    "redni" INTEGER NOT NULL,
    "datum" DATE NOT NULL,
    "skladisteIzId" UUID,
    "skladisteUId" UUID,
    "partnerId" UUID,
    "razlog" TEXT,
    "napomena" TEXT,
    "brojUredaja" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IZDAN',
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SkladisniDokument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StavkaSkladisnogDokumenta" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "dokumentId" UUID NOT NULL,
    "uredajId" UUID NOT NULL,
    "staroStanje" TEXT NOT NULL,

    CONSTRAINT "StavkaSkladisnogDokumenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Odobrenje" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "vrsta" TEXT NOT NULL,
    "entitet" TEXT NOT NULL,
    "entitetId" UUID NOT NULL,
    "opis" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CEKA',
    "podnioId" UUID,
    "podnio" TEXT NOT NULL,
    "odlucioId" UUID,
    "odlucio" TEXT,
    "razlog" TEXT,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "odluceno" TIMESTAMPTZ(3),

    CONSTRAINT "Odobrenje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventura" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "broj" TEXT NOT NULL,
    "godina" INTEGER NOT NULL,
    "redni" INTEGER NOT NULL,
    "datum" DATE NOT NULL,
    "skladisteId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OTVORENA',
    "napomena" TEXT,
    "ocekivano" INTEGER,
    "pronadjeno" INTEGER,
    "manjak" INTEGER,
    "visak" INTEGER,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "zakljuceno" TIMESTAMPTZ(3),

    CONSTRAINT "Inventura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StavkaInventure" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "inventuraId" UUID NOT NULL,
    "serijski" TEXT NOT NULL,
    "uredajId" UUID,
    "rezultat" TEXT,
    "stanje" TEXT,
    "skladiste" TEXT,
    "skenirano" INTEGER NOT NULL DEFAULT 1,
    "vrijeme" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StavkaInventure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SkladisniDokument_firmaId_datum_idx" ON "SkladisniDokument"("firmaId", "datum" DESC);

-- CreateIndex
CREATE INDEX "SkladisniDokument_firmaId_status_idx" ON "SkladisniDokument"("firmaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SkladisniDokument_firmaId_id_key" ON "SkladisniDokument"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SkladisniDokument_firmaId_vrsta_godina_redni_key" ON "SkladisniDokument"("firmaId", "vrsta", "godina", "redni");

-- CreateIndex
CREATE INDEX "StavkaSkladisnogDokumenta_firmaId_uredajId_idx" ON "StavkaSkladisnogDokumenta"("firmaId", "uredajId");

-- CreateIndex
CREATE UNIQUE INDEX "StavkaSkladisnogDokumenta_dokumentId_uredajId_key" ON "StavkaSkladisnogDokumenta"("dokumentId", "uredajId");

-- CreateIndex
CREATE INDEX "Odobrenje_firmaId_status_stvoreno_idx" ON "Odobrenje"("firmaId", "status", "stvoreno" DESC);

-- CreateIndex
CREATE INDEX "Odobrenje_firmaId_entitet_entitetId_idx" ON "Odobrenje"("firmaId", "entitet", "entitetId");

-- CreateIndex
CREATE UNIQUE INDEX "Odobrenje_firmaId_id_key" ON "Odobrenje"("firmaId", "id");

-- CreateIndex
CREATE INDEX "Inventura_firmaId_datum_idx" ON "Inventura"("firmaId", "datum" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Inventura_firmaId_id_key" ON "Inventura"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Inventura_firmaId_godina_redni_key" ON "Inventura"("firmaId", "godina", "redni");

-- CreateIndex
CREATE INDEX "StavkaInventure_firmaId_uredajId_idx" ON "StavkaInventure"("firmaId", "uredajId");

-- CreateIndex
CREATE UNIQUE INDEX "StavkaInventure_inventuraId_serijski_key" ON "StavkaInventure"("inventuraId", "serijski");

-- AddForeignKey
ALTER TABLE "SkladisniDokument" ADD CONSTRAINT "SkladisniDokument_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkladisniDokument" ADD CONSTRAINT "SkladisniDokument_firmaId_skladisteIzId_fkey" FOREIGN KEY ("firmaId", "skladisteIzId") REFERENCES "Skladiste"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkladisniDokument" ADD CONSTRAINT "SkladisniDokument_firmaId_skladisteUId_fkey" FOREIGN KEY ("firmaId", "skladisteUId") REFERENCES "Skladiste"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkladisniDokument" ADD CONSTRAINT "SkladisniDokument_firmaId_partnerId_fkey" FOREIGN KEY ("firmaId", "partnerId") REFERENCES "Partner"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaSkladisnogDokumenta" ADD CONSTRAINT "StavkaSkladisnogDokumenta_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaSkladisnogDokumenta" ADD CONSTRAINT "StavkaSkladisnogDokumenta_firmaId_dokumentId_fkey" FOREIGN KEY ("firmaId", "dokumentId") REFERENCES "SkladisniDokument"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaSkladisnogDokumenta" ADD CONSTRAINT "StavkaSkladisnogDokumenta_firmaId_uredajId_fkey" FOREIGN KEY ("firmaId", "uredajId") REFERENCES "Uredaj"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Odobrenje" ADD CONSTRAINT "Odobrenje_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventura" ADD CONSTRAINT "Inventura_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventura" ADD CONSTRAINT "Inventura_firmaId_skladisteId_fkey" FOREIGN KEY ("firmaId", "skladisteId") REFERENCES "Skladiste"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaInventure" ADD CONSTRAINT "StavkaInventure_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaInventure" ADD CONSTRAINT "StavkaInventure_firmaId_inventuraId_fkey" FOREIGN KEY ("firmaId", "inventuraId") REFERENCES "Inventura"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StavkaInventure" ADD CONSTRAINT "StavkaInventure_firmaId_uredajId_fkey" FOREIGN KEY ("firmaId", "uredajId") REFERENCES "Uredaj"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

