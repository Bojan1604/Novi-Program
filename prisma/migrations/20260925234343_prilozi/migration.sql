-- CreateTable
CREATE TABLE "Prilog" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "entitet" TEXT NOT NULL,
    "entitetId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "vrsta" TEXT NOT NULL,
    "velicina" INTEGER NOT NULL,
    "sadrzaj" BYTEA NOT NULL,
    "javno" BOOLEAN NOT NULL DEFAULT false,
    "korisnikId" UUID,
    "korisnik" TEXT NOT NULL DEFAULT 'Sustav',
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prilog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prilog_firmaId_entitet_entitetId_idx" ON "Prilog"("firmaId", "entitet", "entitetId");

-- CreateIndex
CREATE UNIQUE INDEX "Prilog_firmaId_id_key" ON "Prilog"("firmaId", "id");

-- AddForeignKey
ALTER TABLE "Prilog" ADD CONSTRAINT "Prilog_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

