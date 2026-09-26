-- AlterTable
ALTER TABLE "Korisnik" ADD COLUMN     "totpTajna" TEXT,
ADD COLUMN     "totpUkljucen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpZadnjiKorak" INTEGER;

-- CreateTable
CREATE TABLE "RezervniKod" (
    "id" UUID NOT NULL,
    "korisnikId" UUID NOT NULL,
    "hash" TEXT NOT NULL,
    "iskoristen" TIMESTAMPTZ(3),

    CONSTRAINT "RezervniKod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrijavaDrugiKorak" (
    "id" TEXT NOT NULL,
    "korisnikId" UUID NOT NULL,
    "istjece" TIMESTAMPTZ(3) NOT NULL,
    "pokusaja" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "preglednik" TEXT,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrijavaDrugiKorak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RezervniKod_korisnikId_idx" ON "RezervniKod"("korisnikId");

-- CreateIndex
CREATE INDEX "PrijavaDrugiKorak_korisnikId_idx" ON "PrijavaDrugiKorak"("korisnikId");

-- AddForeignKey
ALTER TABLE "RezervniKod" ADD CONSTRAINT "RezervniKod_korisnikId_fkey" FOREIGN KEY ("korisnikId") REFERENCES "Korisnik"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrijavaDrugiKorak" ADD CONSTRAINT "PrijavaDrugiKorak_korisnikId_fkey" FOREIGN KEY ("korisnikId") REFERENCES "Korisnik"("id") ON DELETE CASCADE ON UPDATE CASCADE;
