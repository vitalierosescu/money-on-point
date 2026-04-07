"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Pencil, Plus } from "lucide-react"
import { Customer, Invoice } from "@/prisma/client"
import { CustomerAvatar } from "@/components/customers/customer-avatar"
import { CustomerEditPanel } from "@/components/customers/customer-edit-panel"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import { Button } from "@/components/ui/button"
import {
  classifyInvoiceDeliveryRequirement,
  getInvoiceDeliveryMethodLabel,
  isEmailDeliveryReady,
  isPeppolDeliveryReadyForCustomer,
} from "@/lib/invoice-delivery"

const amountFormatter = new Intl.NumberFormat("nl-BE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatCurrencyTotals(totals: Record<string, number>) {
  const entries = Object.entries(totals).filter(([, amount]) => amount > 0)
  if (entries.length === 0) return "—"
  return entries
    .map(([currency, amount]) => `${currency} ${amountFormatter.format(amount / 100)}`)
    .join(" · ")
}

type InvoiceFilter = "all" | "open" | "paid"

export function CustomerDetail({
  customer: initialCustomer,
  invoices,
  sellerCountryCode,
}: {
  customer: Customer
  invoices: Invoice[]
  sellerCountryCode?: string | null
}) {
  const [customer, setCustomer] = useState(initialCustomer)
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>("all")

  const billingEmails = Array.isArray(customer.billingEmails) ? (customer.billingEmails as string[]) : []

  const openInvoices = useMemo(
    () => invoices.filter((invoice) => ["sent", "overdue", "partially_paid"].includes(invoice.status)),
    [invoices]
  )
  const overdueInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.status === "overdue"),
    [invoices]
  )
  const paidInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === "paid"), [invoices])
  const otherInvoices = useMemo(
    () => invoices.filter((invoice) => !["sent", "overdue", "partially_paid", "paid"].includes(invoice.status)),
    [invoices]
  )

  const prioritizedInvoices = useMemo(() => {
    if (invoiceFilter === "open") return openInvoices
    if (invoiceFilter === "paid") return paidInvoices
    return [...openInvoices, ...paidInvoices, ...otherInvoices]
  }, [invoiceFilter, openInvoices, paidInvoices, otherInvoices])

  const lastInvoiceAt = useMemo(() => {
    if (invoices.length === 0) return null
    return invoices.reduce<Date | null>((latest, invoice) => {
      if (!latest) return invoice.issuedAt
      return invoice.issuedAt > latest ? invoice.issuedAt : latest
    }, null)
  }, [invoices])

  const openBalanceByCurrency = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const invoice of openInvoices) {
      const remaining = Math.max(invoice.total - (invoice.paidAmount ?? 0), 0)
      if (remaining <= 0) continue
      const currency = invoice.currency || "EUR"
      totals[currency] = (totals[currency] || 0) + remaining
    }
    return totals
  }, [openInvoices])

  const deliveryCompliance = classifyInvoiceDeliveryRequirement({
    sellerCountry: sellerCountryCode,
    customerCountry: customer.country,
    customerVatNumber: customer.vatNumber,
    customerPeppolId: customer.peppolId,
    customerDeliveryPreference: customer.invoiceDeliveryMethod,
  })
  const deliveryMethod = deliveryCompliance.defaultMethod
  const deliveryMethodLabel = getInvoiceDeliveryMethodLabel(deliveryMethod)
  const deliveryReady = !deliveryCompliance.scopeKnown
    ? false
    : deliveryMethod === "email_pdf"
      ? isEmailDeliveryReady(customer) && (!deliveryCompliance.requiresStructuredInvoice || deliveryCompliance.allowEmailFallback)
      : isPeppolDeliveryReadyForCustomer(customer)
  const deliveryWarning = !deliveryCompliance.scopeKnown
    ? deliveryCompliance.message ?? "Complete this customer's compliance details before sending."
    : deliveryMethod === "email_pdf"
      ? deliveryCompliance.requiresStructuredInvoice && !deliveryCompliance.allowEmailFallback
        ? deliveryCompliance.message ?? "This invoice must be sent via PEPPOL."
        : "Add a billing email before sending by email."
      : "Add a PEPPOL ID and full postal address before sending via PEPPOL."

  return (
    <div className="max-w-5xl">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <CustomerAvatar name={customer.name} website={customer.website} size="lg" />
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{customer.name}</h2>
            {customer.email && <p className="mt-1 text-muted-foreground">{customer.email}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CustomerEditPanel
            customer={customer}
            onSuccess={setCustomer}
            trigger={
              <Button variant="outline">
                <Pencil className="h-4 w-4" />
                Edit customer
              </Button>
            }
          />
          <Button asChild>
            <Link href={`/invoices/new?customerId=${customer.id}`}>
              <Plus className="h-4 w-4" />
              New Invoice
            </Link>
          </Button>
        </div>
      </header>

      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Open invoices</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{openInvoices.length}</div>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Overdue</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">{overdueInvoices.length}</div>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Open balance</div>
          <div className="mt-2 text-lg font-semibold tabular-nums">
            {formatCurrencyTotals(openBalanceByCurrency)}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Last invoice</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {lastInvoiceAt
              ? new Date(lastInvoiceAt).toLocaleDateString("nl-BE", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </div>
        </div>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border overflow-hidden">
          <div className="border-b px-4 py-3 flex items-center justify-between gap-3">
            <h3 className="font-semibold">Invoices</h3>
            <div className="flex items-center gap-1 rounded-full bg-muted/50 p-1 text-xs">
              {(["all", "open", "paid"] as const).map((value) => {
                const isActive = invoiceFilter === value
                return (
                  <button
                    key={value}
                    onClick={() => setInvoiceFilter(value)}
                    className={`px-3 py-1 rounded-full transition-colors ${
                      isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    {value === "all" ? "All" : value === "open" ? "Open" : "Paid"}
                  </button>
                )
              })}
            </div>
          </div>
          {invoices.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No invoices yet.</p>
          ) : prioritizedInvoices.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No invoices in this view.</p>
          ) : (
            <div className="divide-y">
              {prioritizedInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {new Date(inv.issuedAt).toLocaleDateString("nl-BE")}
                      {inv.subject ? ` · ${inv.subject}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      <div className="font-mono tabular-nums">
                        {inv.currency} {(inv.total / 100).toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        due {new Date(inv.dueDate).toLocaleDateString("nl-BE")}
                      </div>
                    </div>
                    <InvoiceStatusBadge status={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold">Billing Details</h3>
            <CustomerEditPanel
              customer={customer}
              onSuccess={setCustomer}
              trigger={
                <Button variant="ghost" size="sm">
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              }
            />
          </div>
          {!deliveryReady && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center justify-between gap-2">
              <span>{deliveryWarning}</span>
              <CustomerEditPanel
                customer={customer}
                onSuccess={setCustomer}
                trigger={
                  <button className="text-xs font-semibold underline underline-offset-2">
                    Fix now
                  </button>
                }
              />
            </div>
          )}
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Primary email</div>
              <div className="mt-1">{customer.email || "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Billing emails</div>
              <div className="mt-1 whitespace-pre-line">
                {billingEmails.length > 0 ? billingEmails.join("\n") : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">VAT number</div>
              <div className="mt-1">{customer.vatNumber || "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">PEPPOL ID</div>
              <div className="mt-1">{customer.peppolId || "—"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Delivery method</div>
              <div className="mt-1">{deliveryMethodLabel}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Address</div>
              <div className="mt-1 whitespace-pre-line">
                {[
                  [customer.street, customer.houseNumber].filter(Boolean).join(" "),
                  [customer.zipCode, customer.city].filter(Boolean).join(" "),
                  customer.country,
                ]
                  .filter(Boolean)
                  .join("\n") || "—"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Contact</div>
              <div className="mt-1">{customer.contactPerson || customer.phone || "—"}</div>
            </div>
            <Link href={`/invoices/new?customerId=${customer.id}`} className="inline-flex items-center gap-2 text-sm font-medium">
              Draft a new invoice
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
