-- CreateTable
CREATE TABLE "UgovorNajma" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "broj" TEXT NOT NULL,
    "redni" INTEGER,
    "godina" INTEGER,
    "partnerId" UUID NOT NULL,
    "poslovnicaId" UUID,
    "od" DATE NOT NULL,
    "do" DATE,
    "otkazan" DATE,
    "razlogOtkaza" TEXT,
    "rokPlacanjaDana" INTEGER NOT NULL DEFAULT 15,
    "nacinPlacanja" TEXT NOT NULL DEFAULT 'T',
    "uvjeti" TEXT,
    "napomenaRacuna" TEXT,
    "automatski" BOOLEAN NOT NULL DEFAULT false,
    "automatskiOd" DATE,
    "verzija" INTEGER NOT NULL DEFAULT 0,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UgovorNajma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UgovorNajma_firmaId_partnerId_idx" ON "UgovorNajma"("firmaId", "partnerId");

-- CreateIndex
CREATE INDEX "UgovorNajma_firmaId_od_idx" ON "UgovorNajma"("firmaId", "od" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UgovorNajma_firmaId_id_key" ON "UgovorNajma"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "UgovorNajma_firmaId_broj_key" ON "UgovorNajma"("firmaId", "broj");

-- AddForeignKey
ALTER TABLE "UgovorNajma" ADD CONSTRAINT "UgovorNajma_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UgovorNajma" ADD CONSTRAINT "UgovorNajma_firmaId_partnerId_fkey" FOREIGN KEY ("firmaId", "partnerId") REFERENCES "Partner"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UgovorNajma" ADD CONSTRAINT "UgovorNajma_firmaId_poslovnicaId_fkey" FOREIGN KEY ("firmaId", "poslovnicaId") REFERENCES "Poslovnica"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

