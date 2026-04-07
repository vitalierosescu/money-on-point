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
    <div className="rounded-card bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-subtitle font-semibold font-heading tracking-[-0.02em]">Work Queue</h2>
          <p className="mt-1 text-body text-muted-foreground">
            Start here when you want the shortest path through today&apos;s bookkeeping.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="rounded-card border border-border bg-background px-4 py-4 transition-colors hover:border-primary"
          >
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold font-heading tabular-nums">{props[item.key]}</div>
            <div className="mt-2 text-sm text-muted-foreground">{item.hint}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
