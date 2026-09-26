-- AlterTable
ALTER TABLE "Firma" ADD COLUMN     "fiskalCertNaziv" TEXT,
ADD COLUMN     "fiskalCertVrijedi" TIMESTAMPTZ(3),
ADD COLUMN     "fiskalCertifikat" TEXT,
ADD COLUMN     "fiskalLozinka" TEXT,
ADD COLUMN     "fiskalNacin" TEXT NOT NULL DEFAULT 'DEMO';

-- AlterTable
ALTER TABLE "Korisnik" ADD COLUMN     "oib" CHAR(11);

-- AlterTable
ALTER TABLE "ProdajniDokument" ADD COLUMN     "fiskalGreska" TEXT,
ADD COLUMN     "fiskalPokusaja" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fiskalSljedeci" TIMESTAMPTZ(3),
ADD COLUMN     "fiskalStatus" TEXT,
ADD COLUMN     "jir" TEXT,
ADD COLUMN     "oibOperatera" CHAR(11),
ADD COLUMN     "zki" CHAR(32);

-- CreateIndex
CREATE INDEX "ProdajniDokument_fiskalStatus_fiskalSljedeci_idx" ON "ProdajniDokument"("fiskalStatus", "fiskalSljedeci");

