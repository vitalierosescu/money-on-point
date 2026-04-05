// app/(app)/reports/page.tsx
import { getAuthorRightsYearReport } from "@/models/author-rights"
import type { Metadata } from "next"
import { getCurrentUser } from "@/lib/auth"
import { ReportsTabs } from "@/components/reports/reports-tabs"
import { PageShell } from "@/components/ui/page-shell"
import { getMonthlyRevenue, getVatSummary, getTimeSeriesStats } from "@/models/stats"
import { getOutstandingInvoices } from "@/models/invoices"

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
  const defaultCurrency = "EUR"

  const dateFrom = `${year}-01-01`
  const dateTo = `${year}-12-31`

  const [monthlyRevenue, vatSummary, timeSeries, outstandingInvoices, authorRightsReport] = await Promise.all([
    getMonthlyRevenue(user.id, year),
    getVatSummary(user.id, year),
    getTimeSeriesStats(user.id, { dateFrom, dateTo }, defaultCurrency),
    getOutstandingInvoices(user.id),
    getAuthorRightsYearReport(user.id, year),
  ])

  return (
    <PageShell>
      <header className="flex items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-4 items-baseline">
          <span className="text-3xl font-bold tracking-tight">Reports</span>
        </h2>
      </header>
      <ReportsTabs
        year={year}
        monthlyRevenue={monthlyRevenue}
        vatSummary={vatSummary}
        timeSeries={timeSeries}
        outstandingInvoices={outstandingInvoices}
        authorRightsReport={authorRightsReport}
        defaultCurrency={defaultCurrency}
      />
    </PageShell>
  )
}
