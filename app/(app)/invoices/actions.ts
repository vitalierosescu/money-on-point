"use server"

import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
  getInvoiceDeliveryMethod,
  normalizeInvoiceDeliveryMethod,
} from "@/lib/invoice-delivery"
import {
  validateInvoiceForPeppolDelivery,
  validateInvoiceForSending,
  type InvoiceFieldErrors,
} from "@/lib/invoice-validation"
import { isAuthorRightsMode } from "@/lib/author-rights"
import { generateInvoicePDF } from "@/lib/invoice-pdf/generate"
import { InvoiceTemplate } from "@/lib/invoice-pdf/templates"
import type { InvoiceFormData } from "@/lib/invoice-pdf/types"
import { verifyPeppolRecipient, sendInvoiceEmailViaRecommand } from "@/lib/recommand"
import { sendInvoiceViaPeppolForUser } from "@/lib/peppol-send"
import { buildRecommandInvoicePayload, RecommandAttachment } from "@/lib/recommand-payload"
import {
  getActiveRecommandEnvironment,
  getRecommandEnvironmentLabel,
  hasConfiguredRecommandCredentials,
} from "@/lib/recommand-settings"
import {
  getDirectorySize,
  getUserUploadsDirectory,
  isEnoughStorageToUploadFile,
  safePathJoin,
  unsortedFilePath,
} from "@/lib/files"
import { getAppData, setAppData } from "@/models/apps"
import { createFile, updateFile } from "@/models/files"
import {
  CreateInvoiceData,
  createInvoice,
  deleteInvoice,
  getInvoiceById,
  getNextInvoiceNumber,
  updateInvoice,
  updateInvoiceStatus,
} from "@/models/invoices"
import { recordPayment } from "@/models/payments"
import { getSettings } from "@/models/settings"
import { createTransaction, updateTransaction } from "@/models/transactions"
import { Prisma, User } from "@/prisma/client"
import { revalidatePath, revalidateTag } from "next/cache"
import { randomUUID } from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"

type InvoiceAppData = {
  templates: InvoiceTemplate[]
}

type InvoiceActionResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string; fieldErrors?: InvoiceFieldErrors }

function flattenRecommandErrors(errors?: Record<string, string[]>): string {
  if (!errors) return "Recommand rejected the invoice."
  return Object.entries(errors)
    .flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
    .join(" ")
}

export async function addNewTemplateAction(user: User, template: InvoiceTemplate) {
  const appData = (await getAppData(user, "invoices")) as InvoiceAppData | null
  const updatedTemplates = [...(appData?.templates || []), template]
  const appDataResult = await setAppData(user, "invoices", { ...appData, templates: updatedTemplates })
  return { success: true, data: appDataResult }
}

export async function deleteTemplateAction(user: User, templateId: string) {
  const appData = (await getAppData(user, "invoices")) as InvoiceAppData | null
  if (!appData) return { success: false, error: "No app data found" }

  const updatedTemplates = appData.templates.filter((t) => t.id !== templateId)
  const appDataResult = await setAppData(user, "invoices", { ...appData, templates: updatedTemplates })
  return { success: true, data: appDataResult }
}

export async function createInvoiceAction(data: CreateInvoiceData): Promise<InvoiceActionResult<{ id: string }>> {
  const user = await getCurrentUser()
  const validation = await validateInvoiceDraftOrSent(user.id, user, data)
  if (!validation.success) return validation

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
  return { success: true, data: { id: invoice.id } }
}

export async function updateInvoiceAction(id: string, data: Partial<CreateInvoiceData>): Promise<InvoiceActionResult<{ id: string }>> {
  const user = await getCurrentUser()
  const existing = await prisma.invoice.findFirst({
    where: { id, userId: user.id },
    include: { customer: true },
  })

  if (!existing) {
    return { success: false, error: "Invoice not found" }
  }

  if (existing.status !== "draft") {
    return { success: false, error: "Only draft invoices can be edited." }
  }

  const mergedData: CreateInvoiceData = {
    customerId: data.customerId ?? existing.customerId,
    invoiceNumber: data.invoiceNumber ?? existing.invoiceNumber,
    status: data.status ?? existing.status,
    issuedAt: data.issuedAt ?? existing.issuedAt,
    dueDate: data.dueDate ?? existing.dueDate,
    currency: data.currency ?? existing.currency,
    subtotal: data.subtotal ?? existing.subtotal,
    taxTotal: data.taxTotal ?? existing.taxTotal,
    total: data.total ?? existing.total,
    items: data.items ?? existing.items,
    taxes: data.taxes ?? existing.taxes ?? undefined,
    fees: data.fees ?? existing.fees ?? undefined,
    paymentReference: data.paymentReference ?? existing.paymentReference ?? null,
    poNumber: data.poNumber ?? existing.poNumber ?? null,
    subject: data.subject ?? existing.subject ?? null,
    notes: data.notes ?? existing.notes ?? null,
    paymentTerms: data.paymentTerms ?? existing.paymentTerms ?? null,
    invoiceMode: data.invoiceMode ?? existing.invoiceMode,
    authorRightsData: data.authorRightsData ?? (existing.authorRightsData as Prisma.InputJsonValue | undefined),
    isVatReversed: data.isVatReversed ?? existing.isVatReversed,
    deliveryMethod: data.deliveryMethod ?? existing.deliveryMethod,
    deliveryStatus: data.deliveryStatus ?? existing.deliveryStatus,
    deliverySentAt: data.deliverySentAt ?? existing.deliverySentAt,
    providerReferenceId: data.providerReferenceId ?? existing.providerReferenceId,
    providerError: data.providerError ?? existing.providerError,
    templateData: data.templateData ?? (existing.templateData as Prisma.InputJsonValue),
    pdfPath: data.pdfPath ?? existing.pdfPath ?? null,
  }

  const validation = await validateInvoiceDraftOrSent(user.id, user, mergedData)
  if (!validation.success) return validation

  const invoice = await updateInvoice(id, user.id, data)
  revalidatePath("/invoices")
  revalidatePath(`/invoices/${id}`)
  return { success: true, data: { id: invoice.id } }
}

export async function markInvoiceSentAction(id: string): Promise<InvoiceActionResult> {
  const user = await getCurrentUser()
  const invoice = await prisma.invoice.findFirst({
    where: { id, userId: user.id },
    include: { customer: true },
  })

  if (!invoice) return { success: false, error: "Invoice not found" }
  if (invoice.status !== "draft") {
    return { success: false, error: "Only draft invoices can be marked as sent." }
  }

  const templateData = invoice.templateData as InvoiceFormData | null
  const validation = validateInvoiceForSending({
    businessName: user.businessName,
    businessAddress: user.businessAddress,
    businessBankDetails: user.businessBankDetails,
    customer: invoice.customer,
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    items: invoice.items,
    templateData,
  })
  if (validation.message) {
    return { success: false, error: validation.message, fieldErrors: validation.fieldErrors }
  }

  await updateInvoiceStatus(id, user.id, "sent")
  revalidatePath("/invoices")
  revalidatePath(`/invoices/${id}`)
  return { success: true }
}

export async function markInvoicePaidAction(id: string, paidAt: Date) {
  const user = await getCurrentUser()
  const invoice = await getInvoiceById(id, user.id)
  if (!invoice) return { success: false, error: "Invoice not found" }
  if (!["sent", "overdue", "partially_paid"].includes(invoice.status)) {
    return { success: false, error: "Only sent invoices can be marked as paid." }
  }

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
  const invoice = await getInvoiceById(id, user.id)
  if (!invoice) return { success: false, error: "Invoice not found" }
  if (!["sent", "overdue", "partially_paid"].includes(invoice.status)) {
    return { success: false, error: "Only sent invoices can be cancelled." }
  }
  await updateInvoiceStatus(id, user.id, "cancelled")
  revalidatePath("/invoices")
  revalidatePath(`/invoices/${id}`)
  return { success: true }
}

export async function deleteInvoiceAction(id: string) {
  const user = await getCurrentUser()
  const invoice = await getInvoiceById(id, user.id)
  if (!invoice) return { success: false, error: "Invoice not found" }
  if (!["draft", "cancelled"].includes(invoice.status)) {
    return { success: false, error: "Only draft or cancelled invoices can be deleted." }
  }
  await deleteInvoice(id, user.id)
  revalidatePath("/invoices")
  return { success: true }
}

export async function sendInvoiceEmailAction(invoiceId: string, recipientEmail: string): Promise<InvoiceActionResult> {
  const user = await getCurrentUser()

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId: user.id },
    include: { customer: true },
  })

  if (!invoice) {
    return { success: false, error: "Invoice not found" }
  }
  if (!["draft", "sent", "overdue", "partially_paid"].includes(invoice.status)) {
    return { success: false, error: "This invoice can no longer be sent." }
  }
  if (getInvoiceDeliveryMethod(invoice) !== "email_pdf") {
    return { success: false, error: "Switch this invoice to Email + PDF before sending it by email." }
  }
  if (!invoice.templateData) {
    return { success: false, error: "Invoice has no template data — open and save the invoice first" }
  }

  const templateData = invoice.templateData as unknown as InvoiceFormData
  const validation = validateInvoiceForSending({
    businessName: user.businessName,
    businessAddress: user.businessAddress,
    businessBankDetails: user.businessBankDetails,
    customer: invoice.customer,
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    items: invoice.items,
    templateData,
    recipientEmail,
  })

  if (validation.message) {
    return { success: false, error: validation.message, fieldErrors: validation.fieldErrors }
  }

  const settings = await getSettings(user.id)
  const activeEnvironment = getActiveRecommandEnvironment(settings)
  if (!hasConfiguredRecommandCredentials(settings, activeEnvironment)) {
    return {
      success: false,
      error: `Add Recommand credentials for the active ${getRecommandEnvironmentLabel(activeEnvironment)} environment.`,
    }
  }

  // Generate PDF from stored templateData
  const pdfBuffer = await generateInvoicePDF(templateData)
  const pdfBase64 = Buffer.from(pdfBuffer).toString("base64")

  const attachments: RecommandAttachment[] = [
    {
      id: "INV-PDF",
      documentType: "130",
      mimeCode: "application/pdf",
      filename: `${invoice.invoiceNumber}.pdf`,
      embeddedDocument: pdfBase64,
    },
  ]

  const payload = buildRecommandInvoicePayload(user, settings, invoice, attachments)

  try {
    const result = await sendInvoiceEmailViaRecommand(settings, [recipientEmail], payload)

    if (!result.success) {
      const providerError = flattenRecommandErrors(result.errors)
      await prisma.invoice.update({
        where: { id: invoiceId, userId: user.id },
        data: {
          deliveryMethod: "email_pdf",
          deliveryStatus: "failed",
          providerError,
        },
      })
      revalidateInvoiceDeliveryPaths(invoiceId)
      return { success: false, error: providerError }
    }

    await prisma.invoice.update({
      where: { id: invoiceId, userId: user.id },
      data: {
        status: "sent",
        deliveryMethod: "email_pdf",
        deliveryStatus: "sent",
        deliverySentAt: new Date(),
        providerReferenceId: result.id ?? null,
        providerError: null,
      },
    })

    revalidateInvoiceDeliveryPaths(invoiceId)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email sending failed."
    await prisma.invoice.update({
      where: { id: invoiceId, userId: user.id },
      data: {
        deliveryMethod: "email_pdf",
        deliveryStatus: "failed",
        providerError: message,
      },
    })
    revalidateInvoiceDeliveryPaths(invoiceId)
    return { success: false, error: message }
  }
}

export async function setInvoiceDeliveryMethodAction(
  invoiceId: string,
  deliveryMethod: string
): Promise<InvoiceActionResult> {
  const user = await getCurrentUser()
  const normalizedMethod = normalizeInvoiceDeliveryMethod(deliveryMethod)

  if (!normalizedMethod) {
    return { success: false, error: "Unknown delivery method." }
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId: user.id },
  })

  if (!invoice) {
    return { success: false, error: "Invoice not found" }
  }

  if (normalizedMethod === "peppol" && isAuthorRightsMode(invoice.invoiceMode)) {
    return { success: false, error: "Author-rights invoices are currently supported with Email + PDF only." }
  }

  if (invoice.deliveryStatus === "sent") {
    return { success: false, error: "Delivery method is locked after the invoice has been sent." }
  }

  await prisma.invoice.update({
    where: { id: invoice.id, userId: user.id },
    data: {
      deliveryMethod: normalizedMethod,
      deliveryStatus: "not_sent",
      deliverySentAt: null,
      providerReferenceId: null,
      providerError: null,
    },
  })

  revalidatePath("/invoices")
  revalidatePath(`/invoices/${invoiceId}`)
  return { success: true }
}

export async function verifyInvoicePeppolRecipientAction(invoiceId: string): Promise<InvoiceActionResult> {
  const user = await getCurrentUser()
  const settings = await getSettings(user.id)
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId: user.id },
    include: { customer: true },
  })

  if (!invoice) {
    return { success: false, error: "Invoice not found" }
  }

  if (invoice.status === "draft") {
    return { success: false, error: "Save the invoice as sent before verifying PEPPOL delivery." }
  }

  if (isAuthorRightsMode(invoice.invoiceMode)) {
    return { success: false, error: "Author-rights invoices are currently supported with Email + PDF only." }
  }

  if (getInvoiceDeliveryMethod(invoice) !== "peppol") {
    return { success: false, error: "This invoice is not using PEPPOL delivery." }
  }

  const validation = validateInvoiceForPeppolDelivery({
    businessName: user.businessName,
    businessAddress: user.businessAddress,
    businessBankDetails: user.businessBankDetails,
    customer: invoice.customer,
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    items: invoice.items,
    templateData: (invoice.templateData as unknown as InvoiceFormData | undefined) ?? null,
    settings,
  })

  if (validation.message) {
    return { success: false, error: validation.message, fieldErrors: validation.fieldErrors }
  }

  try {
    const result = await verifyPeppolRecipient(
      settings,
      invoice.customer.peppolId ?? "",
      invoice.customer.country
    )

    if (!result.isValid) {
      await prisma.invoice.update({
        where: { id: invoice.id, userId: user.id },
        data: {
          deliveryMethod: "peppol",
          deliveryStatus: "failed",
          providerError: result.message ?? "Recipient is not registered in the PEPPOL network.",
        },
      })
      revalidateInvoiceDeliveryPaths(invoice.id)
      return { success: false, error: result.message ?? "Recipient is not registered in the PEPPOL network." }
    }

    await prisma.invoice.update({
      where: { id: invoice.id, userId: user.id },
      data: {
        deliveryMethod: "peppol",
        deliveryStatus: "verified",
        providerError: null,
      },
    })
    revalidateInvoiceDeliveryPaths(invoice.id)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "PEPPOL verification failed."
    await prisma.invoice.update({
      where: { id: invoice.id, userId: user.id },
      data: {
        deliveryMethod: "peppol",
        deliveryStatus: "failed",
        providerError: message,
      },
    })
    revalidateInvoiceDeliveryPaths(invoice.id)
    return { success: false, error: message }
  }
}

export async function sendInvoicePeppolAction(invoiceId: string): Promise<InvoiceActionResult> {
  const user = await getCurrentUser()
  const result = await sendInvoiceViaPeppolForUser(user.id, invoiceId)
  revalidateInvoiceDeliveryPaths(invoiceId)

  if (!result.success) {
    return result
  }

  return { success: true, data: { providerReferenceId: result.providerReferenceId } }
}

export async function downloadInvoicePDFAction(invoiceId: string): Promise<{ base64: string; filename: string }> {
  const user = await getCurrentUser()
  const invoice = await getInvoiceById(invoiceId, user.id)
  if (!invoice) throw new Error("Invoice not found")
  if (!invoice.templateData) throw new Error("No template data")

  const templateData = invoice.templateData as unknown as InvoiceFormData
  const pdfBuffer = await generateInvoicePDF(templateData)
  const base64 = Buffer.from(pdfBuffer).toString("base64")
  return { base64, filename: `${invoice.invoiceNumber}.pdf` }
}

export async function duplicateInvoiceAction(id: string) {
  const user = await getCurrentUser()
  const original = await getInvoiceById(id, user.id)
  if (!original) throw new Error("Invoice not found")
  if (original.status === "draft") throw new Error("Draft invoices should be edited instead of duplicated")

  const newInvoiceNumber = await getNextInvoiceNumber(user.id)
  const today = new Date()

  const daysUntilDue =
    original.dueDate && original.issuedAt
      ? Math.round(
          (new Date(original.dueDate).getTime() - new Date(original.issuedAt).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 30
  const newDueDate = new Date(today.getTime() + daysUntilDue * 24 * 60 * 60 * 1000)

  const newInvoice = await createInvoice(user.id, {
    customerId: original.customerId ?? "",
    invoiceNumber: newInvoiceNumber,
    status: "draft",
    issuedAt: today,
    dueDate: newDueDate,
    currency: original.currency,
    subtotal: original.subtotal,
    taxTotal: original.taxTotal,
    total: original.total,
    items: original.items,
    taxes: original.taxes ?? undefined,
    fees: original.fees ?? undefined,
    paymentReference: original.paymentReference ?? null,
    poNumber: original.poNumber ?? null,
    subject: original.subject ?? null,
    notes: original.notes ?? null,
    paymentTerms: original.paymentTerms ?? null,
    invoiceMode: original.invoiceMode ?? "standard",
    authorRightsData: original.authorRightsData ?? undefined,
    isVatReversed: original.isVatReversed ?? false,
    deliveryMethod: original.deliveryMethod,
    deliveryStatus: "not_sent",
    deliverySentAt: null,
    providerReferenceId: null,
    providerError: null,
    templateData: original.templateData ?? undefined,
  })

  revalidatePath("/invoices")
  return { success: true, data: newInvoice }
}

export async function uploadAndAttachFileToInvoiceAction(
  invoiceId: string,
  formData: FormData
): Promise<InvoiceActionResult> {
  const user = await getCurrentUser()
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId: user.id },
    include: { customer: true },
  })

  if (!invoice) {
    return { success: false, error: "Invoice not found" }
  }

  const files = formData.getAll("files") as File[]
  if (!files.length) {
    return { success: false, error: "No files provided" }
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  if (!isEnoughStorageToUploadFile(user, totalSize)) {
    return { success: false, error: "Insufficient storage" }
  }

  const transactionId = await ensureInvoiceTransaction(user.id, invoice)
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId: user.id },
  })

  if (!transaction) {
    return { success: false, error: "Linked invoice transaction not found" }
  }

  const currentFiles = Array.isArray(transaction.files) ? (transaction.files as string[]) : []
  const userUploadsDir = getUserUploadsDirectory(user)
  const nextFiles = [...currentFiles]

  for (const file of files) {
    if (!(file instanceof File)) continue

    const fileUuid = randomUUID()
    const relativeFilePath = unsortedFilePath(fileUuid, file.name)
    const fullFilePath = safePathJoin(userUploadsDir, relativeFilePath)
    const buffer = Buffer.from(await file.arrayBuffer())

    await mkdir(path.dirname(fullFilePath), { recursive: true })
    await writeFile(fullFilePath, buffer)

    const fileRecord = await createFile(user.id, {
      id: fileUuid,
      filename: file.name,
      path: relativeFilePath,
      mimetype: file.type,
      metadata: { size: file.size, lastModified: file.lastModified },
    })

    await updateFile(fileRecord.id, user.id, { isReviewed: true })
    nextFiles.push(fileRecord.id)
  }

  await prisma.transaction.update({
    where: { id: transaction.id, userId: user.id },
    data: { files: nextFiles },
  })

  const storageUsed = await getDirectorySize(userUploadsDir)
  await prisma.user.update({
    where: { id: user.id },
    data: { storageUsed },
  })

  revalidateTag(`unsorted:${user.id}`)
  revalidateTag(`user:${user.id}`)
  revalidatePath("/invoices")
  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath("/files")

  return { success: true }
}

async function validateInvoiceDraftOrSent(
  userId: string,
  user: User,
  data: CreateInvoiceData
): Promise<InvoiceActionResult> {
  if (data.status !== "sent") {
    return { success: true }
  }

  if (isAuthorRightsMode(data.invoiceMode) && normalizeInvoiceDeliveryMethod(data.deliveryMethod) === "peppol") {
    return {
      success: false,
      error: "Author-rights invoices are currently supported with Email + PDF only.",
      fieldErrors: { deliveryMethod: "Author-rights invoices are currently supported with Email + PDF only." },
    }
  }

  const customer = await prisma.customer.findFirst({
    where: { id: data.customerId, userId },
  })

  const validation = validateInvoiceForSending({
    businessName: user.businessName,
    businessAddress: user.businessAddress,
    businessBankDetails: user.businessBankDetails,
    customer,
    invoiceNumber: data.invoiceNumber,
    issuedAt: data.issuedAt,
    dueDate: data.dueDate,
    currency: data.currency,
    items: data.items,
    templateData: (data.templateData as InvoiceFormData | undefined) ?? null,
  })

  if (validation.message) {
    return {
      success: false,
      error: validation.message,
      fieldErrors: validation.fieldErrors,
    }
  }

  return { success: true }
}

function revalidateInvoiceDeliveryPaths(invoiceId: string) {
  revalidatePath("/dashboard")
  revalidatePath("/invoices")
  revalidatePath(`/invoices/${invoiceId}`)
}

async function ensureInvoiceTransaction(
  userId: string,
  invoice: Prisma.InvoiceGetPayload<{ include: { customer: true } }>
): Promise<string> {
  if (invoice.transactionId) {
    const existingTransaction = await prisma.transaction.findFirst({
      where: { id: invoice.transactionId, userId },
    })
    if (existingTransaction) {
      return existingTransaction.id
    }
  }

  const transaction = await createTransaction(userId, {
    name: invoice.invoiceNumber,
    total: invoice.total,
    currencyCode: invoice.currency,
    type: "income",
    issuedAt: invoice.issuedAt,
    categoryCode: "invoice",
    customerId: invoice.customerId,
    files: [],
  })

  await prisma.invoice.update({
    where: { id: invoice.id, userId },
    data: { transactionId: transaction.id },
  })

  return transaction.id
}
