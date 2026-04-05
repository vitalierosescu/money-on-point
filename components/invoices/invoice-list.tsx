"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import { InvoiceDrawer } from "@/components/invoices/invoice-drawer"
import {
  getInvoiceDeliveryMethod,
  getInvoiceDeliveryMethodLabel,
  getInvoiceDeliveryReadiness,
} from "@/lib/invoice-delivery"
import { InvoiceWithCustomer } from "@/models/invoices"
import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const amountFormatter = new Intl.NumberFormat("nl-BE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

type InvoiceListProps = {
  invoices: InvoiceWithCustomer[]
}

type TabStatus = "all" | "draft" | "sent" | "overdue" | "paid"
type DeliveryFilter = "all" | "ready_to_send" | "peppol_ready" | "email_ready" | "blocked"

const TAB_CONFIG: { value: TabStatus; label: string }[] = [
  { value: "all", label: "Alles" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Verzonden" },
  { value: "overdue", label: "Achterstallig" },
  { value: "paid", label: "Betaald" },
]

function formatCurrencyTotals(entries: InvoiceWithCustomer[], amountForInvoice: (invoice: InvoiceWithCustomer) => number) {
  const totals = new Map<string, number>()

  for (const invoice of entries) {
    const amount = amountForInvoice(invoice)
    if (!amount) continue
    const currency = invoice.currency || "EUR"
    totals.set(currency, (totals.get(currency) ?? 0) + amount)
  }

  if (totals.size === 0) return "EUR 0,00"

  return Array.from(totals.entries())
    .map(([currency, amount]) => `${currency} ${amountFormatter.format(amount / 100)}`)
    .join(" · ")
}

function CustomerAvatar({ name }: { name: string }) {
  return (
    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-[10px] font-semibold shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function DueDateCell({ dueDate, status }: { dueDate: Date | null | undefined; status: string }) {
  if (!dueDate) {
    return <span className="text-muted-foreground">—</span>
  }

  if (status === "paid" || status === "cancelled") {
    return <span className="text-muted-foreground">—</span>
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000)

  const dateStr = new Date(dueDate).toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "short",
  })

  let subText = ""
  let subColor = "text-muted-foreground"
  if (diffDays === 0) {
    subText = "vandaag"
    subColor = "text-orange-600"
  } else if (diffDays > 0) {
    subText = `over ${diffDays} ${diffDays === 1 ? "dag" : "dagen"}`
    subColor = diffDays <= 7 ? "text-orange-600" : "text-muted-foreground"
  } else {
    subText = `${Math.abs(diffDays)} dagen geleden`
    subColor = "text-red-600"
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span>{dateStr}</span>
      <span className={`text-xs ${subColor}`}>{subText}</span>
    </div>
  )
}

export function InvoiceList({ invoices }: InvoiceListProps) {
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<TabStatus>("all")
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all")
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("all")
  const [openInvoice, setOpenInvoice] = useState<InvoiceWithCustomer | null>(null)

  const customerNames = useMemo(() => {
    const names = new Set<string>()
    for (const inv of invoices) {
      if (inv.customer?.name) names.add(inv.customer.name)
    }
    return Array.from(names).sort()
  }, [invoices])

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      draft: 0,
      sent: 0,
      overdue: 0,
      paid: 0,
    }
    for (const inv of invoices) {
      const s = inv.status ?? "draft"
      if (s === "partially_paid") {
        c.sent += 1
      } else if (s in c) {
        c[s] += 1
      }
    }
    return c
  }, [invoices])

  const filtered = useMemo(() => {
    let result = invoices

    if (activeTab !== "all") {
      result = result.filter((inv) => {
        if (activeTab === "sent") {
          return inv.status === "sent" || inv.status === "partially_paid"
        }
        return inv.status === activeTab
      })
    }

    if (selectedCustomer !== "all") {
      result = result.filter((inv) => inv.customer?.name === selectedCustomer)
    }

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          (inv.customer?.name ?? "").toLowerCase().includes(q)
      )
    }

    if (deliveryFilter !== "all") {
      result = result.filter((inv) => {
        const readiness = getInvoiceDeliveryReadiness(inv)
        if (deliveryFilter === "ready_to_send") return readiness.isReady
        if (deliveryFilter === "blocked") return !readiness.isReady
        if (deliveryFilter === "peppol_ready") return readiness.method === "peppol" && readiness.isReady
        if (deliveryFilter === "email_ready") return readiness.method === "email_pdf" && readiness.isReady
        return true
      })
    }

    return result
  }, [invoices, activeTab, selectedCustomer, search, deliveryFilter])

  const summaryCards = useMemo(() => {
    const openInvoices = invoices.filter((invoice) =>
      invoice.status === "sent" || invoice.status === "overdue" || invoice.status === "partially_paid"
    )
    const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue")

    const now = new Date()
    const paidThisMonth = invoices.filter((invoice) => {
      if (invoice.status !== "paid" || !invoice.paidAt) return false
      const paidAt = new Date(invoice.paidAt)
      return paidAt.getFullYear() === now.getFullYear() && paidAt.getMonth() === now.getMonth()
    })

    const draftInvoices = invoices.filter((invoice) => invoice.status === "draft")
    const sendReadyDrafts = draftInvoices.filter((invoice) => getInvoiceDeliveryReadiness(invoice).isReady)
    const blockedDrafts = draftInvoices.length - sendReadyDrafts.length

    return [
      {
        label: "Openstaand",
        value: String(openInvoices.length),
        tone: "border-amber-200 bg-amber-50/70",
        detail: formatCurrencyTotals(openInvoices, (invoice) => Math.max(invoice.total - invoice.paidAmount, 0)),
        note: openInvoices.length === 1 ? "1 invoice wacht op betaling" : "facturen wachten op betaling",
      },
      {
        label: "Achterstallig",
        value: String(overdueInvoices.length),
        tone: overdueInvoices.length > 0 ? "border-rose-200 bg-rose-50/80" : "border-border bg-card",
        detail: formatCurrencyTotals(overdueInvoices, (invoice) => Math.max(invoice.total - invoice.paidAmount, 0)),
        note: overdueInvoices.length === 0 ? "niets dringend" : "vereist opvolging",
      },
      {
        label: "Betaald deze maand",
        value: String(paidThisMonth.length),
        tone: "border-emerald-200 bg-emerald-50/80",
        detail: formatCurrencyTotals(paidThisMonth, (invoice) => invoice.paidAmount || invoice.total),
        note: now.toLocaleDateString("nl-BE", { month: "long", year: "numeric" }),
      },
      {
        label: "Verzendklaar",
        value: String(sendReadyDrafts.length),
        tone: sendReadyDrafts.length > 0 ? "border-sky-200 bg-sky-50/80" : "border-border bg-card",
        detail: blockedDrafts > 0 ? `${blockedDrafts} geblokkeerd` : "geen blokkades",
        note: draftInvoices.length === 0 ? "geen drafts" : `${draftInvoices.length} draft${draftInvoices.length === 1 ? "" : "s"} in totaal`,
      },
    ]
  }, [invoices])

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
        <p>Nog geen facturen.</p>
        <Link href="/invoices/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Eerste factuur maken
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className={`rounded-xl border px-4 py-3 ${card.tone}`}>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{card.label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{card.value}</div>
            <div className="mt-2 text-sm font-medium">{card.detail}</div>
            <div className="mt-1 text-xs text-muted-foreground">{card.note}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center border-b overflow-x-auto">
        <div className="flex flex-1 overflow-x-auto">
          {TAB_CONFIG.map((tab) => {
            const count = tab.value === "all" ? invoices.length : (counts[tab.value] ?? 0)
            const isActive = activeTab === tab.value
            const isOverdue = tab.value === "overdue"
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${
                      isOverdue
                        ? "bg-red-100 text-red-700"
                        : isActive
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {customerNames.length > 1 && (
          <div className="shrink-0 px-3 pb-1">
            <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
              <SelectTrigger className="h-8 text-xs w-[160px]">
                <SelectValue placeholder="Alle klanten" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle klanten</SelectItem>
                {customerNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 my-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Facturen zoeken..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={deliveryFilter} onValueChange={(value) => setDeliveryFilter(value as DeliveryFilter)}>
          <SelectTrigger className="h-9 w-[180px] text-sm">
            <SelectValue placeholder="Delivery filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All delivery states</SelectItem>
            <SelectItem value="ready_to_send">Ready to send</SelectItem>
            <SelectItem value="peppol_ready">PEPPOL-ready</SelectItem>
            <SelectItem value="email_ready">Email-ready</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Link href="/invoices/new">
          <Button size="icon" className="h-9 w-9" title="Nieuwe factuur">
            <Plus className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-10 text-sm">Geen facturen gevonden.</p>
      )}

      {filtered.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Factuur nr.
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Vervaldatum
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Klant
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Delivery
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Bedrag
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Uitgifte
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((invoice) => {
                const isCancelled = invoice.status === "cancelled"
                return (
                  <tr
                    key={invoice.id}
                    className={`hover:bg-muted/30 cursor-pointer transition-colors ${isCancelled ? "opacity-40" : ""}`}
                    onClick={() => setOpenInvoice(invoice)}
                  >
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                      <span className={isCancelled ? "line-through" : ""}>
                        {invoice.invoiceNumber}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <InvoiceStatusBadge status={invoice.status} />
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <DueDateCell
                        dueDate={invoice.dueDate ? new Date(invoice.dueDate) : null}
                        status={invoice.status}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <CustomerAvatar name={invoice.customer?.name ?? "?"} />
                        <span className="font-medium truncate max-w-[200px]">
                          {invoice.customer?.name ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <div className="flex flex-col gap-0.5">
                        <span>{getInvoiceDeliveryMethodLabel(getInvoiceDeliveryMethod(invoice))}</span>
                        <span className={`text-xs ${getInvoiceDeliveryReadiness(invoice).isReady ? "text-emerald-600" : "text-amber-600"}`}>
                          {getInvoiceDeliveryReadiness(invoice).isReady ? "ready" : "blocked"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-sm tabular-nums">
                      {invoice.currency}{" "}
                      {amountFormatter.format(invoice.total / 100)}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground text-sm tabular-nums">
                      {new Date(invoice.issuedAt).toLocaleDateString("nl-BE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {openInvoice && (
        <InvoiceDrawer
          invoice={openInvoice}
          open={true}
          onClose={() => setOpenInvoice(null)}
        />
      )}
    </div>
  )
}
