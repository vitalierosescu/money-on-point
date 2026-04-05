import { prisma } from "@/lib/db"
import { Invoice, Prisma } from "@/prisma/client"
import { cache } from "react"

export type InvoiceWithCustomer = Prisma.InvoiceGetPayload<{
  include: { customer: true; payments: true }
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
    include: { customer: true, payments: true },
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
  isVatReversed?: boolean
  templateData?: unknown
  pdfPath?: string | null
}

export const createInvoice = async (
  userId: string,
  data: CreateInvoiceData
): Promise<Invoice> => {
  return prisma.invoice.create({
    data: {
      ...data,
      items: data.items as Prisma.InputJsonValue,
      taxes: data.taxes as Prisma.InputJsonValue,
      fees: data.fees as Prisma.InputJsonValue,
      templateData: data.templateData as Prisma.InputJsonValue,
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
  const { items, taxes, fees, templateData, ...rest } = data
  const updateData: Prisma.InvoiceUpdateInput = { ...rest }
  if (items !== undefined) updateData.items = items as Prisma.InputJsonValue
  if (taxes !== undefined) updateData.taxes = taxes as Prisma.InputJsonValue
  if (fees !== undefined) updateData.fees = fees as Prisma.InputJsonValue
  if (templateData !== undefined)
    updateData.templateData = templateData as Prisma.InputJsonValue

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
    include: { customer: true, payments: true },
    orderBy: { dueDate: "asc" },
  })
})
