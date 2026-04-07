-- Archive Customer + Snapshot Invoice customer fields
-- Goal: deleting a customer must never destroy invoice history.
--   1. Add archivedAt to customers (soft-delete)
--   2. Add customer_* snapshot columns to invoices and backfill from current customer rows
--   3. Change invoices.customer_id FK from ON DELETE CASCADE to ON DELETE RESTRICT
--      so a hard delete is impossible while invoices reference the customer.

-- 1. Customer.archivedAt
ALTER TABLE "customers" ADD COLUMN "archived_at" TIMESTAMP(3);
CREATE INDEX "customers_archived_at_idx" ON "customers"("archived_at");

-- 2. Invoice snapshot columns
ALTER TABLE "invoices"
  ADD COLUMN "customer_name"           TEXT,
  ADD COLUMN "customer_email"          TEXT,
  ADD COLUMN "customer_contact_person" TEXT,
  ADD COLUMN "customer_street"         TEXT,
  ADD COLUMN "customer_house_number"   TEXT,
  ADD COLUMN "customer_bus"            TEXT,
  ADD COLUMN "customer_zip_code"       TEXT,
  ADD COLUMN "customer_city"           TEXT,
  ADD COLUMN "customer_country"        TEXT,
  ADD COLUMN "customer_vat_number"     TEXT,
  ADD COLUMN "customer_peppol_id"      TEXT;

-- Backfill snapshot from current customer rows so historical invoices are
-- self-contained immediately.
UPDATE "invoices" i SET
  "customer_name"           = c."name",
  "customer_email"          = c."email",
  "customer_contact_person" = c."contact_person",
  "customer_street"         = c."street",
  "customer_house_number"   = c."house_number",
  "customer_bus"            = c."bus",
  "customer_zip_code"       = c."zip_code",
  "customer_city"           = c."city",
  "customer_country"        = c."country",
  "customer_vat_number"     = c."vat_number",
  "customer_peppol_id"      = c."peppol_id"
FROM "customers" c
WHERE i."customer_id" = c."id";

-- 3. Replace cascade with restrict on the customer FK
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_customer_id_fkey";
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
