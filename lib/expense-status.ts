import { t } from "@/lib/i18n"
import type { UiLocale } from "@/lib/locale"

export type ExpenseStatus = "unpaid" | "to_pay" | "paid" | "overdue"

type ExpenseLike = {
  total?: number | null
  currencyCode?: string | null
  convertedTotal?: number | null
  convertedCurrencyCode?: string | null
  status?: string | null
}

const EXPENSE_STATUS_CLASSNAMES: Record<ExpenseStatus, string> = {
  unpaid: "bg-muted text-muted-foreground",
  to_pay: "bg-info/15 text-info",
  paid: "bg-success/15 text-success",
  overdue: "bg-destructive/10 text-destructive",
}

export function normalizeExpenseStatus(status?: string | null): ExpenseStatus {
  switch (status) {
    case "to_pay":
    case "paid":
    case "overdue":
      return status
    default:
      return "unpaid"
  }
}

export function getExpenseStatusMeta(status: string | null | undefined, locale: UiLocale) {
  const normalizedStatus = normalizeExpenseStatus(status)
  return {
    label: t(locale, `expenseStatus.${normalizedStatus}`),
    className: EXPENSE_STATUS_CLASSNAMES[normalizedStatus],
    value: normalizedStatus,
  }
}

export function getExpenseAmountForCurrency(expense: ExpenseLike, targetCurrency: string) {
  const normalizedTargetCurrency = targetCurrency.toUpperCase()
  const convertedCurrency = expense.convertedCurrencyCode?.toUpperCase()
  const originalCurrency = expense.currencyCode?.toUpperCase()

  if (convertedCurrency === normalizedTargetCurrency) {
    return expense.convertedTotal ?? 0
  }

  if (originalCurrency === normalizedTargetCurrency) {
    return expense.total ?? 0
  }

  return 0
}
