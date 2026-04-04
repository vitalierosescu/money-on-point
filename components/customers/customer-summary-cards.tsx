import { type getCustomerStats } from "@/models/customers"

type Stats = Awaited<ReturnType<typeof getCustomerStats>>

export function CustomerSummaryCards({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div className="border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">Most Active</p>
        <p className="font-semibold truncate">{stats.mostActive?.name || "—"}</p>
      </div>
      <div className="border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">Inactive (30d)</p>
        <p className="font-semibold">{stats.inactiveCount}</p>
      </div>
      <div className="border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">Top Revenue</p>
        <p className="font-semibold truncate">{stats.topRevenue?.name || "—"}</p>
      </div>
      <div className="border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">New (30d)</p>
        <p className="font-semibold">{stats.newCustomers}</p>
      </div>
    </div>
  )
}
