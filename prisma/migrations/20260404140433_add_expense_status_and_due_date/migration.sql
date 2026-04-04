-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "due_date" TIMESTAMP(3),
ADD COLUMN     "linked_expense_id" UUID,
ADD COLUMN     "status" TEXT;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_linked_expense_id_fkey" FOREIGN KEY ("linked_expense_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
