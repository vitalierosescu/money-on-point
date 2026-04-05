// app/(app)/reports/page.tsx
import type { Metadata } from "next"
import { getCurrentUser } from "@/lib/auth"
import { ReportsTabs } from "@/components/reports/reports-tabs"

export const metadata: Metadata = { title: "Reports" }

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const { year: yearParam } = await searchParams
  const parsed = parseInt(yearParam ?? "", 10)
  const year = Number.isFinite(parsed) && parsed >= 2000 && parsed <= 2100
    ? parsed
    : new Date().getFullYear()
  const user = await getCurrentUser()

  return (
    <>
      <header className="flex items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-4 items-baseline">
          <span className="text-3xl font-bold tracking-tight">Reports</span>
          <span className="text-sm text-muted-foreground">Financieel overzicht per jaar</span>
        </h2>
      </header>
      <ReportsTabs year={year} userId={user.id} defaultCurrency={user.defaultCurrency ?? "EUR"} />
    </>
  )
}
