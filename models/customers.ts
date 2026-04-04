import { prisma } from "@/lib/db"
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
      ]
    }

    return prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
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
    where: { id },
    data: {
      ...data,
      name: data.name ?? "",
      billingEmails: data.billingEmails ?? [],
    },
  })
}

export const deleteCustomer = async (
  id: string,
  userId: string
): Promise<Customer> => {
  return prisma.customer.delete({
    where: { id },
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

  const newCustomers = customers.filter(
    (c) => c.createdAt >= thirtyDaysAgo
  ).length

  const activeCustomers = customers.filter((c) =>
    c.invoices.some((inv) => inv.issuedAt >= thirtyDaysAgo)
  )

  const mostActive = activeCustomers.sort(
    (a, b) =>
      b.invoices.filter((i) => i.issuedAt >= thirtyDaysAgo).length -
      a.invoices.filter((i) => i.issuedAt >= thirtyDaysAgo).length
  )[0]

  const topRevenue = customers.sort(
    (a, b) =>
      b.invoices
        .filter((i) => i.issuedAt >= thirtyDaysAgo && i.status === "paid")
        .reduce((sum, i) => sum + i.total, 0) -
      a.invoices
        .filter((i) => i.issuedAt >= thirtyDaysAgo && i.status === "paid")
        .reduce((sum, i) => sum + i.total, 0)
  )[0]

  const inactiveCount = customers.filter(
    (c) => !c.invoices.some((inv) => inv.issuedAt >= thirtyDaysAgo)
  ).length

  return { mostActive, topRevenue, inactiveCount, newCustomers }
})
