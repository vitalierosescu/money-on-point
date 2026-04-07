import { ExpenseList } from "@/components/expenses/expense-list"
import { UploadButton } from "@/components/files/upload-button"
import { Button } from "@/components/ui/button"
import { PageShell } from "@/components/ui/page-shell"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { getCurrentUser } from "@/lib/auth"
import { getExpenseAmountForCurrency } from "@/lib/expense-status"
import { t } from "@/lib/i18n"
import { formatLocaleCurrency, formatLocaleNumber, getUiLocale } from "@/lib/locale"
import { getCategories } from "@/models/categories"
import { getFields } from "@/models/fields"
import { getProjects } from "@/models/projects"
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
  const [expenses, categories, fields, projects, settings] = await Promise.all([
    getExpenses(user.id),
    getCategories(user.id),
    getFields(user.id),
    getProjects(user.id),
    getSettings(user.id),
  ])
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
      <PageHeader
        title={t(locale, "expenses.title")}
        description={t(locale, "expenses.subtitle", {
          count: formatLocaleNumber(expenses.length, locale),
        })}
        className="mb-space-6"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" asChild>
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
        }
      />

      <div className="grid gap-4 mb-8 md:grid-cols-3">
        <StatCard
          tone="warning"
          label={t(locale, "expenses.overviewOpen")}
          value={
            <span className="font-mono tabular-nums">
              {formatLocaleCurrency(sumTotal(outstanding), defaultCurrency, locale)}
            </span>
          }
          helper={`${formatLocaleNumber(outstanding.length, locale)} ${t(
            locale,
            outstanding.length === 1 ? "expenses.countExpense" : "expenses.countExpenses"
          )}`}
        />
        <StatCard
          tone={overdue.length > 0 ? "destructive" : "default"}
          valueTone={overdue.length > 0 ? "destructive" : undefined}
          label={t(locale, "expenses.overviewOverdue")}
          value={
            <span className="font-mono tabular-nums">
              {formatLocaleCurrency(sumTotal(overdue), defaultCurrency, locale)}
            </span>
          }
          helper={`${formatLocaleNumber(overdue.length, locale)} ${t(
            locale,
            overdue.length === 1 ? "expenses.countExpense" : "expenses.countExpenses"
          )}`}
        />
        <StatCard
          tone="success"
          valueTone="success"
          label={t(locale, "expenses.overviewPaid")}
          value={
            <span className="font-mono tabular-nums">
              {formatLocaleCurrency(sumTotal(paid), defaultCurrency, locale)}
            </span>
          }
          helper={`${formatLocaleNumber(paid.length, locale)} ${t(
            locale,
            paid.length === 1 ? "expenses.countExpense" : "expenses.countExpenses"
          )}`}
        />
      </div>

      <div>
        <ExpenseList
          expenses={expenses}
          categories={categories}
          fields={fields}
          projects={projects}
          defaultCurrency={defaultCurrency}
          locale={locale}
        />
      </div>
    </PageShell>
  )
}
