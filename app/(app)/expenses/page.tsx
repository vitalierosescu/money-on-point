import { ExpenseList } from "@/components/expenses/expense-list"
import { UploadButton } from "@/components/files/upload-button"
import { getCurrentUser } from "@/lib/auth"
import { getCategories } from "@/models/categories"
import { getExpenses } from "@/models/transactions"
import { Upload } from "lucide-react"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Expenses",
  description: "Manage your expenses",
}

export default async function ExpensesPage() {
  const user = await getCurrentUser()
  const [expenses, categories] = await Promise.all([
    getExpenses(user.id),
    getCategories(user.id),
  ])

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">Expenses</span>
          <span className="text-3xl tracking-tight opacity-20">{expenses.length}</span>
        </h2>
        <UploadButton>
          <Upload className="h-4 w-4" />
          <span>Upload</span>
        </UploadButton>
      </header>

      <div className="border rounded-lg overflow-hidden">
        <ExpenseList expenses={expenses} categories={categories} />
      </div>
    </>
  )
}
