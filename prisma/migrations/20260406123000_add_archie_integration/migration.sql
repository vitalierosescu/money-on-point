-- CreateTable
CREATE TABLE "archie_customer_maps" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "archie_entity_type" TEXT NOT NULL,
    "archie_entity_id" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "archie_customer_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archie_invoice_maps" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "archie_invoice_id" TEXT NOT NULL,
    "invoice_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "archie_invoice_maps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "archie_customer_maps_user_id_archie_entity_type_archie_entity_id_key" ON "archie_customer_maps"("user_id", "archie_entity_type", "archie_entity_id");

-- CreateIndex
CREATE INDEX "archie_customer_maps_customer_id_idx" ON "archie_customer_maps"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "archie_invoice_maps_user_id_archie_invoice_id_key" ON "archie_invoice_maps"("user_id", "archie_invoice_id");

-- CreateIndex
CREATE INDEX "archie_invoice_maps_invoice_id_idx" ON "archie_invoice_maps"("invoice_id");

-- AddForeignKey
ALTER TABLE "archie_customer_maps" ADD CONSTRAINT "archie_customer_maps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archie_customer_maps" ADD CONSTRAINT "archie_customer_maps_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archie_invoice_maps" ADD CONSTRAINT "archie_invoice_maps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archie_invoice_maps" ADD CONSTRAINT "archie_invoice_maps_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
