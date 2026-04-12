"use client"

import { getInvoicePaymentPresentation } from "@/lib/invoice-state-presentation"
import { cn } from "@/lib/utils"

export function InvoiceStatusBadge({ status }: { status: string }) {
  const config = getInvoicePaymentPresentation(status)
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        config.className
      )}
    >
      {config.label}
    </span>
  )
}
