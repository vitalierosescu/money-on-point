-- AlterTable
ALTER TABLE "customers"
  ADD COLUMN "peppol_verified" BOOLEAN,
  ADD COLUMN "peppol_verified_at" TIMESTAMP(3),
  ADD COLUMN "recommand_directory_source" TEXT;
