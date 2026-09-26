-- CreateTable
CREATE TABLE "MdmProfil" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "organizacijaId" UUID,
    "naziv" TEXT NOT NULL,
    "platforma" TEXT NOT NULL,
    "postavke" JSONB NOT NULL DEFAULT '{}',
    "wifiLozinka" TEXT,
    "verzija" INTEGER NOT NULL DEFAULT 1,
    "aktivan" BOOLEAN NOT NULL DEFAULT true,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "azurirano" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MdmProfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MdmAplikacija" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "paket" TEXT NOT NULL,
    "platforma" TEXT NOT NULL,
    "verzija" TEXT NOT NULL,
    "verzijaKod" INTEGER NOT NULL,
    "nazivDatoteke" TEXT NOT NULL,
    "sadrzaj" BYTEA NOT NULL,
    "velicina" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MdmAplikacija_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MdmDodjela" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "organizacijaId" UUID NOT NULL,
    "paket" TEXT NOT NULL,
    "platforma" TEXT NOT NULL,

    CONSTRAINT "MdmDodjela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MdmDatoteka" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "organizacijaId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "putanja" TEXT NOT NULL,
    "sadrzaj" BYTEA NOT NULL,
    "velicina" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MdmDatoteka_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MdmNaredba" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "mdmUredajId" UUID NOT NULL,
    "vrsta" TEXT NOT NULL,
    "parametri" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'CEKA',
    "rezultat" TEXT,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "poslano" TIMESTAMPTZ(3),
    "zavrseno" TIMESTAMPTZ(3),

    CONSTRAINT "MdmNaredba_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MdmZapis" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "mdmUredajId" UUID NOT NULL,
    "vrijeme" TIMESTAMPTZ(3) NOT NULL,
    "razina" TEXT NOT NULL,
    "poruka" TEXT NOT NULL,
    "primljeno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MdmZapis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MdmSnimka" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "mdmUredajId" UUID NOT NULL,
    "naredbaId" UUID,
    "vrsta" TEXT NOT NULL,
    "slika" BYTEA NOT NULL,
    "velicina" INTEGER NOT NULL,
    "vrijeme" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MdmSnimka_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MdmProfil_firmaId_organizacijaId_idx" ON "MdmProfil"("firmaId", "organizacijaId");

-- CreateIndex
CREATE UNIQUE INDEX "MdmProfil_firmaId_id_key" ON "MdmProfil"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MdmAplikacija_firmaId_id_key" ON "MdmAplikacija"("firmaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MdmAplikacija_firmaId_paket_platforma_verzijaKod_key" ON "MdmAplikacija"("firmaId", "paket", "platforma", "verzijaKod");

-- CreateIndex
CREATE UNIQUE INDEX "MdmDodjela_firmaId_organizacijaId_paket_platforma_key" ON "MdmDodjela"("firmaId", "organizacijaId", "paket", "platforma");

-- CreateIndex
CREATE INDEX "MdmDatoteka_firmaId_organizacijaId_idx" ON "MdmDatoteka"("firmaId", "organizacijaId");

-- CreateIndex
CREATE UNIQUE INDEX "MdmDatoteka_firmaId_id_key" ON "MdmDatoteka"("firmaId", "id");

-- CreateIndex
CREATE INDEX "MdmNaredba_firmaId_mdmUredajId_status_idx" ON "MdmNaredba"("firmaId", "mdmUredajId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MdmNaredba_firmaId_id_key" ON "MdmNaredba"("firmaId", "id");

-- CreateIndex
CREATE INDEX "MdmZapis_firmaId_mdmUredajId_vrijeme_idx" ON "MdmZapis"("firmaId", "mdmUredajId", "vrijeme" DESC);

-- CreateIndex
CREATE INDEX "MdmSnimka_firmaId_mdmUredajId_vrijeme_idx" ON "MdmSnimka"("firmaId", "mdmUredajId", "vrijeme" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MdmSnimka_firmaId_id_key" ON "MdmSnimka"("firmaId", "id");

-- AddForeignKey
ALTER TABLE "MdmProfil" ADD CONSTRAINT "MdmProfil_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmProfil" ADD CONSTRAINT "MdmProfil_firmaId_organizacijaId_fkey" FOREIGN KEY ("firmaId", "organizacijaId") REFERENCES "MdmOrganizacija"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmAplikacija" ADD CONSTRAINT "MdmAplikacija_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmDodjela" ADD CONSTRAINT "MdmDodjela_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmDodjela" ADD CONSTRAINT "MdmDodjela_firmaId_organizacijaId_fkey" FOREIGN KEY ("firmaId", "organizacijaId") REFERENCES "MdmOrganizacija"("firmaId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmDatoteka" ADD CONSTRAINT "MdmDatoteka_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmDatoteka" ADD CONSTRAINT "MdmDatoteka_firmaId_organizacijaId_fkey" FOREIGN KEY ("firmaId", "organizacijaId") REFERENCES "MdmOrganizacija"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmNaredba" ADD CONSTRAINT "MdmNaredba_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmNaredba" ADD CONSTRAINT "MdmNaredba_firmaId_mdmUredajId_fkey" FOREIGN KEY ("firmaId", "mdmUredajId") REFERENCES "MdmUredaj"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmZapis" ADD CONSTRAINT "MdmZapis_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmZapis" ADD CONSTRAINT "MdmZapis_firmaId_mdmUredajId_fkey" FOREIGN KEY ("firmaId", "mdmUredajId") REFERENCES "MdmUredaj"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmSnimka" ADD CONSTRAINT "MdmSnimka_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdmSnimka" ADD CONSTRAINT "MdmSnimka_firmaId_mdmUredajId_fkey" FOREIGN KEY ("firmaId", "mdmUredajId") REFERENCES "MdmUredaj"("firmaId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
