"use server"

import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"
import {
  createInvoice,
  updateInvoice,
  updateInvoiceStatus,
  deleteInvoice,
  getInvoiceById,
  CreateInvoiceData,
} from "@/models/invoices"
import { recordPayment } from "@/models/payments"
import { createTransaction, updateTransaction } from "@/models/transactions"
import { revalidatePath } from "next/cache"

export async function createInvoiceAction(data: CreateInvoiceData) {
  const user = await getCurrentUser()
  const invoice = await createInvoice(user.id, data)

  // Create linked income transaction for accounting purposes
  const transaction = await createTransaction(user.id, {
    name: invoice.invoiceNumber,
    merchant: null,
    total: invoice.total,
    currencyCode: invoice.currency,
    type: "income",
    issuedAt: invoice.issuedAt,
    categoryCode: "invoice",
    customerId: invoice.customerId ?? null,
  })

  await prisma.invoice.update({
    where: { id: invoice.id, userId: user.id },
    data: { transactionId: transaction.id },
  })

  revalidatePath("/invoices")
  return { success: true, data: invoice }
}

export async function updateInvoiceAction(
  id: string,
  data: Partial<CreateInvoiceData>
) {
  const user = await getCurrentUser()
  const invoice = await updateInvoice(id, user.id, data)
  revalidatePath("/invoices")
  revalidatePath(`/invoices/${id}`)
  return { success: true, data: invoice }
}

export async function markInvoiceSentAction(id: string) {
  const user = await getCurrentUser()
  await updateInvoiceStatus(id, user.id, "sent")
  revalidatePath("/invoices")
  revalidatePath(`/invoices/${id}`)
  return { success: true }
}

export async function markInvoicePaidAction(id: string, paidAt: Date) {
  const user = await getCurrentUser()
  const invoice = await getInvoiceById(id, user.id)
  if (!invoice) return { success: false, error: "Invoice not found" }

  type InvoiceWithCustomer = Prisma.InvoiceGetPayload<{ include: { customer: true } }>
  const customer = (invoice as InvoiceWithCustomer).customer

  let transactionId = invoice.transactionId

  if (transactionId) {
    // Reuse existing transaction — just update its date to actual payment date
    await updateTransaction(transactionId, user.id, { issuedAt: paidAt })
  } else {
    // Fallback: invoice was created before linked-transaction logic
    const transaction = await createTransaction(user.id, {
      name: `Invoice ${invoice.invoiceNumber} - ${customer?.name || "Unknown"}`,
      total: invoice.total,
      currencyCode: invoice.currency,
      type: "income",
      issuedAt: paidAt,
      categoryCode: "invoice",
      customerId: invoice.customerId,
    })
    transactionId = transaction.id
  }

  await updateInvoiceStatus(id, user.id, "paid", { paidAt, transactionId })

  await prisma.invoice.update({
    where: { id, userId: user.id },
    data: { paidAmount: invoice.total },
  })

  revalidatePath("/invoices")
  revalidatePath(`/invoices/${id}`)
  revalidatePath("/dashboard")
  return { success: true }
}

export async function recordPaymentAction(
  invoiceId: string,
  data: { amount: number; paidAt: Date; note?: string }
) {
  const user = await getCurrentUser()
  const result = await recordPayment(invoiceId, user.id, data)
  revalidatePath("/invoices")
  revalidatePath(`/invoices/${invoiceId}`)
  if (result.invoiceFullyPaid) {
    revalidatePath("/dashboard")
  }
  return { success: true, data: result }
}

export async function cancelInvoiceAction(id: string) {
  const user = await getCurrentUser()
  await updateInvoiceStatus(id, user.id, "cancelled")
  revalidatePath("/invoices")
  revalidatePath(`/invoices/${id}`)
  return { success: true }
}

export async function deleteInvoiceAction(id: string) {
  const user = await getCurrentUser()
  await deleteInvoice(id, user.id)
  revalidatePath("/invoices")
  return { success: true }
}
