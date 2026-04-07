import { prisma } from "@/lib/db"
import {
  normalizeEmailCopyStatus,
  normalizeInvoiceDeliveryMethod,
  normalizeInvoiceDeliveryStatus,
} from "@/lib/invoice-delivery"
import { Invoice, Prisma } from "@/prisma/client"
import { cache } from "react"

export type InvoiceWithCustomer = Prisma.InvoiceGetPayload<{
  include: { customer: true; payments: true; transaction: true }
}>

export type InvoiceFilters = {
  status?: string
  customerId?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}

export const getInvoices = async (userId: string, filters?: InvoiceFilters): Promise<InvoiceWithCustomer[]> => {
  const where: Prisma.InvoiceWhereInput = { userId }

  if (filters?.status) {
    where.status = filters.status
  }
  if (filters?.customerId) {
    where.customerId = filters.customerId
  }
  if (filters?.dateFrom || filters?.dateTo) {
    where.issuedAt = {
      gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
      lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
    }
  }
  if (filters?.search) {
    where.OR = [
      { invoiceNumber: { contains: filters.search, mode: "insensitive" } },
      { customer: { name: { contains: filters.search, mode: "insensitive" } } },
      { subject: { contains: filters.search, mode: "insensitive" } },
    ]
  }

  // Auto-detect overdue invoices (update on read)
  const now = new Date()
  await prisma.invoice.updateMany({
    where: {
      userId,
      status: { in: ["sent", "partially_paid"] },
      dueDate: { lt: now },
    },
    data: { status: "overdue" },
  })

  return prisma.invoice.findMany({
    where,
    include: { customer: true, payments: true, transaction: true },
    orderBy: { issuedAt: "desc" },
  })
}

export const getInvoiceById = cache(
  async (id: string, userId: string): Promise<Invoice | null> => {
    return prisma.invoice.findFirst({
      where: { id, userId },
      include: { customer: true, payments: true, transaction: true },
    })
  }
)

export const getNextInvoiceNumber = cache(
  async (userId: string): Promise<string> => {
    const year = new Date().getFullYear()
    const prefix = `${year}-`

    const latest = await prisma.invoice.findFirst({
      where: {
        userId,
        invoiceNumber: { startsWith: prefix },
      },
      orderBy: { invoiceNumber: "desc" },
    })

    if (latest) {
      const currentNum = parseInt(latest.invoiceNumber.split("-")[1], 10)
      return `${year}-${String(currentNum + 1).padStart(3, "0")}`
    }

    // Check settings for starting number
    const setting = await prisma.setting.findFirst({
      where: { userId, code: "invoice_starting_number" },
    })
    const startNum = setting?.value ? parseInt(setting.value, 10) : 1
    return `${year}-${String(startNum).padStart(3, "0")}`
  }
)

export type CreateInvoiceData = {
  customerId: string
  invoiceNumber: string
  status?: string
  issuedAt: Date
  dueDate: Date
  currency: string
  subtotal: number
  taxTotal: number
  total: number
  items: unknown
  taxes?: unknown
  fees?: unknown
  paymentReference?: string | null
  poNumber?: string | null
  subject?: string | null
  notes?: string | null
  paymentTerms?: string | null
  invoiceMode?: string | null
  authorRightsData?: unknown
  isVatReversed?: boolean
  deliveryMethod?: string | null
  deliveryStatus?: string | null
  deliverySentAt?: Date | null
  providerReferenceId?: string | null
  providerError?: string | null
  emailCopyStatus?: string | null
  emailCopySentAt?: Date | null
  emailCopyRecipients?: unknown
  emailCopyProvider?: string | null
  deliveryExceptionCode?: string | null
  deliveryExceptionNote?: string | null
  templateData?: unknown
  pdfPath?: string | null
}

export const createInvoice = async (
  userId: string,
  data: CreateInvoiceData
): Promise<Invoice> => {
  // Snapshot customer data onto the invoice at issue time so the invoice
  // remains a self-contained legal record even if the customer is later
  // archived or its fields are edited.
  const customerSnapshot = await prisma.customer.findFirst({
    where: { id: data.customerId, userId },
    select: {
      name: true,
      email: true,
      contactPerson: true,
      street: true,
      houseNumber: true,
      bus: true,
      zipCode: true,
      city: true,
      country: true,
      vatNumber: true,
      peppolId: true,
    },
  })

  return prisma.invoice.create({
    data: {
      ...data,
      customerName: customerSnapshot?.name ?? null,
      customerEmail: customerSnapshot?.email ?? null,
      customerContactPerson: customerSnapshot?.contactPerson ?? null,
      customerStreet: customerSnapshot?.street ?? null,
      customerHouseNumber: customerSnapshot?.houseNumber ?? null,
      customerBus: customerSnapshot?.bus ?? null,
      customerZipCode: customerSnapshot?.zipCode ?? null,
      customerCity: customerSnapshot?.city ?? null,
      customerCountry: customerSnapshot?.country ?? null,
      customerVatNumber: customerSnapshot?.vatNumber ?? null,
      customerPeppolId: customerSnapshot?.peppolId ?? null,
      items: data.items as Prisma.InputJsonValue,
      taxes: data.taxes as Prisma.InputJsonValue,
      fees: data.fees as Prisma.InputJsonValue,
      templateData: data.templateData as Prisma.InputJsonValue,
      invoiceMode: data.invoiceMode ?? "standard",
      authorRightsData: data.authorRightsData as Prisma.InputJsonValue | undefined,
      deliveryMethod: normalizeInvoiceDeliveryMethod(data.deliveryMethod) ?? "email_pdf",
      deliveryStatus: normalizeInvoiceDeliveryStatus(data.deliveryStatus),
      deliverySentAt: data.deliverySentAt,
      providerReferenceId: data.providerReferenceId,
      providerError: data.providerError,
      emailCopyStatus: normalizeEmailCopyStatus(data.emailCopyStatus),
      emailCopySentAt: data.emailCopySentAt,
      emailCopyRecipients: data.emailCopyRecipients as Prisma.InputJsonValue | undefined,
      emailCopyProvider: data.emailCopyProvider,
      deliveryExceptionCode: data.deliveryExceptionCode,
      deliveryExceptionNote: data.deliveryExceptionNote,
      userId,
    },
    include: { customer: true },
  })
}

export const updateInvoice = async (
  id: string,
  userId: string,
  data: Partial<CreateInvoiceData>
): Promise<Invoice> => {
  const {
    items,
    taxes,
    fees,
    templateData,
    invoiceMode,
    authorRightsData,
    deliveryMethod,
    deliveryStatus,
    deliverySentAt,
    providerReferenceId,
    providerError,
    emailCopyStatus,
    emailCopySentAt,
    emailCopyRecipients,
    emailCopyProvider,
    deliveryExceptionCode,
    deliveryExceptionNote,
    ...rest
  } = data
  const updateData: Prisma.InvoiceUpdateInput = { ...rest }
  if (items !== undefined) updateData.items = items as Prisma.InputJsonValue
  if (taxes !== undefined) updateData.taxes = taxes as Prisma.InputJsonValue
  if (fees !== undefined) updateData.fees = fees as Prisma.InputJsonValue
  if (templateData !== undefined)
    updateData.templateData = templateData as Prisma.InputJsonValue
  if (invoiceMode !== undefined) updateData.invoiceMode = invoiceMode ?? "standard"
  if (authorRightsData !== undefined) {
    updateData.authorRightsData = authorRightsData as Prisma.InputJsonValue
  }
  if (deliveryMethod !== undefined) {
    updateData.deliveryMethod = normalizeInvoiceDeliveryMethod(deliveryMethod) ?? "email_pdf"
  }
  if (deliveryStatus !== undefined) {
    updateData.deliveryStatus = normalizeInvoiceDeliveryStatus(deliveryStatus)
  }
  if (deliverySentAt !== undefined) {
    updateData.deliverySentAt = deliverySentAt
  }
  if (providerReferenceId !== undefined) {
    updateData.providerReferenceId = providerReferenceId
  }
  if (providerError !== undefined) {
    updateData.providerError = providerError
  }
  if (emailCopyStatus !== undefined) {
    updateData.emailCopyStatus = normalizeEmailCopyStatus(emailCopyStatus)
  }
  if (emailCopySentAt !== undefined) {
    updateData.emailCopySentAt = emailCopySentAt
  }
  if (emailCopyRecipients !== undefined) {
    updateData.emailCopyRecipients = emailCopyRecipients as Prisma.InputJsonValue
  }
  if (emailCopyProvider !== undefined) {
    updateData.emailCopyProvider = emailCopyProvider
  }
  if (deliveryExceptionCode !== undefined) {
    updateData.deliveryExceptionCode = deliveryExceptionCode
  }
  if (deliveryExceptionNote !== undefined) {
    updateData.deliveryExceptionNote = deliveryExceptionNote
  }

  // While the invoice is still a draft, refresh the customer snapshot from
  // the current customer row so edits to the customer flow through. Once the
  // invoice leaves draft state the snapshot is frozen for legal integrity.
  const existing = await prisma.invoice.findFirst({
    where: { id, userId },
    select: { status: true, customerId: true },
  })
  if (existing && existing.status === "draft") {
    const targetCustomerId = (rest as { customerId?: string }).customerId ?? existing.customerId
    const snap = await prisma.customer.findFirst({
      where: { id: targetCustomerId, userId },
      select: {
        name: true,
        email: true,
        contactPerson: true,
        street: true,
        houseNumber: true,
        bus: true,
        zipCode: true,
        city: true,
        country: true,
        vatNumber: true,
        peppolId: true,
      },
    })
    if (snap) {
      updateData.customerName = snap.name
      updateData.customerEmail = snap.email
      updateData.customerContactPerson = snap.contactPerson
      updateData.customerStreet = snap.street
      updateData.customerHouseNumber = snap.houseNumber
      updateData.customerBus = snap.bus
      updateData.customerZipCode = snap.zipCode
      updateData.customerCity = snap.city
      updateData.customerCountry = snap.country
      updateData.customerVatNumber = snap.vatNumber
      updateData.customerPeppolId = snap.peppolId
    }
  }

  return prisma.invoice.update({
    where: { id, userId },
    data: updateData,
    include: { customer: true },
  })
}

export const updateInvoiceStatus = async (
  id: string,
  userId: string,
  status: string,
  extra?: { paidAt?: Date; transactionId?: string }
): Promise<Invoice> => {
  return prisma.invoice.update({
    where: { id, userId },
    data: {
      status,
      paidAt: extra?.paidAt,
      transactionId: extra?.transactionId,
    },
  })
}

export const deleteInvoice = async (
  id: string,
  userId: string
): Promise<Invoice> => {
  return prisma.invoice.delete({
    where: { id, userId },
  })
}

export const getInvoiceCountByCustomer = cache(
  async (customerId: string): Promise<number> => {
    return prisma.invoice.count({ where: { customerId } })
  }
)

export const getOutstandingInvoices = cache(async (userId: string): Promise<InvoiceWithCustomer[]> => {
  return prisma.invoice.findMany({
    where: {
      userId,
      status: { in: ["sent", "overdue", "partially_paid"] },
    },
    include: { customer: true, payments: true, transaction: true },
    orderBy: { dueDate: "asc" },
  })
})
