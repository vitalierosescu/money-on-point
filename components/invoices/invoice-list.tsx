"use client"

import { useState } from "react"
import Link from "next/link"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Prisma } from "@/prisma/client"

type InvoiceWithCustomer = Prisma.InvoiceGetPayload<{
  include: { customer: true; payments: true }
}>

type CustomerForFilter = { id: string; name: string }

type InvoiceListProps = {
  invoices: InvoiceWithCustomer[]
  customers: CustomerForFilter[]
}

function formatCurrency(amount: number, currency: string) {
  return `${currency} ${(amount / 100).toFixed(2)}`
}

function groupByMonth(invoices: InvoiceWithCustomer[]) {
  const groups: Record<string, { label: string; invoices: InvoiceWithCustomer[] }> = {}
  for (const invoice of invoices) {
    const date = new Date(invoice.issuedAt)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    const label = date.toLocaleDateString("en-BE", { month: "long", year: "numeric" })
    if (!groups[key]) groups[key] = { label, invoices: [] }
    groups[key].invoices.push(invoice)
  }
  return Object.entries(groups)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, group]) => group)
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
]

export function InvoiceList({ invoices, customers }: InvoiceListProps) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [customerFilter, setCustomerFilter] = useState("all")

  const filtered = invoices.filter((inv) => {
    if (statusFilter !== "all" && inv.status !== statusFilter) return false
    if (customerFilter !== "all" && inv.customerId !== customerFilter) return false
    if (search) {
      const s = search.toLowerCase()
      if (
        !inv.invoiceNumber.toLowerCase().includes(s) &&
        !inv.customer?.name.toLowerCase().includes(s) &&
        !(inv.subject?.toLowerCase().includes(s))
      )
        return false
    }
    return true
  })

  const grouped = groupByMonth(filtered)

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p>No invoices yet.</p>
        <p className="text-sm mt-1">Create your first invoice to get started.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search invoices..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {grouped.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No invoices match the current filters.</p>
      ) : (
        grouped.map(({ label, invoices: group }) => (
          <div key={label}>
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">{label}</h3>
            <div className="border rounded-lg divide-y">
              {group.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between p-4 hover:bg-muted/50">
                  <div className="flex items-center gap-4 min-w-0">
                    <Link href={`/invoices/${invoice.id}`} className="font-medium hover:underline shrink-0">
                      {invoice.invoiceNumber}
                    </Link>
                    <span className="text-muted-foreground truncate hidden md:block">
                      {invoice.customer?.name}
                    </span>
                    {invoice.subject && (
                      <span className="text-sm text-muted-foreground truncate hidden lg:block">
                        {invoice.subject}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-sm hidden md:block">
                      {new Date(invoice.dueDate).toLocaleDateString()}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(invoice.total, invoice.currency)}
                    </span>
                    <InvoiceStatusBadge status={invoice.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
