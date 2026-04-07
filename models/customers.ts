import { prisma } from "@/lib/db"
import { normalizeCustomerInvoiceDeliveryMethod } from "@/lib/invoice-delivery"
import { Customer, Prisma } from "@/prisma/client"
import { cache } from "react"

export type CustomerData = {
  name?: string | null
  email?: string | null
  billingEmails?: string[] | null
  phone?: string | null
  website?: string | null
  contactPerson?: string | null
  street?: string | null
  houseNumber?: string | null
  bus?: string | null
  zipCode?: string | null
  city?: string | null
  country?: string | null
  vatNumber?: string | null
  peppolId?: string | null
  peppolVerified?: boolean | null
  peppolVerifiedAt?: Date | null
  recommandDirectorySource?: string | null
  invoiceDeliveryMethod?: string | null
  defaultRate?: number | null
  defaultCurrency?: string | null
  note?: string | null
}

export const getCustomers = cache(
  async (userId: string, search?: string): Promise<Customer[]> => {
    const where: Prisma.CustomerWhereInput = { userId }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { contactPerson: { contains: search, mode: "insensitive" } },
        { vatNumber: { contains: search, mode: "insensitive" } },
        { peppolId: { contains: search, mode: "insensitive" } },
      ]
    }

    return prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
    })
  }
)

export type CustomerWithInvoiceStats = Customer & {
  lastInvoiceAt: Date | null
  openInvoicesCount: number
  overdueInvoicesCount: number
  openBalanceByCurrency: Record<string, number>
  totalInvoicesCount: number
}

const OPEN_INVOICE_STATUSES = ["sent", "overdue", "partially_paid"] as const

export const getCustomersWithInvoiceStats = cache(
  async (userId: string): Promise<CustomerWithInvoiceStats[]> => {
    const customers = await prisma.customer.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      include: {
        invoices: {
          select: {
            status: true,
            total: true,
            paidAmount: true,
            currency: true,
            issuedAt: true,
          },
        },
      },
    })

    return customers.map((customer) => {
      const invoices = customer.invoices
      const lastInvoiceAt = invoices.reduce<Date | null>(
        (latest, invoice) => {
          if (!latest) return invoice.issuedAt
          return invoice.issuedAt > latest ? invoice.issuedAt : latest
        },
        null
      )

      const openInvoices = invoices.filter((invoice) =>
        OPEN_INVOICE_STATUSES.includes(invoice.status as (typeof OPEN_INVOICE_STATUSES)[number])
      )
      const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue")

      const openBalanceByCurrency: Record<string, number> = {}
      for (const invoice of openInvoices) {
        const remaining = Math.max(invoice.total - (invoice.paidAmount ?? 0), 0)
        if (remaining <= 0) continue
        const currency = invoice.currency || "EUR"
        openBalanceByCurrency[currency] = (openBalanceByCurrency[currency] || 0) + remaining
      }

      return {
        ...customer,
        lastInvoiceAt,
        openInvoicesCount: openInvoices.length,
        overdueInvoicesCount: overdueInvoices.length,
        openBalanceByCurrency,
        totalInvoicesCount: invoices.length,
      }
    })
  }
)

export const getCustomerById = cache(
  async (id: string, userId: string): Promise<Customer | null> => {
    return prisma.customer.findFirst({
      where: { id, userId },
    })
  }
)

export const createCustomer = async (
  userId: string,
  data: CustomerData
): Promise<Customer> => {
  return prisma.customer.create({
    data: {
      ...data,
      name: data.name ?? "",
      billingEmails: data.billingEmails ?? [],
      invoiceDeliveryMethod: normalizeCustomerInvoiceDeliveryMethod(data.invoiceDeliveryMethod),
      userId,
    },
  })
}

export const updateCustomer = async (
  id: string,
  userId: string,
  data: CustomerData
): Promise<Customer> => {
  return prisma.customer.update({
    where: { id, userId },
    data: {
      ...data,
      name: data.name ?? "",
      billingEmails: data.billingEmails ?? [],
      invoiceDeliveryMethod: normalizeCustomerInvoiceDeliveryMethod(data.invoiceDeliveryMethod),
    },
  })
}

export const getInvoicesByCustomer = cache(
  async (customerId: string, userId: string) => {
    return prisma.invoice.findMany({
      where: { customerId, userId },
      orderBy: { issuedAt: "desc" },
      take: 50,
    })
  }
)

export const deleteCustomer = async (
  id: string,
  userId: string
): Promise<Customer> => {
  return prisma.customer.delete({
    where: { id, userId },
  })
}

export const getCustomerStats = cache(async (userId: string) => {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const customers = await prisma.customer.findMany({
    where: { userId },
    include: {
      invoices: {
        select: { id: true, total: true, status: true, issuedAt: true },
      },
    },
  })

  const newCustomers = customers.filter((c) => c.createdAt >= thirtyDaysAgo).length
  const noInvoiceCustomersCount = customers.filter((c) => c.invoices.length === 0).length

  let openInvoicesCount = 0
  let overdueInvoicesCount = 0

  for (const customer of customers) {
    for (const invoice of customer.invoices) {
      if (OPEN_INVOICE_STATUSES.includes(invoice.status as (typeof OPEN_INVOICE_STATUSES)[number])) {
        openInvoicesCount += 1
      }
      if (invoice.status === "overdue") {
        overdueInvoicesCount += 1
      }
    }
  }

  return { openInvoicesCount, overdueInvoicesCount, noInvoiceCustomersCount, newCustomers }
})
