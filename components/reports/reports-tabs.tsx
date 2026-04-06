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
            <StatCard label="Totale omzet" value={<span className="font-mono tabular-nums">{fmt(totalRevenue, defaultCurrency)}</span>} />
            <StatCard label="Facturen betaald" value={<span className="font-mono tabular-nums">{totalInvoices}</span>} />
            <StatCard
              label="Gemiddeld per factuur"
              value={
                <span className="font-mono tabular-nums">
                  {totalInvoices > 0 ? fmt(totalRevenue / totalInvoices, defaultCurrency) : "–"}
                </span>
              }
            />
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
            <EmptyState
              title={`Geen cashflow data voor ${year}.`}
              description="Probeer een ander jaar of importeer eerst je transacties."
            />
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
          <StatCard
            label="Totaal openstaand"
            value={<span className="font-mono tabular-nums">{fmt(totalOutstanding / 100, defaultCurrency)}</span>}
          />
          {outstandingInvoices.length === 0 ? (
            <EmptyState
              title="Geen openstaande facturen."
              description="Zodra een factuur onbetaald is, verschijnt die hier."
            />
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide">Factuur</TableHead>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide">Klant</TableHead>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide">Vervaldatum</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide">Openstaand</TableHead>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y">
                  {outstandingInvoices.map((inv) => {
                    const remaining = (inv.total - inv.paidAmount) / 100
                    const isOverdue =
                      inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid"
                    return (
                      <TableRow key={inv.id} className="hover:bg-muted/30">
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
                            ? new Intl.DateTimeFormat("nl-BE", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              }).format(new Date(inv.dueDate))
                            : "–"}
                        </TableCell>
                        <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                          {fmt(remaining, inv.currency)}
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
            Gebaseerd op betaalde facturen en betaalde uitgaven in {year}. BTW op uitgaven vereist dat het BTW-bedrag ingevuld is per uitgave.
          </p>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/20">
                <TableRow>
                  <TableHead className="px-3 py-3 text-xs uppercase tracking-wide">Kwartaal</TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide">Omzet excl. BTW</TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide">BTW ontvangen</TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide">BTW betaald</TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide font-semibold">Te betalen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y">
                {vatSummary.map((q) => (
                  <TableRow key={q.quarter} className="hover:bg-muted/30">
                    <TableCell className="px-3 py-3 font-medium">{q.quarter}</TableCell>
                    <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                      {fmt(q.invoiceSubtotal, defaultCurrency)}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                      {fmt(q.vatCollected, defaultCurrency)}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">
                      {fmt(q.vatPaid, defaultCurrency)}
                    </TableCell>
                    <TableCell
                      className={`px-3 py-3 text-right font-mono tabular-nums font-semibold ${
                        q.netVat <= 0 ? "text-emerald-700" : ""
                      }`}
                    >
                      {fmt(q.netVat, defaultCurrency)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/20 font-semibold border-t-2">
                  <TableCell className="px-3 py-3">Totaal</TableCell>
                  <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                    {fmt(vatSummary.reduce((s, q) => s + q.invoiceSubtotal, 0), defaultCurrency)}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                    {fmt(vatSummary.reduce((s, q) => s + q.vatCollected, 0), defaultCurrency)}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">
                    {fmt(vatSummary.reduce((s, q) => s + q.vatPaid, 0), defaultCurrency)}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                    {fmt(vatSummary.reduce((s, q) => s + q.netVat, 0), defaultCurrency)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="auteursrechten" className="space-y-6 pt-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Bruto auteursrechten"
              value={<span className="font-mono tabular-nums">{fmt(authorRightsReport.authorRightsGross, defaultCurrency)}</span>}
            />
            <StatCard
              label="Roerende voorheffing"
              value={<span className="font-mono tabular-nums">{fmt(authorRightsReport.withholding, defaultCurrency)}</span>}
            />
            <StatCard
              label="Netto auteursrechten"
              value={<span className="font-mono tabular-nums">{fmt(authorRightsReport.netRights, defaultCurrency)}</span>}
            />
            <StatCard
              label="Facturen"
              value={<span className="font-mono tabular-nums">{authorRightsReport.invoiceCount}</span>}
            />
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
            <EmptyState
              title={`Geen auteursrechtenfacturen voor ${year}.`}
              description="Zodra je auteursrechten factureert, verschijnt de klantverdeling hier."
            />
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide">Klant</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide">Facturen</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide">Bruto rechten</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide">Voorheffing</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide">Netto rechten</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y">
                  {authorRightsReport.customerTotals.map((row) => (
                    <TableRow key={row.customerId ?? row.customerName} className="hover:bg-muted/30">
                      <TableCell className="px-3 py-3">{row.customerName}</TableCell>
                      <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                        {row.invoiceCount}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                        {fmt(row.authorRightsGross, defaultCurrency)}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                        {fmt(row.withholding, defaultCurrency)}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                        {fmt(row.netRights, defaultCurrency)}
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
