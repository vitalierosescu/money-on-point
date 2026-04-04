"use client"

import { useState, useMemo } from "react"
import { Category, Transaction } from "@/prisma/client"
import { ExpenseDrawer } from "./expense-drawer"

type ExpenseListProps = {
  expenses: (Transaction & { category?: Category | null })[]
  categories: Category[]
}

type TabStatus = "all" | "unpaid" | "to_pay" | "paid" | "overdue"

const TAB_CONFIG: { value: TabStatus; label: string }[] = [
  { value: "unpaid", label: "Nieuw" },
  { value: "to_pay", label: "Te betalen" },
  { value: "paid",   label: "Betaald" },
  { value: "overdue", label: "Achterstallig" },
  { value: "all",    label: "Alles" },
]

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  unpaid:  { label: "Nieuw",         className: "bg-yellow-100 text-yellow-800" },
  to_pay:  { label: "Te betalen",    className: "bg-blue-100 text-blue-800" },
  paid:    { label: "Betaald",       className: "bg-green-100 text-green-800" },
  overdue: { label: "Achterstallig", className: "bg-red-100 text-red-800" },
}

function groupByMonth(expenses: (Transaction & { category?: Category | null })[]) {
  const groups: Record<string, { label: string; rows: (Transaction & { category?: Category | null })[] }> = {}
  for (const exp of expenses) {
    const date = new Date(exp.issuedAt ?? exp.createdAt)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    const label = date.toLocaleDateString("nl-BE", { month: "long", year: "numeric" })
    if (!groups[key]) groups[key] = { label, rows: [] }
    groups[key].rows.push(exp)
  }
  return Object.entries(groups)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, g]) => g)
}

export function ExpenseList({ expenses, categories }: ExpenseListProps) {
  const [activeTab, setActiveTab] = useState<TabStatus>("unpaid")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [openExpense, setOpenExpense] = useState<(Transaction & { category?: Category | null }) | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of expenses) {
      const s = e.status ?? "unpaid"
      c[s] = (c[s] ?? 0) + 1
    }
    return c
  }, [expenses])

  const filtered = useMemo(
    () => activeTab === "all" ? expenses : expenses.filter((e) => (e.status ?? "unpaid") === activeTab),
    [expenses, activeTab]
  )

  const grouped = groupByMonth(filtered)

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleBulkDownload() {
    const selected = expenses.filter((e) => selectedIds.has(e.id))
    selected.forEach((e) => {
      const files = Array.isArray(e.files) ? (e.files as string[]) : []
      files.forEach((fileId) => window.open(`/files/download/${fileId}`, "_blank"))
    })
  }

  if (expenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p>Nog geen expenses.</p>
        <p className="text-sm mt-1">Upload je eerste factuur via de Upload knop.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Status tabs */}
      <div className="flex border-b overflow-x-auto">
        {TAB_CONFIG.map((tab) => {
          const count = tab.value === "all"
            ? expenses.length
            : (counts[tab.value] ?? 0)
          const isOverdue = tab.value === "overdue"
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

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-b text-sm">
          <span className="text-blue-700">{selectedIds.size} geselecteerd</span>
          <button
            onClick={handleBulkDownload}
            className="text-sm font-medium bg-blue-600 text-white px-3 py-1 rounded-md"
          >
            Download PDFs
          </button>
        </div>
      )}

      {/* No results */}
      {grouped.length === 0 && (
        <p className="text-center text-muted-foreground py-10">
          Geen expenses voor deze status.
        </p>
      )}

      {/* Grouped rows */}
      {grouped.map(({ label, rows }) => (
        <div key={label}>
          <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30">
            {label}
          </div>
          <div className="divide-y">
            {rows.map((expense) => {
              const status = expense.status ?? "unpaid"
              const badge = STATUS_BADGE[status]
              const issuedAt = expense.issuedAt ? new Date(expense.issuedAt) : new Date(expense.createdAt)
              const dueDate = expense.dueDate ? new Date(expense.dueDate) : null

              return (
                <div
                  key={expense.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer"
                  onClick={() => setOpenExpense(expense)}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(expense.id)}
                    onChange={(e) => { e.stopPropagation(); toggleSelect(expense.id) }}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {expense.merchant ?? expense.name ?? "—"}
                      </span>
                      {expense.name && expense.name !== expense.merchant && (
                        <span className="text-xs text-muted-foreground truncate hidden md:block">
                          {expense.name}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {issuedAt.toLocaleDateString("nl-BE", { day: "2-digit", month: "short" })}
                      {expense.category && ` · ${expense.category.name}`}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <span className={`font-medium text-sm ${status === "overdue" ? "text-red-600" : ""}`}>
                      {expense.total !== null
                        ? `${expense.currencyCode ?? "EUR"} ${(expense.total / 100).toFixed(2)}`
                        : "—"}
                    </span>
                    {dueDate && status !== "paid" && (
                      <span className={`text-xs ${status === "overdue" ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        {status === "overdue" ? "Vervallen" : "Vervalt"}{" "}
                        {dueDate.toLocaleDateString("nl-BE", { day: "2-digit", month: "short" })}
                      </span>
                    )}
                    {badge && status !== "unpaid" && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {openExpense && (
        <ExpenseDrawer
          expense={openExpense}
          open={true}
          onClose={() => setOpenExpense(null)}
          categories={categories}
        />
      )}
    </div>
  )
}
