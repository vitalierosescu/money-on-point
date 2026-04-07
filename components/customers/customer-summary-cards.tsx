import { StatCard } from "@/components/ui/stat-card"
import { type getCustomerStats } from "@/models/customers"

type Stats = Awaited<ReturnType<typeof getCustomerStats>>

export function CustomerSummaryCards({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <StatCard
        tone="warning"
        label="Open invoices"
        value={<span className="tabular-nums">{stats.openInvoicesCount}</span>}
      />
      <StatCard
        tone={stats.overdueInvoicesCount > 0 ? "destructive" : "default"}
        label="Overdue invoices"
        value={<span className="tabular-nums">{stats.overdueInvoicesCount}</span>}
      />
      <StatCard
        label="No invoices"
        value={<span className="tabular-nums">{stats.noInvoiceCustomersCount}</span>}
      />
      <StatCard
        tone="info"
        label="New (30d)"
        value={<span className="tabular-nums">{stats.newCustomers}</span>}
      />
    </div>
  )
}
