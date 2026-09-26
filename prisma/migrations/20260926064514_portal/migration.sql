-- CreateTable
CREATE TABLE "KorisnikPortala" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "ime" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "lozinkaHash" TEXT,
    "aktivan" BOOLEAN NOT NULL DEFAULT true,
    "poveznicaHash" TEXT,
    "poveznicaIstice" TIMESTAMPTZ(3),
    "zadnjaPrijava" TIMESTAMPTZ(3),
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "KorisnikPortala_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesijaPortala" (
    "id" TEXT NOT NULL,
    "firmaId" UUID NOT NULL,
    "korisnikPortalaId" UUID NOT NULL,
    "istjece" TIMESTAMPTZ(3) NOT NULL,
    "zadnjaAktivnost" TIMESTAMPTZ(3) NOT NULL,
    "ip" TEXT,
    "preglednik" TEXT,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesijaPortala_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KorisnikPortala_poveznicaHash_key" ON "KorisnikPortala"("poveznicaHash");

-- CreateIndex
CREATE INDEX "KorisnikPortala_email_idx" ON "KorisnikPortala"("email");

-- CreateIndex
CREATE INDEX "KorisnikPortala_firmaId_partnerId_idx" ON "KorisnikPortala"("firmaId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "KorisnikPortala_firmaId_id_key" ON "KorisnikPortala"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "KorisnikPortala_firmaId_email_key" ON "KorisnikPortala"("firmaId", "email");

-- CreateIndex
CREATE INDEX "SesijaPortala_korisnikPortalaId_idx" ON "SesijaPortala"("korisnikPortalaId");

-- AddForeignKey
ALTER TABLE "KorisnikPortala" ADD CONSTRAINT "KorisnikPortala_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KorisnikPortala" ADD CONSTRAINT "KorisnikPortala_firmaId_partnerId_fkey" FOREIGN KEY ("firmaId", "partnerId") REFERENCES "Partner"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesijaPortala" ADD CONSTRAINT "SesijaPortala_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesijaPortala" ADD CONSTRAINT "SesijaPortala_firmaId_korisnikPortalaId_fkey" FOREIGN KEY ("firmaId", "korisnikPortalaId") REFERENCES "KorisnikPortala"("firmaId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
