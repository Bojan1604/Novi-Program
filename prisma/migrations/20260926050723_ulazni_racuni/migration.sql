-- CreateTable
CREATE TABLE "UlazniRacun" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "interni" TEXT NOT NULL,
    "godina" INTEGER NOT NULL,
    "redni" INTEGER NOT NULL,
    "broj" TEXT NOT NULL,
    "datum" DATE NOT NULL,
    "dospijece" DATE,
    "dobavljacId" UUID,
    "dobavljacTekst" TEXT,
    "dobavljacOib" CHAR(11),
    "narudzbenicaId" UUID,
    "primkaId" UUID,
    "zaRobu" BOOLEAN NOT NULL DEFAULT false,
    "osnovica" DECIMAL(14,2) NOT NULL,
    "pdv" DECIMAL(14,2) NOT NULL,
    "ukupno" DECIMAL(14,2) NOT NULL,
    "placeno" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "opis" TEXT,
    "izvor" TEXT NOT NULL DEFAULT 'RUCNI',
    "status" TEXT NOT NULL DEFAULT 'EVIDENTIRAN',
    "razlogOdbijanja" TEXT,
    "eRacunId" TEXT,
    "xml" TEXT,
    "verzija" INTEGER NOT NULL DEFAULT 0,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UlazniRacun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UlazniRacun_firmaId_datum_idx" ON "UlazniRacun"("firmaId", "datum" DESC);

-- CreateIndex
CREATE INDEX "UlazniRacun_firmaId_narudzbenicaId_idx" ON "UlazniRacun"("firmaId", "narudzbenicaId");

-- CreateIndex
CREATE INDEX "UlazniRacun_firmaId_eRacunId_idx" ON "UlazniRacun"("firmaId", "eRacunId");

-- CreateIndex
CREATE UNIQUE INDEX "UlazniRacun_firmaId_id_key" ON "UlazniRacun"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "UlazniRacun_firmaId_godina_redni_key" ON "UlazniRacun"("firmaId", "godina", "redni");

-- AddForeignKey
ALTER TABLE "UlazniRacun" ADD CONSTRAINT "UlazniRacun_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UlazniRacun" ADD CONSTRAINT "UlazniRacun_firmaId_dobavljacId_fkey" FOREIGN KEY ("firmaId", "dobavljacId") REFERENCES "Partner"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UlazniRacun" ADD CONSTRAINT "UlazniRacun_firmaId_narudzbenicaId_fkey" FOREIGN KEY ("firmaId", "narudzbenicaId") REFERENCES "Narudzbenica"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UlazniRacun" ADD CONSTRAINT "UlazniRacun_firmaId_primkaId_fkey" FOREIGN KEY ("firmaId", "primkaId") REFERENCES "Primka"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

