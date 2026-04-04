import { prisma } from "@/lib/db"
import { Payment } from "@/prisma/client"
import { createTransaction } from "./transactions"
import { updateInvoiceStatus } from "./invoices"

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
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    include: { customer: true, payments: true },
  })

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`)
  }

  const payment = await prisma.payment.create({
    data: {
      invoiceId,
      amount: input.amount,
      paidAt: input.paidAt,
      note: input.note ?? null,
    },
  })

  const allPayments = await prisma.payment.findMany({
    where: { invoiceId },
  })
  const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0)

  const invoiceFullyPaid = totalPaid >= invoice.total

  if (invoiceFullyPaid) {
    const transaction = await createTransaction(userId, {
      name: `Invoice ${invoice.invoiceNumber} - ${invoice.customer.name}`,
      total: invoice.total,
      currencyCode: invoice.currency,
      type: "income",
      issuedAt: input.paidAt,
      categoryCode: "invoice",
      customerId: invoice.customerId,
    })

    await updateInvoiceStatus(invoiceId, userId, "paid", {
      paidAt: input.paidAt,
      transactionId: transaction.id,
    })

    await prisma.invoice.update({
      where: { id: invoiceId, userId },
      data: { paidAmount: totalPaid },
    })
  } else {
    await prisma.invoice.update({
      where: { id: invoiceId, userId },
      data: {
        status: "partially_paid",
        paidAmount: totalPaid,
      },
    })
  }

  return { payment, invoiceFullyPaid }
}
