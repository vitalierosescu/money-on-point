import Link from "next/link"

type WorkQueueWidgetProps = {
  unsortedCount: number
  expensesToPay: number
  overdueInvoices: number
  blockedInvoices: number
}

const items = [
  {
    key: "unsortedCount",
    label: "Unsorted files",
    href: "/unsorted",
    hint: "Review new uploads before they pile up.",
  },
  {
    key: "expensesToPay",
    label: "Expenses to pay",
    href: "/expenses",
    hint: "Keep supplier payments and bookkeeping in sync.",
  },
  {
    key: "overdueInvoices",
    label: "Overdue invoices",
    href: "/invoices",
    hint: "Follow up before cash flow starts slipping.",
  },
  {
    key: "blockedInvoices",
    label: "Blocked delivery",
    href: "/invoices",
    hint: "Invoices that cannot go out yet.",
  },
] as const

export function WorkQueueWidget(props: WorkQueueWidgetProps) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Work Queue</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Start here when you want the shortest path through today&apos;s bookkeeping.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="rounded-xl border bg-muted/20 px-4 py-4 transition-colors hover:bg-muted/40"
          >
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{props[item.key]}</div>
            <div className="mt-2 text-sm text-muted-foreground">{item.hint}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
