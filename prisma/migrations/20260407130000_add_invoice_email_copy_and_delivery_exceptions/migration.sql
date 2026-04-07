ALTER TABLE "invoices"
ADD COLUMN "email_copy_status" TEXT NOT NULL DEFAULT 'not_sent',
ADD COLUMN "email_copy_sent_at" TIMESTAMP(3),
ADD COLUMN "email_copy_recipients" JSONB,
ADD COLUMN "email_copy_provider" TEXT,
ADD COLUMN "delivery_exception_code" TEXT,
ADD COLUMN "delivery_exception_note" TEXT;
