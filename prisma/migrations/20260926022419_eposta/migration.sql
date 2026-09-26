-- AlterTable
ALTER TABLE "Firma" ADD COLUMN     "epostaKopija" TEXT,
ADD COLUMN     "epostaPosiljatelj" TEXT,
ADD COLUMN     "smtpHost" TEXT,
ADD COLUMN     "smtpKorisnik" TEXT,
ADD COLUMN     "smtpLozinka" TEXT,
ADD COLUMN     "smtpPort" INTEGER,
ADD COLUMN     "smtpSigurno" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "SlanjeEposte" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "dokumentId" UUID NOT NULL,
    "vrsta" TEXT NOT NULL,
    "prima" TEXT NOT NULL,
    "predmet" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "greska" TEXT,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "vrijeme" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlanjeEposte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlanjeEposte_firmaId_dokumentId_vrijeme_idx" ON "SlanjeEposte"("firmaId", "dokumentId", "vrijeme" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SlanjeEposte_firmaId_id_key" ON "SlanjeEposte"("firmaId", "id");

-- AddForeignKey
ALTER TABLE "SlanjeEposte" ADD CONSTRAINT "SlanjeEposte_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlanjeEposte" ADD CONSTRAINT "SlanjeEposte_firmaId_dokumentId_fkey" FOREIGN KEY ("firmaId", "dokumentId") REFERENCES "ProdajniDokument"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

