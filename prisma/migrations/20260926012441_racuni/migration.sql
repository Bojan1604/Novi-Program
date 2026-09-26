-- AlterTable
ALTER TABLE "ProdajniDokument" ADD COLUMN     "nacinPlacanja" TEXT NOT NULL DEFAULT 'T';

-- CreateTable
CREATE TABLE "UredajNaStavci" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "stavkaId" UUID NOT NULL,
    "uredajId" UUID NOT NULL,

    CONSTRAINT "UredajNaStavci_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UredajNaStavci_firmaId_uredajId_idx" ON "UredajNaStavci"("firmaId", "uredajId");

-- CreateIndex
CREATE UNIQUE INDEX "UredajNaStavci_stavkaId_uredajId_key" ON "UredajNaStavci"("stavkaId", "uredajId");

-- CreateIndex
CREATE UNIQUE INDEX "StavkaProdajnogDokumenta_firmaId_id_key" ON "StavkaProdajnogDokumenta"("firmaId", "id");

-- AddForeignKey
ALTER TABLE "UredajNaStavci" ADD CONSTRAINT "UredajNaStavci_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UredajNaStavci" ADD CONSTRAINT "UredajNaStavci_firmaId_stavkaId_fkey" FOREIGN KEY ("firmaId", "stavkaId") REFERENCES "StavkaProdajnogDokumenta"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UredajNaStavci" ADD CONSTRAINT "UredajNaStavci_firmaId_uredajId_fkey" FOREIGN KEY ("firmaId", "uredajId") REFERENCES "Uredaj"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

