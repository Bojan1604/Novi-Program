-- CreateTable
CREATE TABLE "UredajNaUgovoru" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "ugovorId" UUID NOT NULL,
    "uredajId" UUID NOT NULL,
    "od" DATE NOT NULL,
    "do" DATE,
    "izvor" TEXT NOT NULL DEFAULT 'SKLADISTE',
    "napomena" TEXT,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UredajNaUgovoru_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CijenaNajma" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "od" DATE NOT NULL,
    "iznos" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "CijenaNajma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MjesecNajma" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "mjesec" DATE NOT NULL,
    "pauza" BOOLEAN NOT NULL DEFAULT false,
    "iznos" DECIMAL(14,2),

    CONSTRAINT "MjesecNajma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RataNajma" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "mjesec" DATE NOT NULL,
    "iznos" DECIMAL(14,2) NOT NULL,
    "dokumentId" UUID,
    "stavkaId" UUID,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RataNajma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UredajNaUgovoru_firmaId_ugovorId_idx" ON "UredajNaUgovoru"("firmaId", "ugovorId");

-- CreateIndex
CREATE INDEX "UredajNaUgovoru_firmaId_uredajId_idx" ON "UredajNaUgovoru"("firmaId", "uredajId");

-- CreateIndex
CREATE UNIQUE INDEX "UredajNaUgovoru_firmaId_id_key" ON "UredajNaUgovoru"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CijenaNajma_firmaId_planId_od_key" ON "CijenaNajma"("firmaId", "planId", "od");

-- CreateIndex
CREATE UNIQUE INDEX "MjesecNajma_firmaId_planId_mjesec_key" ON "MjesecNajma"("firmaId", "planId", "mjesec");

-- CreateIndex
CREATE INDEX "RataNajma_firmaId_dokumentId_idx" ON "RataNajma"("firmaId", "dokumentId");

-- CreateIndex
CREATE UNIQUE INDEX "RataNajma_firmaId_planId_mjesec_key" ON "RataNajma"("firmaId", "planId", "mjesec");

-- AddForeignKey
ALTER TABLE "UredajNaUgovoru" ADD CONSTRAINT "UredajNaUgovoru_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UredajNaUgovoru" ADD CONSTRAINT "UredajNaUgovoru_firmaId_ugovorId_fkey" FOREIGN KEY ("firmaId", "ugovorId") REFERENCES "UgovorNajma"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UredajNaUgovoru" ADD CONSTRAINT "UredajNaUgovoru_firmaId_uredajId_fkey" FOREIGN KEY ("firmaId", "uredajId") REFERENCES "Uredaj"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CijenaNajma" ADD CONSTRAINT "CijenaNajma_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CijenaNajma" ADD CONSTRAINT "CijenaNajma_firmaId_planId_fkey" FOREIGN KEY ("firmaId", "planId") REFERENCES "UredajNaUgovoru"("firmaId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MjesecNajma" ADD CONSTRAINT "MjesecNajma_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MjesecNajma" ADD CONSTRAINT "MjesecNajma_firmaId_planId_fkey" FOREIGN KEY ("firmaId", "planId") REFERENCES "UredajNaUgovoru"("firmaId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RataNajma" ADD CONSTRAINT "RataNajma_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RataNajma" ADD CONSTRAINT "RataNajma_firmaId_planId_fkey" FOREIGN KEY ("firmaId", "planId") REFERENCES "UredajNaUgovoru"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

