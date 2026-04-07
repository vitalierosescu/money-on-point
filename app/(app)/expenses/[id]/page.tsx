import { ExpenseDetail } from "@/components/expenses/expense-detail"
import { PageShell } from "@/components/ui/page-shell"
import { getCurrentUser } from "@/lib/auth"
import { getUiLocale } from "@/lib/locale"
import { getCategories } from "@/models/categories"
import { getCurrencies } from "@/models/currencies"
import { getFields } from "@/models/fields"
import { getFilesByTransactionId } from "@/models/files"
import { getProjects } from "@/models/projects"
import { getSettings } from "@/models/settings"
import { getTransactionById } from "@/models/transactions"
import { Metadata } from "next"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Expense Details",
}

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()

  const [expense, categories, projects, currencies, fields, settings, files] = await Promise.all([
    getTransactionById(id, user.id),
    getCategories(user.id),
    getProjects(user.id),
    getCurrencies(user.id),
    getFields(user.id),
    getSettings(user.id),
    getFilesByTransactionId(id, user.id),
  ])

  if (!expense || expense.type !== "expense") {
    notFound()
  }

  const locale = getUiLocale(settings)

  return (
    <PageShell maxWidth="none" className="w-full">
      <ExpenseDetail
        expense={expense}
        categories={categories}
        projects={projects}
        currencies={currencies}
        fields={fields}
        files={files}
        defaultCurrency={settings.default_currency || "EUR"}
        locale={locale}
      />
    </PageShell>
  )
}
