import { prisma } from "@/lib/db"
import { Payment, Prisma } from "@/prisma/client"
import { getFields } from "./fields"
import { TransactionData } from "./transactions"

export type RecordPaymentInput = {
  amount: number
  paidAt: Date
  note?: string
}

export type RecordPaymentResult = {
  payment: Payment
  invoiceFullyPaid: boolean
}

export const recordPayment = async (
  invoiceId: string,
  userId: string,
  input: RecordPaymentInput
): Promise<RecordPaymentResult> => {
  // Pre-fetch fields outside the transaction (read-only, no atomicity needed)
  const fields = await getFields(userId)

  return prisma.$transaction(async (tx) => {
    // Verify invoice ownership
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, userId },
      include: { customer: true },
    })
    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`)

    // Create payment
    const payment = await tx.payment.create({
      data: {
        invoiceId,
        amount: input.amount,
        paidAt: input.paidAt,
        note: input.note ?? null,
      },
    })

    // Sum all payments including the new one
    const allPayments = await tx.payment.findMany({ where: { invoiceId } })
    const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0)
    const invoiceFullyPaid = totalPaid >= invoice.total

    if (invoiceFullyPaid) {
      let transactionId = invoice.transactionId

      if (transactionId) {
        // Reuse the transaction created at invoice-creation time; update its date
        await tx.transaction.update({
          where: { id: transactionId },
          data: { issuedAt: input.paidAt },
        })
      } else {
        // Fallback for invoices created before linked-transaction logic
        const transactionData: TransactionData = {
          name: `Invoice ${invoice.invoiceNumber} - ${invoice.customer.name}`,
          total: invoice.total,
          currencyCode: invoice.currency,
          type: "income",
          issuedAt: input.paidAt,
          categoryCode: "invoice",
          customerId: invoice.customerId,
        }

        const standard: TransactionData = {}
        const extra: Record<string, unknown> = {}

        Object.entries(transactionData).forEach(([key, value]) => {
          const fieldDef = fields.find((f) => f.code === key)
          if (fieldDef) {
            if (fieldDef.isExtra) {
              extra[key] = value
            } else {
              standard[key] = value
            }
          }
        })

        const transaction = await tx.transaction.create({
          data: {
            ...standard,
            extra: extra as Prisma.InputJsonValue,
            items: [] as unknown as Prisma.InputJsonValue,
            userId,
          },
        })

        transactionId = transaction.id
      }

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: "paid",
          paidAt: input.paidAt,
          paidAmount: totalPaid,
          transactionId,
        },
      })
    } else {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: "partially_paid",
          paidAmount: totalPaid,
        },
      })
    }

    return { payment, invoiceFullyPaid }
  })
}
