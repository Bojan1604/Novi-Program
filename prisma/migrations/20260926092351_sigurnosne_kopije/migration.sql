-- CreateTable
CREATE TABLE "SigurnosnaKopija" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "vrijeme" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vrsta" TEXT NOT NULL,
    "velicina" INTEGER NOT NULL,
    "redaka" JSONB NOT NULL,
    "sadrzaj" BYTEA NOT NULL,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',

    CONSTRAINT "SigurnosnaKopija_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SigurnosnaKopija_firmaId_vrijeme_idx" ON "SigurnosnaKopija"("firmaId", "vrijeme" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SigurnosnaKopija_firmaId_id_key" ON "SigurnosnaKopija"("firmaId", "id");

-- AddForeignKey
ALTER TABLE "SigurnosnaKopija" ADD CONSTRAINT "SigurnosnaKopija_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
