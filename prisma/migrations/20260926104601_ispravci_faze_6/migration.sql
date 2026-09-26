-- AlterTable
ALTER TABLE "PozivUFirmu" ADD COLUMN     "istice" TIMESTAMPTZ(3),
ADD COLUMN     "tokenHash" TEXT;

-- AlterTable
ALTER TABLE "ProdajniDokument" ADD COLUMN     "fiskalNacin" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PozivUFirmu_tokenHash_key" ON "PozivUFirmu"("tokenHash");

