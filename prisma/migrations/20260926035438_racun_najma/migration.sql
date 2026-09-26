-- AlterTable
ALTER TABLE "ProdajniDokument" ADD COLUMN     "ugovorNajmaId" UUID;

-- CreateIndex
CREATE INDEX "ProdajniDokument_firmaId_ugovorNajmaId_idx" ON "ProdajniDokument"("firmaId", "ugovorNajmaId");

