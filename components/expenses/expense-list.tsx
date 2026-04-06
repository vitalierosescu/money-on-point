"use client"

import { bulkDeleteExpenseAction, bulkMarkExpensePaidAction, bulkMarkExpenseToPayAction } from "@/app/(app)/expenses/actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { getExpenseAmountForCurrency, getExpenseStatusMeta, normalizeExpenseStatus, type ExpenseStatus } from "@/lib/expense-status"
import { t } from "@/lib/i18n"
import { formatLocaleCurrency, formatLocaleDate, formatLocaleNumber, type UiLocale } from "@/lib/locale"
import { Category, Transaction } from "@/prisma/client"
import { useRouter } from "next/navigation"
import React, { useMemo, useState, useTransition } from "react"
import { Trash2 } from "lucide-react"

type ExpenseListProps = {
  expenses: (Transaction & { category?: Category | null })[]
  defaultCurrency: string
  locale: UiLocale
}

type TabStatus = "all" | ExpenseStatus

function getTabConfig(locale: UiLocale): Array<{ value: TabStatus; label: string }> {
  return [
    { value: "all", label: t(locale, "expenses.tabsAll") },
    { value: "unpaid", label: t(locale, "expenses.tabsUnpaid") },
    { value: "to_pay", label: t(locale, "expenses.tabsToPay") },
    { value: "paid", label: t(locale, "expenses.tabsPaid") },
    { value: "overdue", label: t(locale, "expenses.tabsOverdue") },
  ]
}

function groupByMonth(expenses: (Transaction & { category?: Category | null })[], locale: UiLocale) {
  const groups: Record<string, { label: string; rows: (Transaction & { category?: Category | null })[] }> = {}

  for (const expense of expenses) {
    const date = new Date(expense.issuedAt ?? expense.createdAt)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    const label = formatLocaleDate(date, locale, { month: "long", year: "numeric" })
    if (!groups[key]) {
      groups[key] = { label, rows: [] }
    }
    groups[key].rows.push(expense)
  }

  return Object.entries(groups)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, group]) => group)
}

export function ExpenseList({ expenses, defaultCurrency, locale }: ExpenseListProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabStatus>("all")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const tabConfig = useMemo(() => getTabConfig(locale), [locale])

  const counts = useMemo(() => {
    const nextCounts: Record<string, number> = {}
    for (const expense of expenses) {
      const status = normalizeExpenseStatus(expense.status)
      nextCounts[status] = (nextCounts[status] ?? 0) + 1
    }
    return nextCounts
  }, [expenses])

  const filtered = useMemo(
    () => (activeTab === "all" ? expenses : expenses.filter((expense) => normalizeExpenseStatus(expense.status) === activeTab)),
    [activeTab, expenses]
  )

  const filteredTotal = useMemo(() => {
    const sum = filtered.reduce((acc, expense) => acc + getExpenseAmountForCurrency(expense, defaultCurrency), 0)
    return formatLocaleCurrency(sum, defaultCurrency, locale)
  }, [defaultCurrency, filtered, locale])

  const grouped = useMemo(() => groupByMonth(filtered, locale), [filtered, locale])

  const allSelected = filtered.length > 0 && filtered.every((expense) => selectedIds.has(expense.id))
  const someSelected = filtered.some((expense) => selectedIds.has(expense.id)) && !allSelected

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleSelectAll() {
    if (allSelected || someSelected) {
      setSelectedIds(new Set())
      return
    }

    setSelectedIds(new Set(filtered.map((expense) => expense.id)))
  }

  function handleBulkDownload() {
    expenses
      .filter((expense) => selectedIds.has(expense.id))
      .forEach((expense) => {
        const files = Array.isArray(expense.files) ? (expense.files as string[]) : []
        files.forEach((fileId) => window.open(`/files/download/${fileId}`, "_blank"))
      })
  }

  function handleBulkMarkPaid() {
    startTransition(async () => {
      await bulkMarkExpensePaidAction(Array.from(selectedIds))
      setSelectedIds(new Set())
      router.refresh()
    })
  }

  function handleBulkMarkToPay() {
    startTransition(async () => {
      await bulkMarkExpenseToPayAction(Array.from(selectedIds))
      setSelectedIds(new Set())
      router.refresh()
    })
  }

  function handleBulkDelete() {
    if (!window.confirm(t(locale, "expenses.bulkDeleteConfirm"))) {
      return
    }

    startTransition(async () => {
      await bulkDeleteExpenseAction(Array.from(selectedIds))
      setSelectedIds(new Set())
      router.refresh()
    })
  }

  if (expenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p>{t(locale, "expenses.emptyTitle")}</p>
        <p className="text-sm mt-1">{t(locale, "expenses.emptyDescription")}</p>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex border-b overflow-x-auto">
        {tabConfig.map((tab) => {
          const count = tab.value === "all" ? expenses.length : (counts[tab.value] ?? 0)
          const isActive = activeTab === tab.value
          const isOverdue = tab.value === "overdue"

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setActiveTab(tab.value)
                setSelectedIds(new Set())
              }}
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
                      ? "bg-destructive/10 text-destructive"
                      : isActive
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {formatLocaleNumber(count, locale)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 shadow-sm">
          <span className="text-sm text-muted-foreground">
            {t(locale, "expenses.bulkSelected", { count: formatLocaleNumber(selectedIds.size, locale) })}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleBulkMarkPaid} disabled={isPending}>
              {t(locale, "expenses.bulkMarkPaid")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkMarkToPay} disabled={isPending}>
              {t(locale, "expenses.bulkMarkToPay")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkDelete} disabled={isPending}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t(locale, "expenses.bulkDelete")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkDownload} disabled={isPending}>
              {t(locale, "expenses.bulkDownload")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={isPending}>
              {t(locale, "expenses.bulkClear")}
            </Button>
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20">
          <span className="text-xs text-muted-foreground">
            {t(locale, "expenses.filteredSummary", {
              count: formatLocaleNumber(filtered.length, locale),
              label: t(locale, filtered.length === 1 ? "expenses.countExpense" : "expenses.countExpenses"),
            })}
          </span>
          <span className="text-xs font-mono font-medium text-foreground tabular-nums">{filteredTotal}</span>
        </div>
      )}

      {grouped.length === 0 && (
        <p className="text-center text-muted-foreground py-10 text-sm">{t(locale, "expenses.noResultsForStatus")}</p>
      )}

      {grouped.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/20">
              <th className="w-10 px-4 py-3">
                <Checkbox
                  checked={allSelected}
                  ref={(element) => {
                    if (element) {
                      ;(element as HTMLButtonElement & { indeterminate?: boolean }).indeterminate = someSelected
                    }
                  }}
                  onCheckedChange={toggleSelectAll}
                  aria-label={t(locale, "expenses.bulkSelected", { count: formatLocaleNumber(filtered.length, locale) })}
                />
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t(locale, "expenses.tableVendor")}
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                {t(locale, "expenses.tableDate")}
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                {t(locale, "expenses.tableCategory")}
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t(locale, "expenses.tableAmount")}
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                {t(locale, "expenses.tableStatus")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {grouped.map(({ label, rows }) => (
              <React.Fragment key={label}>
                <tr>
                  <td colSpan={6} className="px-4 py-1.5 bg-muted/10 border-b border-t">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{label}</span>
                  </td>
                </tr>

                {rows.map((expense) => {
                  const statusMeta = getExpenseStatusMeta(expense.status, locale)
                  const issuedAt = expense.issuedAt ? new Date(expense.issuedAt) : new Date(expense.createdAt)
                  const dueDate = expense.dueDate ? new Date(expense.dueDate) : null
                  const isSelected = selectedIds.has(expense.id)

                  return (
                    <tr
                      key={expense.id}
                      className={`cursor-pointer transition-colors hover:bg-muted/30 ${isSelected ? "bg-muted/20" : ""}`}
                      onClick={() => router.push(`/expenses/${expense.id}`)}
                    >
                      <td className="w-10 px-4 py-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(expense.id)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`${t(locale, "expenses.tableVendor")}: ${expense.merchant ?? expense.name ?? t(locale, "expenses.detailFallbackTitle")}`}
                        />
                      </td>

                      <td className="px-3 py-3 max-w-0">
                        <div className="font-medium truncate">{expense.merchant ?? expense.name ?? "—"}</div>
                        {expense.name && expense.name !== expense.merchant && (
                          <div className="text-xs text-muted-foreground truncate">{expense.name}</div>
                        )}
                      </td>

                      <td className="px-3 py-3 hidden sm:table-cell whitespace-nowrap">
                        <span className="font-mono text-sm text-muted-foreground tabular-nums">
                          {formatLocaleDate(issuedAt, locale, { day: "2-digit", month: "short", year: "2-digit" })}
                        </span>
                        {dueDate && statusMeta.value !== "paid" && (
                          <div
                            className={`text-xs tabular-nums font-mono ${
                              statusMeta.value === "overdue" ? "text-destructive font-medium" : "text-muted-foreground"
                            }`}
                          >
                            {statusMeta.value === "overdue" ? t(locale, "expenses.overdueLabel") : t(locale, "expenses.dueLabel")}{" "}
                            {formatLocaleDate(dueDate, locale, { day: "2-digit", month: "short" })}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 hidden md:table-cell">
                        {expense.category ? (
                          <span className="text-xs text-muted-foreground">{expense.category.name}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/30">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className="font-mono text-sm tabular-nums font-semibold text-foreground">
                          {expense.total === null
                            ? "—"
                            : formatLocaleCurrency(expense.total, expense.currencyCode ?? "EUR", locale)}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-right hidden sm:table-cell">
                        <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
