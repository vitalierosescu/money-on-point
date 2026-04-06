"use client"

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-muted text-muted-foreground",
  },
  sent: {
    label: "Sent",
    className: "bg-info/15 text-info",
  },
  paid: {
    label: "Paid",
    className: "bg-success/15 text-success",
  },
  partially_paid: {
    label: "Partial",
    className: "bg-warning/15 text-warning",
  },
  overdue: {
    label: "Overdue",
    className: "bg-destructive/10 text-destructive",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground line-through",
  },
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  )
}
