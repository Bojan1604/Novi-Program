-- 0.3 Uloge i prava.
-- Postojeće firme dobiju ulogu Administrator (sva prava), a postojeći korisnici tu ulogu.
-- Ostale zadane uloge program stvara pri stvaranju nove firme.

CREATE TABLE "Uloga" (
    "id" UUID NOT NULL,
    "firmaId" UUID NOT NULL,
    "naziv" TEXT NOT NULL,
    "opis" TEXT NOT NULL DEFAULT '',
    "prava" JSONB NOT NULL,
    "sustavna" BOOLEAN NOT NULL DEFAULT false,
    "stvoreno" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Uloga_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Uloga_firmaId_naziv_key" ON "Uloga"("firmaId", "naziv");

ALTER TABLE "Uloga" ADD CONSTRAINT "Uloga_firmaId_fkey" FOREIGN KEY ("firmaId") REFERENCES "Firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Uloga" ("id", "firmaId", "naziv", "opis", "prava", "sustavna")
SELECT gen_random_uuid(), f."id", 'Administrator', 'Sva prava. Ne može se mijenjati ni brisati.',
       '{"moduli":{"nadzorna":"puno","uredaji":"puno","sifrarnici":"puno","partneri":"puno","prodaja":"puno","najam":"puno","nabava":"puno","troskovi":"puno","knjigovodja":"puno","servis":"puno","portal":"puno","mdm":"puno","izvjestaji":"puno","postavke":"puno","korisnici":"puno"},"posebna":{"costs":true,"log":true,"opasnaZona":true}}'::jsonb, true
FROM "Firma" f;

ALTER TABLE "ClanstvoFirme" ADD COLUMN "iznimke" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "ulogaId" UUID;

UPDATE "ClanstvoFirme" c SET "ulogaId" = u."id"
FROM "Uloga" u WHERE u."firmaId" = c."firmaId" AND u."naziv" = 'Administrator';

ALTER TABLE "ClanstvoFirme" ALTER COLUMN "ulogaId" SET NOT NULL;

ALTER TABLE "ClanstvoFirme" ADD CONSTRAINT "ClanstvoFirme_ulogaId_fkey" FOREIGN KEY ("ulogaId") REFERENCES "Uloga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ClanstvoFirme_ulogaId_idx" ON "ClanstvoFirme"("ulogaId");
