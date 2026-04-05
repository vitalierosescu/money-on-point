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
import { Resend } from "resend"
import React from "react"
import { generateInvoicePDF } from "@/app/(app)/apps/invoices/actions"
import { InvoiceEmail } from "@/components/emails/invoice-email"
import type { InvoiceFormData } from "@/app/(app)/apps/invoices/components/invoice-page"
import config from "@/lib/config"

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

export async function sendInvoiceEmailAction(invoiceId: string, recipientEmail: string) {
  const user = await getCurrentUser()

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId, userId: user.id },
  })

  if (!invoice) throw new Error("Invoice not found")
  if (!invoice.templateData) throw new Error("Invoice has no template data — open and save the invoice first")

  const templateData = invoice.templateData as unknown as InvoiceFormData

  // Generate PDF from stored templateData
  const pdfBuffer = await generateInvoicePDF(templateData)
  const pdfBase64 = Buffer.from(pdfBuffer).toString("base64")

  // Format display values for the email
  const total = new Intl.NumberFormat("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(invoice.total / 100)
  const dueDate = invoice.dueDate
    ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long", year: "numeric" }).format(new Date(invoice.dueDate))
    : "–"
  const businessName = user.name ?? "TaxHacker"
  const bankDetails = templateData.bankDetails ?? undefined

  const resend = new Resend(config.email.apiKey)

  const { error } = await resend.emails.send({
    from: `${businessName} <${config.email.from}>`,
    to: recipientEmail,
    replyTo: user.email,
    subject: `Factuur ${invoice.invoiceNumber} — ${businessName}`,
    react: React.createElement(InvoiceEmail, {
      businessName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceTotal: total,
      currency: invoice.currency,
      dueDate,
      bankDetails,
      notes: invoice.notes ?? undefined,
    }),
    attachments: [
      {
        filename: `${invoice.invoiceNumber}.pdf`,
        content: pdfBase64,
      },
    ],
  })

  if (error) throw new Error(`Email sending failed: ${error.message}`)

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "sent" },
  })

  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath("/invoices")
}
