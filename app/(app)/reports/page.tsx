// app/(app)/reports/page.tsx
import { getCurrentUser } from "@/lib/auth"
import { ReportsTabs } from "@/components/reports/reports-tabs"

export const metadata = { title: "Reports" }

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const { year: yearParam } = await searchParams
  const year = parseInt(yearParam ?? String(new Date().getFullYear()), 10)
  const user = await getCurrentUser()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">Financieel overzicht per jaar</p>
      </div>
      <ReportsTabs year={year} userId={user.id} defaultCurrency={user.defaultCurrency ?? "EUR"} />
    </div>
  )
}
