-- DropIndex
DROP INDEX "ProdajniDokument_firmaId_vrsta_godina_redni_key";

-- CreateIndex
CREATE UNIQUE INDEX "ProdajniDokument_firmaId_vrsta_godina_broj_key" ON "ProdajniDokument"("firmaId", "vrsta", "godina", "broj");

