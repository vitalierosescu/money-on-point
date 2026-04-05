ALTER TABLE "invoices"
ADD COLUMN "invoice_mode" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN "author_rights_data" JSONB;

CREATE INDEX "invoices_invoice_mode_idx" ON "invoices"("invoice_mode");
