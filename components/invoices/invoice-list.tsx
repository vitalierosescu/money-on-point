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
import { StatCard, type StatCardTone } from "@/components/ui/stat-card"
import { t } from "@/lib/i18n"
import { DEFAULT_UI_LOCALE, getIntlLocale, type UiLocale } from "@/lib/locale"

type InvoiceListProps = {
  invoices: InvoiceWithCustomer[]
  locale?: UiLocale
  hasRecommandCredentials?: boolean
  recommandEnvironmentLabel?: string
  sellerCountryCode?: string | null
}

type TabStatus = "all" | "draft" | "sent" | "overdue" | "paid"
type DeliveryFilter = "all" | "ready_to_send" | "peppol_ready" | "email_ready" | "blocked"

const TAB_KEYS: Record<TabStatus, string> = {
  all: "invoices.tabsAll",
  draft: "invoices.tabsDraft",
  sent: "invoices.tabsSent",
  overdue: "invoices.tabsOverdue",
  paid: "invoices.tabsPaid",
}
const TAB_ORDER: TabStatus[] = ["all", "draft", "sent", "overdue", "paid"]

function formatCurrencyTotals(
  entries: InvoiceWithCustomer[],
  amountForInvoice: (invoice: InvoiceWithCustomer) => number,
  locale: UiLocale
) {
  const formatter = new Intl.NumberFormat(getIntlLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const totals = new Map<string, number>()

  for (const invoice of entries) {
    const amount = amountForInvoice(invoice)
    if (!amount) continue
    const currency = invoice.currency || "EUR"
    totals.set(currency, (totals.get(currency) ?? 0) + amount)
  }

  if (totals.size === 0) return `EUR ${formatter.format(0)}`

  return Array.from(totals.entries())
    .map(([currency, amount]) => `${currency} ${formatter.format(amount / 100)}`)
    .join(" · ")
}

function CustomerAvatar({ name }: { name: string }) {
  return (
    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-[10px] font-semibold shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function DueDateCell({
  dueDate,
  status,
  locale,
}: {
  dueDate: Date | null | undefined
  status: string
  locale: UiLocale
}) {
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

  const dateStr = new Date(dueDate).toLocaleDateString(getIntlLocale(locale), {
    day: "numeric",
    month: "short",
  })

  let subText = ""
  let subColor = "text-muted-foreground"
  if (diffDays === 0) {
    subText = t(locale, "invoices.dueToday")
    subColor = "text-warning"
  } else if (diffDays > 0) {
    subText = diffDays === 1 ? t(locale, "invoices.dueInDay") : t(locale, "invoices.dueInDays", { count: diffDays })
    subColor = diffDays <= 7 ? "text-warning" : "text-muted-foreground"
  } else {
    const absDays = Math.abs(diffDays)
    subText = absDays === 1 ? t(locale, "invoices.overdueDay") : t(locale, "invoices.overdueDays", { count: absDays })
    subColor = "text-destructive"
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span>{dateStr}</span>
      <span className={`text-xs ${subColor}`}>{subText}</span>
    </div>
  )
}

export function InvoiceList({
  invoices,
  locale = DEFAULT_UI_LOCALE,
  hasRecommandCredentials,
  recommandEnvironmentLabel,
  sellerCountryCode,
}: InvoiceListProps) {
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<TabStatus>("all")
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all")
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("all")
  const [openInvoice, setOpenInvoice] = useState<InvoiceWithCustomer | null>(null)
  const amountFormatter = useMemo(
    () =>
      new Intl.NumberFormat(getIntlLocale(locale), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale]
  )

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
        const readiness = getInvoiceDeliveryReadiness(inv, {
          hasRecommandCredentials,
          environmentLabel: recommandEnvironmentLabel,
          sellerCountryCode,
        })
        if (deliveryFilter === "ready_to_send") return readiness.isReady
        if (deliveryFilter === "blocked") return !readiness.isReady
        if (deliveryFilter === "peppol_ready") return readiness.method === "peppol" && readiness.isReady
        if (deliveryFilter === "email_ready") return readiness.method === "email_pdf" && readiness.isReady
        return true
      })
    }

    return result
  }, [
    invoices,
    activeTab,
    selectedCustomer,
    search,
    deliveryFilter,
    hasRecommandCredentials,
    recommandEnvironmentLabel,
    sellerCountryCode,
  ])

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
    const sendReadyDrafts = draftInvoices.filter((invoice) =>
      getInvoiceDeliveryReadiness(invoice, {
        hasRecommandCredentials,
        environmentLabel: recommandEnvironmentLabel,
        sellerCountryCode,
      }).isReady
    )
    const blockedDrafts = draftInvoices.length - sendReadyDrafts.length

    const cards: Array<{
      label: string
      value: string
      tone: StatCardTone
      detail: string
      note: string
    }> = [
      {
        label: t(locale, "invoices.summaryOpen"),
        value: String(openInvoices.length),
        tone: "warning",
        detail: formatCurrencyTotals(openInvoices, (invoice) => Math.max(invoice.total - invoice.paidAmount, 0), locale),
        note:
          openInvoices.length === 1
            ? t(locale, "invoices.summaryOpenNoteOne")
            : t(locale, "invoices.summaryOpenNoteMany"),
      },
      {
        label: t(locale, "invoices.summaryOverdue"),
        value: String(overdueInvoices.length),
        tone: overdueInvoices.length > 0 ? "destructive" : "default",
        detail: formatCurrencyTotals(overdueInvoices, (invoice) => Math.max(invoice.total - invoice.paidAmount, 0), locale),
        note:
          overdueInvoices.length === 0
            ? t(locale, "invoices.summaryOverdueNoneUrgent")
            : t(locale, "invoices.summaryOverdueNeedsAction"),
      },
      {
        label: t(locale, "invoices.summaryPaidThisMonth"),
        value: String(paidThisMonth.length),
        tone: "success",
        detail: formatCurrencyTotals(paidThisMonth, (invoice) => invoice.paidAmount || invoice.total, locale),
        note: now.toLocaleDateString(getIntlLocale(locale), { month: "long", year: "numeric" }),
      },
      {
        label: t(locale, "invoices.summaryReadyToSend"),
        value: String(sendReadyDrafts.length),
        tone: sendReadyDrafts.length > 0 ? "info" : "default",
        detail:
          blockedDrafts > 0
            ? t(locale, "invoices.summaryDraftsBlocked", { count: blockedDrafts })
            : t(locale, "invoices.summaryNoBlockers"),
        note:
          draftInvoices.length === 0
            ? t(locale, "invoices.summaryNoDrafts")
            : draftInvoices.length === 1
              ? t(locale, "invoices.summaryDraftsTotalOne")
              : t(locale, "invoices.summaryDraftsTotalMany", { count: draftInvoices.length }),
      },
    ]
    return cards
  }, [invoices, hasRecommandCredentials, recommandEnvironmentLabel, locale, sellerCountryCode])

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
        <p>{t(locale, "invoices.empty")}</p>
        <Link href="/invoices/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t(locale, "invoices.createFirst")}
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <StatCard
            key={card.label}
            tone={card.tone}
            label={card.label}
            value={<span className="tabular-nums">{card.value}</span>}
            helper={
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-foreground">{card.detail}</div>
                <div className="text-xs text-muted-foreground">{card.note}</div>
              </div>
            }
          />
        ))}
      </div>

      <div className="flex items-center border-b overflow-x-auto">
        <div className="flex flex-1 overflow-x-auto">
          {TAB_ORDER.map((tabValue) => {
            const count = tabValue === "all" ? invoices.length : (counts[tabValue] ?? 0)
            const isActive = activeTab === tabValue
            const isOverdue = tabValue === "overdue"
            return (
              <button
                key={tabValue}
                onClick={() => setActiveTab(tabValue)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(locale, TAB_KEYS[tabValue])}
                {count > 0 && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${
                      isOverdue
                        ? "bg-destructive/10 text-destructive"
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
              <SelectTrigger className="h-9 text-xs w-[160px]">
                <SelectValue placeholder={t(locale, "invoices.filterAllCustomers")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(locale, "invoices.filterAllCustomers")}</SelectItem>
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
            placeholder={t(locale, "invoices.searchPlaceholder")}
            className="pl-9 h-10 text-sm"
          />
        </div>
        <Select value={deliveryFilter} onValueChange={(value) => setDeliveryFilter(value as DeliveryFilter)}>
          <SelectTrigger className="h-10 w-[180px] text-sm">
            <SelectValue placeholder={t(locale, "invoices.deliveryFilter")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t(locale, "invoices.deliveryAll")}</SelectItem>
            <SelectItem value="ready_to_send">{t(locale, "invoices.deliveryReady")}</SelectItem>
            <SelectItem value="peppol_ready">{t(locale, "invoices.deliveryPeppol")}</SelectItem>
            <SelectItem value="email_ready">{t(locale, "invoices.deliveryEmail")}</SelectItem>
            <SelectItem value="blocked">{t(locale, "invoices.deliveryBlocked")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Link href="/invoices/new">
          <Button size="icon" className="h-9 w-9" title={t(locale, "invoices.newInvoice")}>
            <Plus className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-10 text-sm">{t(locale, "invoices.noResults")}</p>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t(locale, "invoices.tableNumber")}
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t(locale, "invoices.tableStatus")}
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t(locale, "invoices.tableDueDate")}
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t(locale, "invoices.tableCustomer")}
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t(locale, "invoices.tableDelivery")}
                </th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t(locale, "invoices.tableAmount")}
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t(locale, "invoices.tableIssued")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((invoice) => {
                const isCancelled = invoice.status === "cancelled"
                const readiness = getInvoiceDeliveryReadiness(invoice, {
                  hasRecommandCredentials,
                  environmentLabel: recommandEnvironmentLabel,
                  sellerCountryCode,
                })
                return (
                  <tr
                    key={invoice.id}
                    className={`hover:bg-secondary/60 cursor-pointer transition-colors ${isCancelled ? "opacity-40" : ""}`}
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
                        locale={locale}
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
                        <span className={`text-xs ${readiness.isReady ? "text-success" : "text-warning"}`}>
                          {readiness.isReady ? t(locale, "invoices.readyLabel") : t(locale, "invoices.blockedLabel")}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-sm tabular-nums">
                      {invoice.currency}{" "}
                      {amountFormatter.format(invoice.total / 100)}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground text-sm tabular-nums">
                      {new Date(invoice.issuedAt).toLocaleDateString(getIntlLocale(locale), {
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
