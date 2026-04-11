// components/reports/reports-tabs.tsx
"use client"

import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { MonthlyRevenueData, TimeSeriesData, VatQuarterData } from "@/models/stats"
import type { AuthorRightsYearReport } from "@/models/author-rights"
import type { InvoiceWithCustomer } from "@/models/invoices"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import Link from "next/link"
import { EmptyState } from "@/components/ui/empty-state"
import { StatCard } from "@/components/ui/stat-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"
import { formatLocaleCurrency, formatLocaleDate, type UiLocale } from "@/lib/locale"

interface ReportsTabsProps {
  year: number
  monthlyRevenue: MonthlyRevenueData[]
  vatSummary: VatQuarterData[]
  timeSeries: TimeSeriesData[]
  outstandingInvoices: InvoiceWithCustomer[]
  authorRightsReport: AuthorRightsYearReport
  defaultCurrency: string
  locale: UiLocale
}

function fmt(amount: number, currency: string, locale: UiLocale) {
  return formatLocaleCurrency(Math.round(amount * 100), currency, locale)
}

export function ReportsTabs({
  year,
  monthlyRevenue,
  vatSummary,
  timeSeries,
  outstandingInvoices,
  authorRightsReport,
  defaultCurrency,
  locale,
}: ReportsTabsProps) {
  const router = useRouter()

  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2]

  const totalRevenue = monthlyRevenue.reduce((s, m) => s + m.revenue, 0)
  const totalInvoices = monthlyRevenue.reduce((s, m) => s + m.count, 0)

  const totalOutstanding = outstandingInvoices.reduce(
    (s, inv) => s + (inv.total - inv.paidAmount),
    0
  )
  const hasRevenueData = totalInvoices > 0 || totalRevenue > 0

  const cashflowData = timeSeries.map((d) => ({
    period: d.period,
    Inkomsten: d.income / 100,
    Uitgaven: d.expenses / 100,
  }))

  return (
    <div className="space-y-4">
      {/* Year selector */}
      <div className="flex gap-2">
        {years.map((y) => (
          <Button
            key={y}
            type="button"
            variant={y === year ? "default" : "outline"}
            onClick={() => router.push(`/reports?year=${y}`)}
          >
            {y}
          </Button>
        ))}
      </div>

      <Tabs defaultValue="omzet">
        <TabsList>
          <TabsTrigger value="omzet">{t(locale, "reports.tabRevenue")}</TabsTrigger>
          <TabsTrigger value="cashflow">{t(locale, "reports.tabCashflow")}</TabsTrigger>
          <TabsTrigger value="openstaand">{t(locale, "reports.tabOutstanding")}</TabsTrigger>
          <TabsTrigger value="btw">{t(locale, "reports.tabVat")}</TabsTrigger>
          <TabsTrigger value="auteursrechten">{t(locale, "reports.tabAuthorRights")}</TabsTrigger>
        </TabsList>

        {/* OMZET TAB */}
        <TabsContent value="omzet" className="space-y-6 pt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label={t(locale, "reports.totalRevenue")} value={<span className="font-mono tabular-nums">{fmt(totalRevenue, defaultCurrency, locale)}</span>} />
            <StatCard label={t(locale, "reports.paidInvoices")} value={<span className="font-mono tabular-nums">{totalInvoices}</span>} />
            <StatCard
              label={t(locale, "reports.averagePerInvoice")}
              value={
                <span className="font-mono tabular-nums">
                  {totalInvoices > 0 ? fmt(totalRevenue / totalInvoices, defaultCurrency, locale) : "–"}
                </span>
              }
            />
          </div>
          {hasRevenueData ? (
            <>
              <div className="rounded-card border border-border bg-card p-space-4">
                <p className="mb-4 text-sm font-medium">{t(locale, "reports.revenueByMonth", { year })}</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyRevenue} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
                    <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" tickFormatter={(v) => `€${v}`} />
                    <Tooltip formatter={(v) => fmt(Number(v), defaultCurrency, locale)} />
                    <Bar dataKey="revenue" name={t(locale, "reports.tabRevenue")} fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" asChild>
                  <a href={`/export/invoices?year=${year}`}>{t(locale, "reports.exportInvoicesCsv")}</a>
                </Button>
                <Button variant="secondary" asChild>
                  <a href={`/export/zip?year=${year}`}>{t(locale, "reports.exportInvoicesZip")}</a>
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              title={t(locale, "reports.revenueEmptyTitle", { year })}
              description={t(locale, "reports.revenueEmptyDescription")}
            />
          )}
        </TabsContent>

        {/* CASHFLOW TAB */}
        <TabsContent value="cashflow" className="space-y-6 pt-4">
          {cashflowData.length === 0 ? (
            <EmptyState
              title={t(locale, "reports.cashflowEmptyTitle", { year })}
              description={t(locale, "reports.cashflowEmptyDescription")}
            />
          ) : (
            <div className="rounded-card border border-border bg-card p-space-4">
              <p className="mb-4 text-sm font-medium">{t(locale, "reports.cashflowTitle", { year })}</p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={cashflowData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" tickFormatter={(v) => `€${v}`} />
                  <Tooltip formatter={(v) => fmt(Number(v), defaultCurrency, locale)} />
                  <Legend />
                  <Line type="monotone" dataKey="Inkomsten" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} name={t(locale, "reports.income")} />
                  <Line type="monotone" dataKey="Uitgaven" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name={t(locale, "reports.expenses")} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div>
            <Button variant="secondary" asChild>
              <a href={`/export/expenses?year=${year}`}>{t(locale, "reports.exportExpensesCsv")}</a>
            </Button>
          </div>
        </TabsContent>

        {/* OPENSTAAND TAB */}
        <TabsContent value="openstaand" className="space-y-4 pt-4">
          <StatCard
            label={t(locale, "reports.outstandingTotal")}
            value={<span className="font-mono tabular-nums">{fmt(totalOutstanding / 100, defaultCurrency, locale)}</span>}
          />
          {outstandingInvoices.length === 0 ? (
            <EmptyState
              title={t(locale, "reports.outstandingEmptyTitle")}
              description={t(locale, "reports.outstandingEmptyDescription")}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "reports.outstandingInvoice")}</TableHead>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "reports.customer")}</TableHead>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "reports.dueDate")}</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "reports.outstandingAmount")}</TableHead>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "reports.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y">
                  {outstandingInvoices.map((inv) => {
                    const remaining = (inv.total - inv.paidAmount) / 100
                    const isOverdue =
                      inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid"
                    return (
                      <TableRow key={inv.id} className="hover:bg-secondary/60">
                        <TableCell className="px-3 py-3 font-mono tabular-nums">
                          <Link href={`/invoices/${inv.id}`} className="hover:underline">
                            {inv.invoiceNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="px-3 py-3 text-muted-foreground">{inv.customer?.name ?? "–"}</TableCell>
                        <TableCell
                          className={`px-3 py-3 font-mono tabular-nums text-sm ${
                            isOverdue ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {inv.dueDate
                            ? formatLocaleDate(inv.dueDate, locale, {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "–"}
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                          {fmt(remaining, inv.currency, locale)}
                        </TableCell>
                        <TableCell className="px-3 py-3">
                          <InvoiceStatusBadge status={inv.status} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* BTW TAB */}
        <TabsContent value="btw" className="space-y-4 pt-4">
          <p className="text-xs text-muted-foreground">
            {t(locale, "reports.vatDescription", { year })}
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3 py-3 text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "reports.vatQuarter")}</TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "reports.vatRevenueExcl")}</TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "reports.vatCollected")}</TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "reports.vatPaid")}</TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide font-semibold text-muted-foreground">{t(locale, "reports.vatDue")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y">
                {vatSummary.map((q) => (
                  <TableRow key={q.quarter} className="hover:bg-secondary/60">
                    <TableCell className="px-3 py-3 font-medium">{q.quarter}</TableCell>
                    <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                      {fmt(q.invoiceSubtotal, defaultCurrency, locale)}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                      {fmt(q.vatCollected, defaultCurrency, locale)}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">
                      {fmt(q.vatPaid, defaultCurrency, locale)}
                    </TableCell>
                    <TableCell
                      className={`px-3 py-3 text-right font-mono tabular-nums font-semibold ${
                        q.netVat <= 0 ? "text-success" : ""
                      }`}
                    >
                      {fmt(q.netVat, defaultCurrency, locale)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-secondary/60 font-semibold border-t-2">
                  <TableCell className="px-3 py-3">{t(locale, "reports.vatTotal")}</TableCell>
                  <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                    {fmt(vatSummary.reduce((s, q) => s + q.invoiceSubtotal, 0), defaultCurrency, locale)}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                    {fmt(vatSummary.reduce((s, q) => s + q.vatCollected, 0), defaultCurrency, locale)}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">
                    {fmt(vatSummary.reduce((s, q) => s + q.vatPaid, 0), defaultCurrency, locale)}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                    {fmt(vatSummary.reduce((s, q) => s + q.netVat, 0), defaultCurrency, locale)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="auteursrechten" className="space-y-6 pt-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label={t(locale, "reports.authorRightsGross")}
              value={<span className="font-mono tabular-nums">{fmt(authorRightsReport.authorRightsGross, defaultCurrency, locale)}</span>}
            />
            <StatCard
              label={t(locale, "reports.authorRightsWithholding")}
              value={<span className="font-mono tabular-nums">{fmt(authorRightsReport.withholding, defaultCurrency, locale)}</span>}
            />
            <StatCard
              label={t(locale, "reports.authorRightsNet")}
              value={<span className="font-mono tabular-nums">{fmt(authorRightsReport.netRights, defaultCurrency, locale)}</span>}
            />
            <StatCard
              label={t(locale, "reports.authorRightsInvoices")}
              value={<span className="font-mono tabular-nums">{authorRightsReport.invoiceCount}</span>}
            />
          </div>

          <div className="rounded-card border border-border bg-card p-space-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{t(locale, "reports.authorRightsThresholdTitle", { year })}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {authorRightsReport.rulesConfigured
                    ? t(locale, "reports.authorRightsThresholdConfigured", {
                        percent: authorRightsReport.thresholdUsedPct ?? 0,
                      })
                    : t(locale, "reports.authorRightsThresholdMissing")}
                </p>
              </div>
              {authorRightsReport.rulesConfigured && authorRightsReport.thresholdAmount !== null && (
                <div className="text-right text-sm">
                  <div className="text-muted-foreground">{t(locale, "reports.authorRightsThresholdLabel")}</div>
                  <div className="font-mono tabular-nums">{fmt(authorRightsReport.thresholdAmount, defaultCurrency, locale)}</div>
                </div>
              )}
            </div>
            {authorRightsReport.rulesConfigured && authorRightsReport.thresholdRemaining !== null && (
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-card bg-secondary/60 px-3 py-2">
                  <div className="text-muted-foreground">{t(locale, "reports.authorRightsRemaining")}</div>
                  <div className="font-mono tabular-nums">{fmt(authorRightsReport.thresholdRemaining, defaultCurrency, locale)}</div>
                </div>
                <div className="rounded-card bg-secondary/60 px-3 py-2">
                  <div className="text-muted-foreground">{t(locale, "reports.authorRightsProfessionalGross")}</div>
                  <div className="font-mono tabular-nums">{fmt(authorRightsReport.professionalGross, defaultCurrency, locale)}</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" asChild>
              <a href={`/export/author-rights?year=${year}`}>{t(locale, "reports.exportAuthorRightsOverview")}</a>
            </Button>
            <Button variant="secondary" asChild>
              <a href={`/export/author-rights/customers?year=${year}`}>{t(locale, "reports.exportAuthorRightsCustomers")}</a>
            </Button>
          </div>

          {authorRightsReport.customerTotals.length === 0 ? (
            <EmptyState
              title={t(locale, "reports.authorRightsEmptyTitle", { year })}
              description={t(locale, "reports.authorRightsEmptyDescription")}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "reports.customer")}</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "reports.invoices")}</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "reports.authorRightsGross")}</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "reports.authorRightsWithholding")}</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "reports.authorRightsNet")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y">
                  {authorRightsReport.customerTotals.map((row) => (
                    <TableRow key={row.customerId ?? row.customerName} className="hover:bg-secondary/60">
                      <TableCell className="px-3 py-3">{row.customerName}</TableCell>
                      <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                        {row.invoiceCount}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                        {fmt(row.authorRightsGross, defaultCurrency, locale)}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                        {fmt(row.withholding, defaultCurrency, locale)}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                        {fmt(row.netRights, defaultCurrency, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
