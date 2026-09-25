-- Složeni strani ključevi (firmaId, id): zapis može pokazivati samo na zapis iste firme — baza to jamči.

-- DropForeignKey
ALTER TABLE "ClanstvoFirme" DROP CONSTRAINT "ClanstvoFirme_ulogaId_fkey";

-- DropForeignKey
ALTER TABLE "ModelUredaja" DROP CONSTRAINT "ModelUredaja_kategorijaId_fkey";

-- DropForeignKey
ALTER TABLE "ModelUredaja" DROP CONSTRAINT "ModelUredaja_proizvodjacId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "Kategorija_firmaId_id_key" ON "Kategorija"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ModelUredaja_firmaId_id_key" ON "ModelUredaja"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Proizvodjac_firmaId_id_key" ON "Proizvodjac"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Skladiste_firmaId_id_key" ON "Skladiste"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StanjeRobe_firmaId_id_key" ON "StanjeRobe"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Uloga_firmaId_id_key" ON "Uloga"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Usluga_firmaId_id_key" ON "Usluga"("firmaId", "id");

-- AddForeignKey
ALTER TABLE "ClanstvoFirme" ADD CONSTRAINT "ClanstvoFirme_firmaId_ulogaId_fkey" FOREIGN KEY ("firmaId", "ulogaId") REFERENCES "Uloga"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelUredaja" ADD CONSTRAINT "ModelUredaja_firmaId_proizvodjacId_fkey" FOREIGN KEY ("firmaId", "proizvodjacId") REFERENCES "Proizvodjac"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelUredaja" ADD CONSTRAINT "ModelUredaja_firmaId_kategorijaId_fkey" FOREIGN KEY ("firmaId", "kategorijaId") REFERENCES "Kategorija"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

