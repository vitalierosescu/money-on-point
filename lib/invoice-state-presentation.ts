import { getInvoiceDeliveryStatusLabel, normalizeInvoiceDeliveryStatus } from "@/lib/invoice-delivery"

type PaymentPresentation = {
  label: string
  className: string
}

type DeliveryPresentation = {
  label: string
  textClassName: string
  chipClassName: string
}

const PAYMENT_PRESENTATION: Record<string, PaymentPresentation> = {
  draft: {
    label: "Draft",
    className: "border-transparent bg-muted/70 text-muted-foreground",
  },
  sent: {
    label: "Unpaid",
    className: "border-border bg-background text-foreground",
  },
  paid: {
    label: "Paid",
    className: "border-success/20 bg-success/15 text-success",
  },
  partially_paid: {
    label: "Partially paid",
    className: "border-warning/20 bg-warning/15 text-warning",
  },
  overdue: {
    label: "Overdue",
    className: "border-destructive/20 bg-destructive/10 text-destructive",
  },
  cancelled: {
    label: "Cancelled",
    className: "border-transparent bg-muted/70 text-muted-foreground line-through",
  },
}

const DELIVERY_PRESENTATION: Record<string, Omit<DeliveryPresentation, "label">> = {
  not_sent: {
    textClassName: "text-muted-foreground",
    chipClassName: "border-border/50 bg-muted/50 text-muted-foreground",
  },
  ready: {
    textClassName: "text-warning",
    chipClassName: "border-warning/20 bg-warning/10 text-warning",
  },
  verified: {
    textClassName: "text-info",
    chipClassName: "border-info/20 bg-info/10 text-info",
  },
  sent: {
    textClassName: "text-success",
    chipClassName: "border-success/20 bg-success/10 text-success",
  },
  failed: {
    textClassName: "text-destructive",
    chipClassName: "border-destructive/20 bg-destructive/10 text-destructive",
  },
}

export function getInvoicePaymentPresentation(status: string): PaymentPresentation {
  return PAYMENT_PRESENTATION[status] ?? PAYMENT_PRESENTATION.draft
}

export function getInvoiceDeliveryPresentation(status: string | null | undefined): DeliveryPresentation {
  if (status === "ready") {
    return {
      label: "Ready",
      ...DELIVERY_PRESENTATION.ready,
    }
  }

  const normalized = normalizeInvoiceDeliveryStatus(status)
  return {
    label: getInvoiceDeliveryStatusLabel(normalized),
    ...DELIVERY_PRESENTATION[normalized],
  }
}
