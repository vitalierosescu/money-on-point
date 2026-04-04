"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import { InvoiceDrawer } from "@/components/invoices/invoice-drawer"
import { Prisma } from "@/prisma/client"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

type InvoiceWithCustomer = Prisma.InvoiceGetPayload<{ include: { customer: true } }>

type TabStatus = "all" | "draft" | "sent" | "overdue" | "partially_paid" | "paid" | "cancelled"

const TAB_CONFIG: { value: TabStatus; label: string }[] = [
  { value: "all",            label: "Alles" },
  { value: "draft",          label: "Draft" },
  { value: "sent",           label: "Verzonden" },
  { value: "overdue",        label: "Achterstallig" },
  { value: "partially_paid", label: "Gedeeltelijk" },
  { value: "paid",           label: "Betaald" },
  { value: "cancelled",      label: "Geannuleerd" },
]

type InvoiceListProps = {
  invoices: InvoiceWithCustomer[]
}

function groupByMonth(invoices: InvoiceWithCustomer[]) {
  const groups: Record<string, { label: string; rows: InvoiceWithCustomer[] }> = {}
  for (const inv of invoices) {
    const date = new Date(inv.issuedAt)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    const label = date.toLocaleDateString("nl-BE", { month: "long", year: "numeric" })
    if (!groups[key]) groups[key] = { label, rows: [] }
    groups[key].rows.push(inv)
  }
  return Object.entries(groups)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, g]) => g)
}

export function InvoiceList({ invoices }: InvoiceListProps) {
  const [activeTab, setActiveTab] = useState<TabStatus>("all")
  const [openInvoice, setOpenInvoice] = useState<InvoiceWithCustomer | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const inv of invoices) {
      c[inv.status] = (c[inv.status] ?? 0) + 1
    }
    return c
  }, [invoices])

  const filtered = useMemo(
    () => activeTab === "all" ? invoices : invoices.filter((inv) => inv.status === activeTab),
    [invoices, activeTab]
  )

  const grouped = groupByMonth(filtered)

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
      {/* Status tabs */}
      <div className="flex border-b overflow-x-auto">
        {TAB_CONFIG.map((tab) => {
          const count = tab.value === "all" ? invoices.length : (counts[tab.value] ?? 0)
          const isOverdue = tab.value === "overdue"
          if (tab.value !== "all" && count === 0) return null
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.value
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${
                    isOverdue && count > 0
                      ? "bg-red-100 text-red-700"
                      : activeTab === tab.value
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

      {grouped.length === 0 && (
        <p className="text-center text-muted-foreground py-10">Geen facturen voor deze status.</p>
      )}

      {grouped.map(({ label, rows }) => (
        <div key={label}>
          <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30">
            {label}
          </div>
          <div className="divide-y">
            {rows.map((invoice) => {
              const dueDate = new Date(invoice.dueDate)
              return (
                <div
                  key={invoice.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer"
                  onClick={() => setOpenInvoice(invoice)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {invoice.customer?.name ?? "—"}
                      </span>
                      <span className="text-xs text-muted-foreground hidden md:block">
                        {invoice.invoiceNumber}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(invoice.issuedAt).toLocaleDateString("nl-BE", { day: "2-digit", month: "short" })}
                      {invoice.subject && ` · ${invoice.subject}`}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <span className="font-medium text-sm">
                      {invoice.currency} {(invoice.total / 100).toFixed(2)}
                    </span>
                    {invoice.status !== "paid" && invoice.status !== "cancelled" && (
                      <span className={`text-xs ${invoice.status === "overdue" ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        {invoice.status === "overdue" ? "Vervallen" : "Vervalt"}{" "}
                        {dueDate.toLocaleDateString("nl-BE", { day: "2-digit", month: "short" })}
                      </span>
                    )}
                  </div>
                  <InvoiceStatusBadge status={invoice.status} />
                </div>
              )
            })}
          </div>
        </div>
      ))}

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
