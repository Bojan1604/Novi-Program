-- AlterTable
ALTER TABLE "Firma" ADD COLUMN     "kpdNajam" TEXT,
ADD COLUMN     "kpdRoba" TEXT,
ADD COLUMN     "kpdUsluga" TEXT,
ADD COLUMN     "logoId" UUID;

-- CreateTable
CREATE TABLE "LogoFirme" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "vrsta" TEXT NOT NULL,
    "sadrzaj" BYTEA NOT NULL,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogoFirme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LogoFirme_firmaId_id_key" ON "LogoFirme"("firmaId", "id");

-- AddForeignKey
ALTER TABLE "LogoFirme" ADD CONSTRAINT "LogoFirme_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
