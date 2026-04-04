"use client"

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-700",
  },
  sent: {
    label: "Sent",
    className: "bg-blue-100 text-blue-700",
  },
  paid: {
    label: "Paid",
    className: "bg-green-100 text-green-700",
  },
  partially_paid: {
    label: "Partial",
    className: "bg-yellow-100 text-yellow-700",
  },
  overdue: {
    label: "Overdue",
    className: "bg-red-100 text-red-700",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-gray-100 text-gray-400 line-through",
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
