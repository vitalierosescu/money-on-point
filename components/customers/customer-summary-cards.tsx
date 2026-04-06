import { type getCustomerStats } from "@/models/customers"

type Stats = Awaited<ReturnType<typeof getCustomerStats>>

export function CustomerSummaryCards({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div className="border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">Open invoices</p>
        <p className="font-semibold">{stats.openInvoicesCount}</p>
      </div>
      <div className="border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">Overdue invoices</p>
        <p className="font-semibold">{stats.overdueInvoicesCount}</p>
      </div>
      <div className="border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">No invoices</p>
        <p className="font-semibold">{stats.noInvoiceCustomersCount}</p>
      </div>
      <div className="border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">New (30d)</p>
        <p className="font-semibold">{stats.newCustomers}</p>
      </div>
    </div>
  )
}
