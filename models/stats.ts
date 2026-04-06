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

export const getDashboardStats = cache(
  async (userId: string, filters: TransactionFilters = {}): Promise<DashboardStats> => {
    const dateFilter =
      filters.dateFrom || filters.dateTo
        ? {
            gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
            lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
          }
        : undefined

    // Income: from paid Invoice records
    const paidInvoices = await prisma.invoice.findMany({
      where: {
        userId,
        status: "paid",
        ...(dateFilter ? { paidAt: dateFilter } : {}),
      },
      include: {
        transaction: true,
      },
    })

    // Expenses: from paid expense Transactions
    const paidExpenses = await prisma.transaction.findMany({
      where: {
        userId,
        type: "expense",
        status: "paid",
        ...(dateFilter ? { issuedAt: dateFilter } : {}),
      },
    })

    // Build per-currency totals for income, preferring converted values on linked transactions
    const totalIncomePerCurrency: Record<string, number> = {}
    for (const inv of paidInvoices) {
      const convertedCurrency = inv.transaction?.convertedCurrencyCode?.toUpperCase()
      const originalCurrency = inv.currency.toUpperCase()
      const currency = convertedCurrency || originalCurrency
      const amount = convertedCurrency ? (inv.transaction?.convertedTotal ?? 0) : inv.total
      totalIncomePerCurrency[currency] = (totalIncomePerCurrency[currency] ?? 0) + amount
    }

    // Build per-currency totals for expenses, preferring converted values when available
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
      invoicesProcessed: paidInvoices.length,
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
  const totalIncomePerCurrency = calcTotalPerCurrency(transactions.filter((t) => t.type === "income"))
  const totalExpensesPerCurrency = calcTotalPerCurrency(transactions.filter((t) => t.type === "expense"))
  const profitPerCurrency = Object.fromEntries(
    Object.keys(totalIncomePerCurrency).map((currency) => [
      currency,
      totalIncomePerCurrency[currency] - totalExpensesPerCurrency[currency],
    ])
  )

  const invoicesProcessed = transactions.length
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
    const where: Prisma.TransactionWhereInput = { userId }

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

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { issuedAt: "asc" },
    })

    if (transactions.length === 0) {
      return []
    }

    // Determine if we should group by day or month
    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : new Date(transactions[0].issuedAt!)
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : new Date(transactions[transactions.length - 1].issuedAt!)
    const daysDiff = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24))
    const groupByDay = daysDiff <= 50

    // Group transactions by time period
    const grouped = transactions.reduce(
      (acc, transaction) => {
        if (!transaction.issuedAt) return acc

        const date = new Date(transaction.issuedAt)
        const period = groupByDay
          ? date.toISOString().split("T")[0] // YYYY-MM-DD
          : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` // YYYY-MM

        if (!acc[period]) {
          acc[period] = { period, income: 0, expenses: 0, date }
        }

        // Get amount in default currency
        const amount =
          transaction.convertedCurrencyCode?.toUpperCase() === defaultCurrency.toUpperCase()
            ? transaction.convertedTotal || 0
            : transaction.currencyCode?.toUpperCase() === defaultCurrency.toUpperCase()
              ? transaction.total || 0
              : 0 // Skip transactions not in default currency for simplicity

        if (transaction.type === "income") {
          acc[period].income += amount
        } else if (transaction.type === "expense") {
          acc[period].expenses += amount
        }

        return acc
      },
      {} as Record<string, TimeSeriesData>
    )

    return Object.values(grouped).sort((a, b) => a.date.getTime() - b.date.getTime())
  }
)

export const getDetailedTimeSeriesStats = cache(
  async (
    userId: string,
    filters: TransactionFilters = {},
    defaultCurrency: string = "EUR"
  ): Promise<DetailedTimeSeriesData[]> => {
    const where: Prisma.TransactionWhereInput = { userId }

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

    const [transactions, categories] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          category: true,
        },
        orderBy: { issuedAt: "asc" },
      }),
      prisma.category.findMany({
        where: { userId },
        orderBy: { name: "asc" },
      }),
    ])

    if (transactions.length === 0) {
      return []
    }

    // Determine if we should group by day or month
    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : new Date(transactions[0].issuedAt!)
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : new Date(transactions[transactions.length - 1].issuedAt!)
    const daysDiff = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24))
    const groupByDay = daysDiff <= 50

    // Create category lookup
    const categoryLookup = new Map(categories.map((cat) => [cat.code, cat]))

    // Group transactions by time period
    const grouped = transactions.reduce(
      (acc, transaction) => {
        if (!transaction.issuedAt) return acc

        const date = new Date(transaction.issuedAt)
        const period = groupByDay
          ? date.toISOString().split("T")[0] // YYYY-MM-DD
          : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` // YYYY-MM

        if (!acc[period]) {
          acc[period] = {
            period,
            income: 0,
            expenses: 0,
            date,
            categories: new Map<string, CategoryBreakdown>(),
            totalTransactions: 0,
          }
        }

        // Get amount in default currency
        const amount =
          transaction.convertedCurrencyCode?.toUpperCase() === defaultCurrency.toUpperCase()
            ? transaction.convertedTotal || 0
            : transaction.currencyCode?.toUpperCase() === defaultCurrency.toUpperCase()
              ? transaction.total || 0
              : 0 // Skip transactions not in default currency for simplicity

        const categoryCode = transaction.categoryCode || "other"
        const category = categoryLookup.get(categoryCode) || {
          code: "other",
          name: "Other",
          color: "#6b7280",
        }

        // Initialize category if not exists
        if (!acc[period].categories.has(categoryCode)) {
          acc[period].categories.set(categoryCode, {
            code: category.code,
            name: category.name,
            color: category.color || "#6b7280",
            income: 0,
            expenses: 0,
            transactionCount: 0,
          })
        }

        const categoryData = acc[period].categories.get(categoryCode)!
        categoryData.transactionCount++
        acc[period].totalTransactions++

        if (transaction.type === "income") {
          acc[period].income += amount
          categoryData.income += amount
        } else if (transaction.type === "expense") {
          acc[period].expenses += amount
          categoryData.expenses += amount
        }

        return acc
      },
      {} as Record<
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
    )

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
