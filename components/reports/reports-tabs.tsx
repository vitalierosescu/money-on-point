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
            className={`px-3 py-1.5 text-sm rounded-button border transition-colors ${
              y === year
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-primary"
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
          <div className="rounded-card border border-border bg-card p-space-4">
            <p className="text-sm font-medium mb-4">Maandelijkse omzet {year}</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyRevenue} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
                <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" tickFormatter={(v) => `€${v}`} />
                <Tooltip formatter={(v) => fmt(Number(v), defaultCurrency)} />
                <Bar dataKey="revenue" name="Omzet" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" asChild>
              <a href={`/export/invoices?year=${year}`}>CSV exporteren</a>
            </Button>
            <Button variant="secondary" asChild>
              <a href={`/export/zip?year=${year}`}>PDF&apos;s downloaden (ZIP)</a>
            </Button>
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
            <div className="rounded-card border border-border bg-card p-space-4">
              <p className="text-sm font-medium mb-4">Inkomsten vs Uitgaven {year}</p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={cashflowData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" tickFormatter={(v) => `€${v}`} />
                  <Tooltip formatter={(v) => fmt(Number(v), defaultCurrency)} />
                  <Legend />
                  <Line type="monotone" dataKey="Inkomsten" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Uitgaven" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div>
            <Button variant="secondary" asChild>
              <a href={`/export/expenses?year=${year}`}>Uitgaven CSV exporteren</a>
            </Button>
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide text-muted-foreground">Factuur</TableHead>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide text-muted-foreground">Klant</TableHead>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide text-muted-foreground">Vervaldatum</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">Openstaand</TableHead>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide text-muted-foreground">Status</TableHead>
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3 py-3 text-xs uppercase tracking-wide text-muted-foreground">Kwartaal</TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">Omzet excl. BTW</TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">BTW ontvangen</TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">BTW betaald</TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground font-semibold">Te betalen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y">
                {vatSummary.map((q) => (
                  <TableRow key={q.quarter} className="hover:bg-secondary/60">
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
                        q.netVat <= 0 ? "text-success" : ""
                      }`}
                    >
                      {fmt(q.netVat, defaultCurrency)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-secondary/60 font-semibold border-t-2">
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

          <div className="rounded-card border border-border bg-card p-space-4">
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
                <div className="rounded-card bg-secondary/60 px-3 py-2">
                  <div className="text-muted-foreground">Nog beschikbaar</div>
                  <div className="font-mono tabular-nums">{fmt(authorRightsReport.thresholdRemaining, defaultCurrency)}</div>
                </div>
                <div className="rounded-card bg-secondary/60 px-3 py-2">
                  <div className="text-muted-foreground">Beroepsvergoeding</div>
                  <div className="font-mono tabular-nums">{fmt(authorRightsReport.professionalGross, defaultCurrency)}</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" asChild>
              <a href={`/export/author-rights?year=${year}`}>Jaaroverzicht exporteren</a>
            </Button>
            <Button variant="secondary" asChild>
              <a href={`/export/author-rights/customers?year=${year}`}>Klanttotalen exporteren</a>
            </Button>
          </div>

          {authorRightsReport.customerTotals.length === 0 ? (
            <EmptyState
              title={`Geen auteursrechtenfacturen voor ${year}.`}
              description="Zodra je auteursrechten factureert, verschijnt de klantverdeling hier."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 py-3 text-xs uppercase tracking-wide text-muted-foreground">Klant</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">Facturen</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">Bruto rechten</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">Voorheffing</TableHead>
                    <TableHead className="px-3 py-3 text-right text-xs uppercase tracking-wide text-muted-foreground">Netto rechten</TableHead>
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
