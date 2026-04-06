// app/(app)/reports/page.tsx
import { getAuthorRightsYearReport } from "@/models/author-rights"
import type { Metadata } from "next"
import { getCurrentUser } from "@/lib/auth"
import { ReportsTabs } from "@/components/reports/reports-tabs"
import { PageHeader } from "@/components/ui/page-header"
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
      <PageHeader title="Reports" className="mb-space-6" />
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
