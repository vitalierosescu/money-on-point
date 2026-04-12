import { prisma } from "@/lib/db"
import { calcTotalPerCurrency } from "@/lib/stats"
import { Prisma } from "@/prisma/client"
import { cache } from "react"
import { TransactionFilters } from "./transactions"

export type DashboardStats = {
  totalIncomePerCurrency: Record<string, number>
  totalExpensesPerCurrency: Record<string, number>
  profitPerCurrency: Record<string, number>
  invoicesProcessed: number
}

const EXCLUDED_INVOICE_STATUSES = ["draft", "cancelled"]

function getDateFilter(filters: TransactionFilters) {
  return filters.dateFrom || filters.dateTo
    ? {
        gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
      }
    : undefined
}

function calcInvoiceTotalPerCurrency(
  invoices: Array<{
    currency: string
    total: number
  }>
): Record<string, number> {
  return invoices.reduce(
    (acc, invoice) => {
      const currency = invoice.currency.toUpperCase()
      acc[currency] = (acc[currency] ?? 0) + invoice.total
      return acc
    },
    {} as Record<string, number>
  )
}

function getPeriodKey(date: Date, groupByDay: boolean) {
  return groupByDay
    ? date.toISOString().split("T")[0]
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function getTransactionAmountInCurrency(
  transaction: {
    convertedCurrencyCode?: string | null
    convertedTotal?: number | null
    currencyCode?: string | null
    total?: number | null
  },
  defaultCurrency: string
) {
  return transaction.convertedCurrencyCode?.toUpperCase() === defaultCurrency.toUpperCase()
    ? transaction.convertedTotal || 0
    : transaction.currencyCode?.toUpperCase() === defaultCurrency.toUpperCase()
      ? transaction.total || 0
      : 0
}

function getInvoiceAmountInCurrency(
  invoice: {
    currency: string
    total: number
  },
  defaultCurrency: string
) {
  return invoice.currency.toUpperCase() === defaultCurrency.toUpperCase() ? invoice.total : 0
}

export const getDashboardStats = cache(
  async (userId: string, filters: TransactionFilters = {}): Promise<DashboardStats> => {
    const dateFilter = getDateFilter(filters)

    const [bookedInvoices, paidExpenses] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          userId,
          status: { notIn: EXCLUDED_INVOICE_STATUSES },
          ...(dateFilter ? { issuedAt: dateFilter } : {}),
        },
        select: {
          currency: true,
          total: true,
        },
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          type: "expense",
          status: "paid",
          ...(dateFilter ? { issuedAt: dateFilter } : {}),
        },
      }),
    ])

    const totalIncomePerCurrency = calcInvoiceTotalPerCurrency(bookedInvoices)
    const totalExpensesPerCurrency = calcTotalPerCurrency(paidExpenses)

    const allCurrencies = new Set([...Object.keys(totalIncomePerCurrency), ...Object.keys(totalExpensesPerCurrency)])
    const profitPerCurrency = Object.fromEntries(
      Array.from(allCurrencies).map((currency) => [
        currency,
        (totalIncomePerCurrency[currency] ?? 0) - (totalExpensesPerCurrency[currency] ?? 0),
      ])
    )

    return {
      totalIncomePerCurrency,
      totalExpensesPerCurrency,
      profitPerCurrency,
      invoicesProcessed: bookedInvoices.length,
    }
  }
)

export type ProjectStats = {
  totalIncomePerCurrency: Record<string, number>
  totalExpensesPerCurrency: Record<string, number>
  profitPerCurrency: Record<string, number>
  invoicesProcessed: number
}

export const getProjectStats = cache(async (userId: string, projectId: string, filters: TransactionFilters = {}) => {
  const where: Prisma.TransactionWhereInput = {
    projectCode: projectId,
  }

  if (filters.dateFrom || filters.dateTo) {
    where.issuedAt = {
      gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
      lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
    }
  }

  const transactions = await prisma.transaction.findMany({ where: { ...where, userId } })
  const incomeTransactions = transactions.filter((t) => t.type === "income")
  const expenseTransactions = transactions.filter((t) => t.type === "expense")
  const totalIncomePerCurrency = calcTotalPerCurrency(incomeTransactions)
  const totalExpensesPerCurrency = calcTotalPerCurrency(expenseTransactions)
  const allCurrencies = new Set([...Object.keys(totalIncomePerCurrency), ...Object.keys(totalExpensesPerCurrency)])
  const profitPerCurrency = Object.fromEntries(
    Array.from(allCurrencies).map((currency) => [
      currency,
      (totalIncomePerCurrency[currency] ?? 0) - (totalExpensesPerCurrency[currency] ?? 0),
    ])
  )

  const invoicesProcessed = incomeTransactions.length
  return {
    totalIncomePerCurrency,
    totalExpensesPerCurrency,
    profitPerCurrency,
    invoicesProcessed,
  }
})

export type TimeSeriesData = {
  period: string
  income: number
  expenses: number
  date: Date
}

export type CategoryBreakdown = {
  code: string
  name: string
  color: string
  income: number
  expenses: number
  transactionCount: number
}

export type DetailedTimeSeriesData = {
  period: string
  income: number
  expenses: number
  date: Date
  categories: CategoryBreakdown[]
  totalTransactions: number
}

export const getTimeSeriesStats = cache(
  async (
    userId: string,
    filters: TransactionFilters = {},
    defaultCurrency: string = "EUR"
  ): Promise<TimeSeriesData[]> => {
    const dateFilter = getDateFilter(filters)
    const includeIncome = !filters.type || filters.type === "income"
    const includeExpenses = !filters.type || filters.type === "expense"
    const includeInvoices = includeIncome && !filters.projectCode && (!filters.categoryCode || filters.categoryCode === "invoice")

    const expenseWhere: Prisma.TransactionWhereInput = {
      userId,
      type: "expense",
    }

    if (dateFilter) {
      expenseWhere.issuedAt = dateFilter
    }

    if (filters.categoryCode) {
      expenseWhere.categoryCode = filters.categoryCode
    }

    if (filters.projectCode) {
      expenseWhere.projectCode = filters.projectCode
    }

    const [expenses, invoices] = await Promise.all([
      includeExpenses
        ? prisma.transaction.findMany({
            where: expenseWhere,
            orderBy: { issuedAt: "asc" },
          })
        : Promise.resolve([]),
      includeInvoices
        ? prisma.invoice.findMany({
            where: {
              userId,
              status: { notIn: EXCLUDED_INVOICE_STATUSES },
              ...(dateFilter ? { issuedAt: dateFilter } : {}),
            },
            select: {
              issuedAt: true,
              currency: true,
              total: true,
            },
            orderBy: { issuedAt: "asc" },
          })
        : Promise.resolve([]),
    ])

    const timelineDates = [
      ...expenses.map((expense) => expense.issuedAt).filter((date): date is Date => Boolean(date)),
      ...invoices.map((invoice) => invoice.issuedAt),
    ].sort((a, b) => a.getTime() - b.getTime())

    if (timelineDates.length === 0) {
      return []
    }

    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : timelineDates[0]
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : timelineDates[timelineDates.length - 1]
    const daysDiff = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24))
    const groupByDay = daysDiff <= 50

    const grouped: Record<string, TimeSeriesData> = {}

    for (const expense of expenses) {
      if (!expense.issuedAt) continue

      const date = new Date(expense.issuedAt)
      const period = getPeriodKey(date, groupByDay)
      if (!grouped[period]) {
        grouped[period] = { period, income: 0, expenses: 0, date }
      }
      grouped[period].expenses += getTransactionAmountInCurrency(expense, defaultCurrency)
    }

    for (const invoice of invoices) {
      const date = new Date(invoice.issuedAt)
      const period = getPeriodKey(date, groupByDay)
      if (!grouped[period]) {
        grouped[period] = { period, income: 0, expenses: 0, date }
      }
      grouped[period].income += getInvoiceAmountInCurrency(invoice, defaultCurrency)
    }

    return Object.values(grouped).sort((a, b) => a.date.getTime() - b.date.getTime())
  }
)

export const getDetailedTimeSeriesStats = cache(
  async (
    userId: string,
    filters: TransactionFilters = {},
    defaultCurrency: string = "EUR"
  ): Promise<DetailedTimeSeriesData[]> => {
    const dateFilter = getDateFilter(filters)
    const includeIncome = !filters.type || filters.type === "income"
    const includeExpenses = !filters.type || filters.type === "expense"
    const includeInvoices = includeIncome && !filters.projectCode && (!filters.categoryCode || filters.categoryCode === "invoice")

    const expenseWhere: Prisma.TransactionWhereInput = {
      userId,
      type: "expense",
    }

    if (dateFilter) {
      expenseWhere.issuedAt = dateFilter
    }

    if (filters.categoryCode) {
      expenseWhere.categoryCode = filters.categoryCode
    }

    if (filters.projectCode) {
      expenseWhere.projectCode = filters.projectCode
    }

    const [expenses, invoices, categories] = await Promise.all([
      includeExpenses
        ? prisma.transaction.findMany({
            where: expenseWhere,
            include: {
              category: true,
            },
            orderBy: { issuedAt: "asc" },
          })
        : Promise.resolve([]),
      includeInvoices
        ? prisma.invoice.findMany({
            where: {
              userId,
              status: { notIn: EXCLUDED_INVOICE_STATUSES },
              ...(dateFilter ? { issuedAt: dateFilter } : {}),
            },
            select: {
              issuedAt: true,
              currency: true,
              total: true,
            },
            orderBy: { issuedAt: "asc" },
          })
        : Promise.resolve([]),
      prisma.category.findMany({
        where: { userId },
        orderBy: { name: "asc" },
      }),
    ])

    const timelineDates = [
      ...expenses.map((expense) => expense.issuedAt).filter((date): date is Date => Boolean(date)),
      ...invoices.map((invoice) => invoice.issuedAt),
    ].sort((a, b) => a.getTime() - b.getTime())

    if (timelineDates.length === 0) {
      return []
    }

    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : timelineDates[0]
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : timelineDates[timelineDates.length - 1]
    const daysDiff = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24))
    const groupByDay = daysDiff <= 50

    const categoryLookup = new Map(categories.map((cat) => [cat.code, cat]))
    const invoiceCategory = categoryLookup.get("invoice") || {
      code: "invoice",
      name: "Invoice",
      color: "#22c55e",
    }

    const grouped = {} as Record<
      string,
      {
        period: string
        income: number
        expenses: number
        date: Date
        categories: Map<string, CategoryBreakdown>
        totalTransactions: number
      }
    >

    for (const expense of expenses) {
      if (!expense.issuedAt) continue

      const date = new Date(expense.issuedAt)
      const period = getPeriodKey(date, groupByDay)

      if (!grouped[period]) {
        grouped[period] = {
          period,
          income: 0,
          expenses: 0,
          date,
          categories: new Map<string, CategoryBreakdown>(),
          totalTransactions: 0,
        }
      }

      const amount = getTransactionAmountInCurrency(expense, defaultCurrency)
      const categoryCode = expense.categoryCode || "other"
      const category = categoryLookup.get(categoryCode) || {
        code: "other",
        name: "Other",
        color: "#6b7280",
      }

      if (!grouped[period].categories.has(categoryCode)) {
        grouped[period].categories.set(categoryCode, {
          code: category.code,
          name: category.name,
          color: category.color || "#6b7280",
          income: 0,
          expenses: 0,
          transactionCount: 0,
        })
      }

      const categoryData = grouped[period].categories.get(categoryCode)!
      categoryData.transactionCount++
      categoryData.expenses += amount
      grouped[period].expenses += amount
      grouped[period].totalTransactions++
    }

    for (const invoice of invoices) {
      const date = new Date(invoice.issuedAt)
      const period = getPeriodKey(date, groupByDay)

      if (!grouped[period]) {
        grouped[period] = {
          period,
          income: 0,
          expenses: 0,
          date,
          categories: new Map<string, CategoryBreakdown>(),
          totalTransactions: 0,
        }
      }

      const amount = getInvoiceAmountInCurrency(invoice, defaultCurrency)
      if (!grouped[period].categories.has(invoiceCategory.code)) {
        grouped[period].categories.set(invoiceCategory.code, {
          code: invoiceCategory.code,
          name: invoiceCategory.name,
          color: invoiceCategory.color || "#22c55e",
          income: 0,
          expenses: 0,
          transactionCount: 0,
        })
      }

      const categoryData = grouped[period].categories.get(invoiceCategory.code)!
      categoryData.transactionCount++
      categoryData.income += amount
      grouped[period].income += amount
      grouped[period].totalTransactions++
    }

    return Object.values(grouped)
      .map((item) => ({
        ...item,
        categories: Array.from(item.categories.values()).filter((cat) => cat.income > 0 || cat.expenses > 0),
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
  }
)

export type MonthlyRevenueData = {
  month: string       // "01" to "12"
  label: string       // "jan", "feb", etc. (nl-BE short month name)
  revenue: number     // invoice total in currency units (after /100)
  subtotal: number    // excl. VAT
  taxTotal: number    // VAT amount
  count: number       // number of paid invoices in this month
}

export const getMonthlyRevenue = cache(async (userId: string, year: number): Promise<MonthlyRevenueData[]> => {
  const invoices = await prisma.invoice.findMany({
    where: {
      userId,
      status: "paid",
      paidAt: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    },
    select: { total: true, subtotal: true, taxTotal: true, paidAt: true },
  })

  const months: Record<string, { revenue: number; subtotal: number; taxTotal: number; count: number }> = {}
  for (let m = 1; m <= 12; m++) {
    months[String(m).padStart(2, "0")] = { revenue: 0, subtotal: 0, taxTotal: 0, count: 0 }
  }

  for (const inv of invoices) {
    if (!inv.paidAt) continue
    const month = String(new Date(inv.paidAt).getMonth() + 1).padStart(2, "0")
    months[month].revenue += inv.total
    months[month].subtotal += inv.subtotal ?? 0
    months[month].taxTotal += inv.taxTotal ?? 0
    months[month].count++
  }

  return Object.entries(months).map(([month, data]) => ({
    month,
    label: new Intl.DateTimeFormat("nl-BE", { month: "short" }).format(new Date(`${year}-${month}-01`)),
    revenue: data.revenue / 100,
    subtotal: data.subtotal / 100,
    taxTotal: data.taxTotal / 100,
    count: data.count,
  }))
})

export type VatQuarterData = {
  quarter: string          // "Q1" | "Q2" | "Q3" | "Q4"
  invoiceSubtotal: number  // revenue excl. VAT (from paid invoices)
  vatCollected: number     // VAT billed to customers
  vatPaid: number          // VAT on expenses (deductible input VAT)
  netVat: number           // vatCollected - vatPaid
}

export const getVatSummary = cache(async (userId: string, year: number): Promise<VatQuarterData[]> => {
  const [invoices, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        userId,
        status: "paid",
        paidAt: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${year + 1}-01-01`),
        },
      },
      select: { subtotal: true, taxTotal: true, paidAt: true },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        type: "expense",
        status: "paid",
        issuedAt: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${year + 1}-01-01`),
        },
      },
      select: { taxAmount: true, issuedAt: true },
    }),
  ])

  const quarters: Record<string, { invoiceSubtotal: number; vatCollected: number; vatPaid: number }> = {
    Q1: { invoiceSubtotal: 0, vatCollected: 0, vatPaid: 0 },
    Q2: { invoiceSubtotal: 0, vatCollected: 0, vatPaid: 0 },
    Q3: { invoiceSubtotal: 0, vatCollected: 0, vatPaid: 0 },
    Q4: { invoiceSubtotal: 0, vatCollected: 0, vatPaid: 0 },
  }

  const monthToQuarter = (month: number) =>
    month <= 3 ? "Q1" : month <= 6 ? "Q2" : month <= 9 ? "Q3" : "Q4"

  for (const inv of invoices) {
    if (!inv.paidAt) continue
    const q = monthToQuarter(new Date(inv.paidAt).getMonth() + 1)
    quarters[q].invoiceSubtotal += inv.subtotal ?? 0
    quarters[q].vatCollected += inv.taxTotal ?? 0
  }

  for (const exp of expenses) {
    if (!exp.issuedAt) continue
    const q = monthToQuarter(new Date(exp.issuedAt).getMonth() + 1)
    quarters[q].vatPaid += exp.taxAmount ?? 0
  }

  return Object.entries(quarters).map(([quarter, data]) => ({
    quarter,
    invoiceSubtotal: data.invoiceSubtotal / 100,
    vatCollected: data.vatCollected / 100,
    vatPaid: data.vatPaid / 100,
    netVat: (data.vatCollected - data.vatPaid) / 100,
  }))
})
