import { prisma } from "@/lib/db"
import { Field, Prisma, Transaction } from "@/prisma/client"
import { cache } from "react"
import { getFields } from "./fields"
import { deleteFile } from "./files"

export type TransactionData = {
  name?: string | null
  description?: string | null
  merchant?: string | null
  total?: number | null
  currencyCode?: string | null
  convertedTotal?: number | null
  convertedCurrencyCode?: string | null
  type?: string | null
  items?: TransactionData[] | undefined
  note?: string | null
  files?: string[] | undefined
  extra?: Record<string, unknown>
  categoryCode?: string | null
  projectCode?: string | null
  issuedAt?: Date | string | null
  text?: string | null
  customerId?: string | null
  status?: string | null
  dueDate?: Date | string | null
  linkedExpenseId?: string | null
  taxAmount?: number | null
  [key: string]: unknown
}

export type TransactionFilters = {
  search?: string
  dateFrom?: string
  dateTo?: string
  ordering?: string
  categoryCode?: string
  projectCode?: string
  type?: string
  page?: number
}

export type TransactionPagination = {
  limit: number
  offset: number
}

export type ExpenseWithRelations = Prisma.TransactionGetPayload<{
  include: { category: true; project: true }
}>

const STANDARD_TRANSACTION_KEYS = new Set([
  "name",
  "description",
  "merchant",
  "total",
  "currencyCode",
  "convertedTotal",
  "convertedCurrencyCode",
  "type",
  "note",
  "files",
  "categoryCode",
  "projectCode",
  "issuedAt",
  "text",
  "customerId",
  "status",
  "dueDate",
  "linkedExpenseId",
  "taxAmount",
])

export const getTransactions = cache(
  async (
    userId: string,
    filters?: TransactionFilters,
    pagination?: TransactionPagination
  ): Promise<{
    transactions: Transaction[]
    total: number
  }> => {
    const where: Prisma.TransactionWhereInput = { userId }
    let orderBy: Prisma.TransactionOrderByWithRelationInput = { issuedAt: "desc" }

    if (filters) {
      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: "insensitive" } },
          { merchant: { contains: filters.search, mode: "insensitive" } },
          { description: { contains: filters.search, mode: "insensitive" } },
          { note: { contains: filters.search, mode: "insensitive" } },
          { text: { contains: filters.search, mode: "insensitive" } },
        ]
      }

      if (filters.dateFrom || filters.dateTo) {
        where.issuedAt = {
          gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
          lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
        }
      }

      if (filters.categoryCode) {
        where.categoryCode = filters.categoryCode
      }

      if (filters.projectCode) {
        where.projectCode = filters.projectCode
      }

      if (filters.type) {
        where.type = filters.type
      }

      if (filters.ordering) {
        const isDesc = filters.ordering.startsWith("-")
        const field = isDesc ? filters.ordering.slice(1) : filters.ordering
        orderBy = { [field]: isDesc ? "desc" : "asc" }
      }
    }

    if (pagination) {
      const total = await prisma.transaction.count({ where })
      const transactions = await prisma.transaction.findMany({
        where,
        include: {
          category: true,
          project: true,
        },
        orderBy,
        take: pagination?.limit,
        skip: pagination?.offset,
      })
      return { transactions, total }
    } else {
      const transactions = await prisma.transaction.findMany({
        where,
        include: {
          category: true,
          project: true,
        },
        orderBy,
      })
      return { transactions, total: transactions.length }
    }
  }
)

export const getExpenses = async (
  userId: string,
  filters?: { status?: string; search?: string; dateFrom?: string; dateTo?: string }
): Promise<ExpenseWithRelations[]> => {
  // Auto-detect overdue: same pattern as getInvoices
  const now = new Date()
  await prisma.transaction.updateMany({
    where: {
      userId,
      type: "expense",
      status: { in: ["unpaid", "to_pay"] },
      dueDate: { lt: now },
    },
    data: { status: "overdue" },
  })

  const where: Prisma.TransactionWhereInput = { userId, type: "expense" }

  if (filters?.status && filters.status !== "all") {
    where.status = filters.status
  }
  if (filters?.search) {
    where.OR = [
      { merchant: { contains: filters.search, mode: "insensitive" } },
      { name: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
    ]
  }
  if (filters?.dateFrom || filters?.dateTo) {
    where.issuedAt = {
      gte: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
      lte: filters?.dateTo ? new Date(filters.dateTo) : undefined,
    }
  }

  return prisma.transaction.findMany({
    where,
    include: { category: true, project: true },
    orderBy: { issuedAt: "desc" },
  })
}

export const updateExpenseStatus = async (
  id: string,
  userId: string,
  status: "unpaid" | "to_pay" | "paid"
): Promise<Transaction> => {
  return prisma.transaction.update({
    where: { id, userId },
    data: { status },
  })
}

export const getTransactionById = cache(async (id: string, userId: string): Promise<ExpenseWithRelations | null> => {
  return await prisma.transaction.findUnique({
    where: { id, userId },
    include: {
      category: true,
      project: true,
    },
  })
})

export const getTransactionsByFileId = cache(async (fileId: string, userId: string): Promise<Transaction[]> => {
  return await prisma.transaction.findMany({
    where: { files: { array_contains: [fileId] }, userId },
  })
})

export const createTransaction = async (userId: string, data: TransactionData): Promise<Transaction> => {
  const { standard, extra } = await splitTransactionDataExtraFields(data, userId)

  return await prisma.transaction.create({
    data: {
      ...standard,
      extra: extra,
      items: data.items as Prisma.InputJsonValue,
      userId,
    },
  })
}

export const updateTransaction = async (id: string, userId: string, data: TransactionData): Promise<Transaction> => {
  const { standard, extra } = await splitTransactionDataExtraFields(data, userId)
  const existing = await prisma.transaction.findUnique({
    where: { id, userId },
    select: { extra: true },
  })
  const existingExtra = ((existing?.extra as Record<string, unknown> | null) ?? {})
  const nextExtra = {
    ...existingExtra,
    ...((extra as Record<string, unknown> | null) ?? {}),
  }
  const updateData = {
    ...(standard as Prisma.TransactionUpdateInput),
    extra: nextExtra as Prisma.InputJsonValue,
  } as Prisma.TransactionUpdateInput

  if ("items" in data) {
    updateData.items = data.items ? (data.items as Prisma.InputJsonValue) : []
  }

  return await prisma.transaction.update({
    where: { id, userId },
    data: updateData,
  })
}

export const updateTransactionFiles = async (id: string, userId: string, files: string[]): Promise<Transaction> => {
  return await prisma.transaction.update({
    where: { id, userId },
    data: { files },
  })
}

export const deleteTransaction = async (id: string, userId: string): Promise<Transaction | undefined> => {
  const transaction = await getTransactionById(id, userId)

  if (transaction) {
    const files = Array.isArray(transaction.files) ? transaction.files : []

    for (const fileId of files as string[]) {
      if ((await getTransactionsByFileId(fileId, userId)).length <= 1) {
        await deleteFile(fileId, userId)
      }
    }

    return await prisma.transaction.delete({
      where: { id, userId },
    })
  }
}

export const bulkDeleteTransactions = async (ids: string[], userId: string) => {
  return await prisma.transaction.deleteMany({
    where: { id: { in: ids }, userId },
  })
}

const splitTransactionDataExtraFields = async (
  data: TransactionData,
  userId: string
): Promise<{ standard: TransactionData; extra: Prisma.InputJsonValue }> => {
  const fields = await getFields(userId)
  const fieldMap = fields.reduce(
    (acc, field) => {
      acc[field.code] = field
      return acc
    },
    {} as Record<string, Field>
  )

  const standard: TransactionData = {}
  const extra: Record<string, unknown> = {}

  Object.entries(data).forEach(([key, value]) => {
    const fieldDef = fieldMap[key]
    if (fieldDef) {
      if (fieldDef.isExtra) {
        extra[key] = value
      } else {
        standard[key] = value
      }
    } else if (STANDARD_TRANSACTION_KEYS.has(key)) {
      standard[key] = value
    }
  })

  return { standard, extra: extra as Prisma.InputJsonValue }
}
