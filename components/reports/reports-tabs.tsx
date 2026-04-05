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

interface ReportsTabsProps {
  year: number
  monthlyRevenue: MonthlyRevenueData[]
  vatSummary: VatQuarterData[]
  timeSeries: TimeSeriesData[]
  outstandingInvoices: InvoiceWithCustomer[]
  authorRightsReport: AuthorRightsYearReport
  defaultCurrency: string
}

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency }).format(amount)
}

export function ReportsTabs({
  year,
  monthlyRevenue,
  vatSummary,
  timeSeries,
  outstandingInvoices,
  authorRightsReport,
  defaultCurrency,
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
          <button
            key={y}
            onClick={() => router.push(`/reports?year=${y}`)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              y === year
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      <Tabs defaultValue="omzet">
        <TabsList>
          <TabsTrigger value="omzet">Omzet</TabsTrigger>
          <TabsTrigger value="cashflow">Cashflow</TabsTrigger>
          <TabsTrigger value="openstaand">Openstaand</TabsTrigger>
          <TabsTrigger value="btw">BTW</TabsTrigger>
          <TabsTrigger value="auteursrechten">Auteursrechten</TabsTrigger>
        </TabsList>

        {/* OMZET TAB */}
        <TabsContent value="omzet" className="space-y-6 pt-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Totale omzet</p>
              <p className="text-2xl font-mono tabular-nums font-semibold">{fmt(totalRevenue, defaultCurrency)}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Facturen betaald</p>
              <p className="text-2xl font-mono tabular-nums font-semibold">{totalInvoices}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Gemiddeld per factuur</p>
              <p className="text-2xl font-mono tabular-nums font-semibold">
                {totalInvoices > 0 ? fmt(totalRevenue / totalInvoices, defaultCurrency) : "–"}
              </p>
            </div>
          </div>
          <div className="rounded-lg border p-5">
            <p className="text-sm font-medium mb-4">Maandelijkse omzet {year}</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyRevenue} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `€${v}`} />
                <Tooltip formatter={(v) => fmt(Number(v), defaultCurrency)} />
                <Bar dataKey="revenue" name="Omzet" fill="#18181b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-3">
            <a
              href={`/export/invoices?year=${year}`}
              className="text-sm px-3 py-2 rounded-md border border-border hover:bg-muted/30 transition-colors"
            >
              CSV exporteren
            </a>
            <a
              href={`/export/zip?year=${year}`}
              className="text-sm px-3 py-2 rounded-md border border-border hover:bg-muted/30 transition-colors"
            >
              PDF&apos;s downloaden (ZIP)
            </a>
          </div>
        </TabsContent>

        {/* CASHFLOW TAB */}
        <TabsContent value="cashflow" className="space-y-6 pt-4">
          {cashflowData.length === 0 ? (
            <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
              Geen cashflow data voor {year}.
            </div>
          ) : (
            <div className="rounded-lg border p-5">
              <p className="text-sm font-medium mb-4">Inkomsten vs Uitgaven {year}</p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={cashflowData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `€${v}`} />
                  <Tooltip formatter={(v) => fmt(Number(v), defaultCurrency)} />
                  <Legend />
                  <Line type="monotone" dataKey="Inkomsten" stroke="#18181b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Uitgaven" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div>
            <a
              href={`/export/expenses?year=${year}`}
              className="text-sm px-3 py-2 rounded-md border border-border hover:bg-muted/30 transition-colors"
            >
              Uitgaven CSV exporteren
            </a>
          </div>
        </TabsContent>

        {/* OPENSTAAND TAB */}
        <TabsContent value="openstaand" className="space-y-4 pt-4">
          <div className="rounded-lg border p-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Totaal openstaand</p>
            <p className="text-lg font-mono tabular-nums font-semibold">
              {fmt(totalOutstanding / 100, defaultCurrency)}
            </p>
          </div>
          {outstandingInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Geen openstaande facturen.</p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/20 border-b">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Factuur</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Klant</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Vervaldatum</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Openstaand</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {outstandingInvoices.map((inv) => {
                    const remaining = (inv.total - inv.paidAmount) / 100
                    const isOverdue =
                      inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid"
                    return (
                      <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-3 font-mono tabular-nums">
                          <Link href={`/invoices/${inv.id}`} className="hover:underline">
                            {inv.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{inv.customer?.name ?? "–"}</td>
                        <td
                          className={`px-3 py-3 font-mono tabular-nums text-sm ${
                            isOverdue ? "text-red-600" : "text-muted-foreground"
                          }`}
                        >
                          {inv.dueDate
                            ? new Intl.DateTimeFormat("nl-BE", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }).format(new Date(inv.dueDate))
                            : "–"}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {fmt(remaining, inv.currency)}
                        </td>
                        <td className="px-3 py-3">
                          <InvoiceStatusBadge status={inv.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* BTW TAB */}
        <TabsContent value="btw" className="space-y-4 pt-4">
          <p className="text-xs text-muted-foreground">
            Gebaseerd op betaalde facturen en betaalde uitgaven in {year}. BTW op uitgaven vereist dat het BTW-bedrag ingevuld is per uitgave.
          </p>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/20 border-b">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Kwartaal</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Omzet excl. BTW</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">BTW ontvangen</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">BTW betaald</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide font-semibold">Te betalen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {vatSummary.map((q) => (
                  <tr key={q.quarter} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3 font-medium">{q.quarter}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{fmt(q.invoiceSubtotal, defaultCurrency)}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{fmt(q.vatCollected, defaultCurrency)}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">{fmt(q.vatPaid, defaultCurrency)}</td>
                    <td
                      className={`px-3 py-3 text-right font-mono tabular-nums font-semibold ${
                        q.netVat <= 0 ? "text-emerald-700" : ""
                      }`}
                    >
                      {fmt(q.netVat, defaultCurrency)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/20 font-semibold border-t-2">
                  <td className="px-3 py-3">Totaal</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{fmt(vatSummary.reduce((s, q) => s + q.invoiceSubtotal, 0), defaultCurrency)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{fmt(vatSummary.reduce((s, q) => s + q.vatCollected, 0), defaultCurrency)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">{fmt(vatSummary.reduce((s, q) => s + q.vatPaid, 0), defaultCurrency)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{fmt(vatSummary.reduce((s, q) => s + q.netVat, 0), defaultCurrency)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="auteursrechten" className="space-y-6 pt-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Bruto auteursrechten</p>
              <p className="text-2xl font-mono tabular-nums font-semibold">{fmt(authorRightsReport.authorRightsGross, defaultCurrency)}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Roerende voorheffing</p>
              <p className="text-2xl font-mono tabular-nums font-semibold">{fmt(authorRightsReport.withholding, defaultCurrency)}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Netto auteursrechten</p>
              <p className="text-2xl font-mono tabular-nums font-semibold">{fmt(authorRightsReport.netRights, defaultCurrency)}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Facturen</p>
              <p className="text-2xl font-mono tabular-nums font-semibold">{authorRightsReport.invoiceCount}</p>
            </div>
          </div>

          <div className="rounded-lg border p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Belgische drempel {year}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {authorRightsReport.rulesConfigured
                    ? `Gebruik ${authorRightsReport.thresholdUsedPct}% van de geconfigureerde bruto auteursrechtenlimiet.`
                    : "Geen regels geconfigureerd voor dit inkomstenjaar. Werk de wettelijke drempels bij voor je hierop rekent."}
                </p>
              </div>
              {authorRightsReport.rulesConfigured && authorRightsReport.thresholdAmount !== null && (
                <div className="text-right text-sm">
                  <div className="text-muted-foreground">Drempel</div>
                  <div className="font-mono tabular-nums">{fmt(authorRightsReport.thresholdAmount, defaultCurrency)}</div>
                </div>
              )}
            </div>
            {authorRightsReport.rulesConfigured && authorRightsReport.thresholdRemaining !== null && (
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <div className="text-muted-foreground">Nog beschikbaar</div>
                  <div className="font-mono tabular-nums">{fmt(authorRightsReport.thresholdRemaining, defaultCurrency)}</div>
                </div>
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <div className="text-muted-foreground">Beroepsvergoeding</div>
                  <div className="font-mono tabular-nums">{fmt(authorRightsReport.professionalGross, defaultCurrency)}</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <a
              href={`/export/author-rights?year=${year}`}
              className="text-sm px-3 py-2 rounded-md border border-border hover:bg-muted/30 transition-colors"
            >
              Jaaroverzicht exporteren
            </a>
            <a
              href={`/export/author-rights/customers?year=${year}`}
              className="text-sm px-3 py-2 rounded-md border border-border hover:bg-muted/30 transition-colors"
            >
              Klanttotalen exporteren
            </a>
          </div>

          {authorRightsReport.customerTotals.length === 0 ? (
            <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
              Geen auteursrechtenfacturen voor {year}.
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/20 border-b">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Klant</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Facturen</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Bruto rechten</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Voorheffing</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Netto rechten</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {authorRightsReport.customerTotals.map((row) => (
                    <tr key={row.customerId ?? row.customerName} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-3">{row.customerName}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{row.invoiceCount}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{fmt(row.authorRightsGross, defaultCurrency)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{fmt(row.withholding, defaultCurrency)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{fmt(row.netRights, defaultCurrency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
