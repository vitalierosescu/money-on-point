import { ExpenseList } from "@/components/expenses/expense-list"
import { UploadButton } from "@/components/files/upload-button"
import { Button } from "@/components/ui/button"
import { PageShell } from "@/components/ui/page-shell"
import { getCurrentUser } from "@/lib/auth"
import { getExpenseAmountForCurrency } from "@/lib/expense-status"
import { t } from "@/lib/i18n"
import { formatLocaleCurrency, formatLocaleNumber, getUiLocale } from "@/lib/locale"
import { getSettings } from "@/models/settings"
import { getExpenses } from "@/models/transactions"
import { Download, Upload } from "lucide-react"
import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Expenses",
  description: "Manage your expenses",
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await searchParams
  const user = await getCurrentUser()
  const [expenses, settings] = await Promise.all([getExpenses(user.id), getSettings(user.id)])
  const year = new Date().getFullYear()
  const defaultCurrency = settings.default_currency || "EUR"
  const locale = getUiLocale(settings)

  const outstanding = expenses.filter((e) => e.status === "unpaid" || e.status === "to_pay")
  const overdue = expenses.filter((e) => e.status === "overdue")
  const paid = expenses.filter((e) => e.status === "paid")
  const sumTotal = (list: typeof expenses) =>
    list.reduce((acc, expense) => acc + getExpenseAmountForCurrency(expense, defaultCurrency), 0)

  return (
    <PageShell>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5 items-baseline">
          <span className="text-3xl font-bold tracking-tight">{t(locale, "expenses.title")}</span>
          <span className="text-base tracking-tight text-muted-foreground">
            {t(locale, "expenses.subtitle", {
              count: formatLocaleNumber(expenses.length, locale),
            })}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/export/expenses?year=${year}`}>
              <Download className="h-4 w-4" />
              {t(locale, "expenses.exportYear", { year })}
            </Link>
          </Button>
          <UploadButton>
            <Upload className="h-4 w-4" />
            <span>{t(locale, "expenses.uploadReceipt")}</span>
          </UploadButton>
        </div>
      </header>

      <div className="grid gap-4 mb-8 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">{t(locale, "expenses.overviewOpen")}</p>
          <p className="text-2xl font-semibold tabular-nums font-mono">
            {formatLocaleCurrency(sumTotal(outstanding), defaultCurrency, locale)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {formatLocaleNumber(outstanding.length, locale)}{" "}
            {t(locale, outstanding.length === 1 ? "expenses.countExpense" : "expenses.countExpenses")}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <p className="text-xs text-red-500 uppercase tracking-wide mb-2">{t(locale, "expenses.overviewOverdue")}</p>
          <p className="text-2xl font-semibold tabular-nums font-mono text-red-600">
            {formatLocaleCurrency(sumTotal(overdue), defaultCurrency, locale)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {formatLocaleNumber(overdue.length, locale)}{" "}
            {t(locale, overdue.length === 1 ? "expenses.countExpense" : "expenses.countExpenses")}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <p className="text-xs text-emerald-600 uppercase tracking-wide mb-2">{t(locale, "expenses.overviewPaid")}</p>
          <p className="text-2xl font-semibold tabular-nums font-mono text-emerald-700">
            {formatLocaleCurrency(sumTotal(paid), defaultCurrency, locale)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {formatLocaleNumber(paid.length, locale)}{" "}
            {t(locale, paid.length === 1 ? "expenses.countExpense" : "expenses.countExpenses")}
          </p>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <ExpenseList expenses={expenses} defaultCurrency={defaultCurrency} locale={locale} />
      </div>
    </PageShell>
  )
}
