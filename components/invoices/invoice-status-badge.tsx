import { Badge } from "@/components/ui/badge"

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700 hover:bg-gray-100" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  paid: { label: "Paid", className: "bg-green-100 text-green-700 hover:bg-green-100" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-700 hover:bg-red-100" },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-500 hover:bg-gray-100" },
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { label: status, className: "" }
  return <Badge className={config.className}>{config.label}</Badge>
}
