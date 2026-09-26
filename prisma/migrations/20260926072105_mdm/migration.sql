-- CreateTable
CREATE TABLE "MdmOrganizacija" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "vrsta" TEXT NOT NULL,
    "nadredenaId" UUID,
    "partnerId" UUID,
    "kodUpisa" TEXT NOT NULL,
    "aktivna" BOOLEAN NOT NULL DEFAULT true,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MdmOrganizacija_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MdmUredaj" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "organizacijaId" UUID NOT NULL,
    "uredajId" UUID,
    "serijski" TEXT NOT NULL,
    "naziv" TEXT,
    "platforma" TEXT NOT NULL,
    "model" TEXT,
    "osVerzija" TEXT,
    "verzijaAgenta" TEXT,
    "tokenHash" TEXT NOT NULL,
    "stanje" TEXT NOT NULL DEFAULT 'AKTIVAN',
    "zadnjiKontakt" TIMESTAMPTZ(3),
    "izvjestaj" JSONB NOT NULL DEFAULT '{}',
    "upisan" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MdmUredaj_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MdmOrganizacija_kodUpisa_key" ON "MdmOrganizacija"("kodUpisa");

-- CreateIndex
CREATE INDEX "MdmOrganizacija_firmaId_nadredenaId_idx" ON "MdmOrganizacija"("firmaId", "nadredenaId");

-- CreateIndex
CREATE INDEX "MdmOrganizacija_firmaId_partnerId_idx" ON "MdmOrganizacija"("firmaId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "MdmOrganizacija_firmaId_id_key" ON "MdmOrganizacija"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MdmUredaj_tokenHash_key" ON "MdmUredaj"("tokenHash");

-- CreateIndex
CREATE INDEX "MdmUredaj_firmaId_organizacijaId_idx" ON "MdmUredaj"("firmaId", "organizacijaId");

-- CreateIndex
CREATE UNIQUE INDEX "MdmUredaj_firmaId_id_key" ON "MdmUredaj"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MdmUredaj_firmaId_serijski_key" ON "MdmUredaj"("firmaId", "serijski");

-- AddForeignKey
ALTER TABLE "MdmOrganizacija" ADD CONSTRAINT "MdmOrganizacija_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmOrganizacija" ADD CONSTRAINT "MdmOrganizacija_firmaId_nadredenaId_fkey" FOREIGN KEY ("firmaId", "nadredenaId") REFERENCES "MdmOrganizacija"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmOrganizacija" ADD CONSTRAINT "MdmOrganizacija_firmaId_partnerId_fkey" FOREIGN KEY ("firmaId", "partnerId") REFERENCES "Partner"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmUredaj" ADD CONSTRAINT "MdmUredaj_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmUredaj" ADD CONSTRAINT "MdmUredaj_firmaId_organizacijaId_fkey" FOREIGN KEY ("firmaId", "organizacijaId") REFERENCES "MdmOrganizacija"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmUredaj" ADD CONSTRAINT "MdmUredaj_firmaId_uredajId_fkey" FOREIGN KEY ("firmaId", "uredajId") REFERENCES "Uredaj"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
