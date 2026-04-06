ALTER TABLE "customers"
ADD COLUMN "invoice_delivery_method" TEXT NOT NULL DEFAULT 'manual_choice';

ALTER TABLE "invoices"
ADD COLUMN "delivery_method" TEXT NOT NULL DEFAULT 'email_pdf',
ADD COLUMN "delivery_status" TEXT NOT NULL DEFAULT 'not_sent',
ADD COLUMN "delivery_sent_at" TIMESTAMP(3),
ADD COLUMN "provider_reference_id" TEXT,
ADD COLUMN "provider_error" TEXT;

CREATE INDEX "invoices_delivery_method_idx" ON "invoices"("delivery_method");
CREATE INDEX "invoices_delivery_status_idx" ON "invoices"("delivery_status");
