-- AlterTable
ALTER TABLE "Korisnik" ADD COLUMN     "zadnjaFirmaId" UUID;

-- CreateTable
CREATE TABLE "PozivUFirmu" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "ulogaId" UUID NOT NULL,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PozivUFirmu_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PozivUFirmu_email_idx" ON "PozivUFirmu"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PozivUFirmu_firmaId_id_key" ON "PozivUFirmu"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PozivUFirmu_firmaId_email_key" ON "PozivUFirmu"("firmaId", "email");

-- AddForeignKey
ALTER TABLE "PozivUFirmu" ADD CONSTRAINT "PozivUFirmu_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PozivUFirmu" ADD CONSTRAINT "PozivUFirmu_firmaId_ulogaId_fkey" FOREIGN KEY ("firmaId", "ulogaId") REFERENCES "Uloga"("firmaId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

