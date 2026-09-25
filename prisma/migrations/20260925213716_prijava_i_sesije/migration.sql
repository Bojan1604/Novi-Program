-- CreateTable
CREATE TABLE "Firma" (
    "id" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "oib" CHAR(11) NOT NULL,
    "aktivna" BOOLEAN NOT NULL DEFAULT true,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Firma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Korisnik" (
    "id" UUID NOT NULL,
    "ime" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "lozinkaHash" TEXT NOT NULL,
    "aktivan" BOOLEAN NOT NULL DEFAULT true,
    "zadnjaPrijava" TIMESTAMPTZ(3),
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Korisnik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClanstvoFirme" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "korisnikId" UUID NOT NULL,
    "aktivno" BOOLEAN NOT NULL DEFAULT true,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClanstvoFirme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sesija" (
    "id" CHAR(64) NOT NULL,
    "korisnikId" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "istjece" TIMESTAMPTZ(3) NOT NULL,
    "zadnjaAktivnost" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "preglednik" TEXT,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sesija_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PokusajPrijave" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "uspjeh" BOOLEAN NOT NULL,
    "vrijeme" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PokusajPrijave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Firma_oib_key" ON "Firma"("oib");

-- CreateIndex
CREATE UNIQUE INDEX "Korisnik_email_key" ON "Korisnik"("email");

-- CreateIndex
CREATE INDEX "ClanstvoFirme_korisnikId_idx" ON "ClanstvoFirme"("korisnikId");

-- CreateIndex
CREATE UNIQUE INDEX "ClanstvoFirme_firmaId_korisnikId_key" ON "ClanstvoFirme"("firmaId", "korisnikId");

-- CreateIndex
CREATE INDEX "Sesija_korisnikId_idx" ON "Sesija"("korisnikId");

-- CreateIndex
CREATE INDEX "Sesija_istjece_idx" ON "Sesija"("istjece");

-- CreateIndex
CREATE INDEX "PokusajPrijave_email_vrijeme_idx" ON "PokusajPrijave"("email", "vrijeme");

-- CreateIndex
CREATE INDEX "PokusajPrijave_ip_vrijeme_idx" ON "PokusajPrijave"("ip", "vrijeme");

-- AddForeignKey
ALTER TABLE "ClanstvoFirme" ADD CONSTRAINT "ClanstvoFirme_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClanstvoFirme" ADD CONSTRAINT "ClanstvoFirme_korisnikId_fkey" FOREIGN KEY ("korisnikId") REFERENCES "Korisnik"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sesija" ADD CONSTRAINT "Sesija_korisnikId_fkey" FOREIGN KEY ("korisnikId") REFERENCES "Korisnik"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sesija" ADD CONSTRAINT "Sesija_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
