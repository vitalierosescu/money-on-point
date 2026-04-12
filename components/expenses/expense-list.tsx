"use client"

import {
  bulkDeleteExpenseAction,
  bulkMarkExpensePaidAction,
  bulkMarkExpenseToPayAction,
  createExpenseFieldAction,
  updateExpenseAction,
  updateExpenseFieldVisibilityAction,
} from "@/app/(app)/expenses/actions"
import { updateTableColumnOrderAction, updateTableColumnWidthsAction } from "@/app/(app)/settings/actions"
import { ColumnOrderList } from "@/components/ui/column-order-list"
import { FormSelect } from "@/components/forms/simple"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ResizableTableHead } from "@/components/ui/resizable-table-head"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { getExpenseAmountForCurrency, getExpenseStatusMeta, normalizeExpenseStatus, type ExpenseStatus } from "@/lib/expense-status"
import { getTransactionFieldValue } from "@/lib/fields"
import { t } from "@/lib/i18n"
import { formatLocaleCurrency, formatLocaleDate, formatLocaleNumber, type UiLocale } from "@/lib/locale"
import {
  clampColumnWidth,
  normalizeColumnOrder,
  normalizeColumnWidths,
  reconcileColumnOrder,
  reconcileColumnWidths,
  reorderVisibleColumns,
} from "@/lib/table-column-order"
import { cn } from "@/lib/utils"
import type { ExpenseWithRelations } from "@/models/transactions"
import type { Category, Field, Project } from "@/prisma/client"
import { Check, ChevronDown, EyeOff, Loader2, Plus, Search, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

type ExpenseListProps = {
  expenses: ExpenseWithRelations[]
  categories: Category[]
  fields: Field[]
  projects: Project[]
  defaultCurrency: string
  initialColumnOrder?: string
  initialColumnWidths?: string
  locale: UiLocale
}

type TabStatus = "all" | ExpenseStatus
type VisibilityMap = Record<string, boolean>
type CellOverrideMap = Record<string, string>

function getTabConfig(locale: UiLocale): Array<{ value: TabStatus; label: string }> {
  return [
    { value: "all", label: t(locale, "expenses.tabsAll") },
    { value: "unpaid", label: t(locale, "expenses.tabsUnpaid") },
    { value: "to_pay", label: t(locale, "expenses.tabsToPay") },
    { value: "paid", label: t(locale, "expenses.tabsPaid") },
    { value: "overdue", label: t(locale, "expenses.tabsOverdue") },
  ]
}

function buildVisibilityMap(fields: Field[]): VisibilityMap {
  return fields.reduce<VisibilityMap>((acc, field) => {
    acc[field.code] = field.isVisibleInList
    return acc
  }, {})
}

function formatFieldValue(expense: ExpenseWithRelations, field: Field, defaultCurrency: string, locale: UiLocale) {
  const value = getTransactionFieldValue(expense, field)

  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return <span className="text-muted-foreground/30">—</span>
  }

  switch (field.code) {
    case "issuedAt":
    case "dueDate": {
      const date = new Date(String(value))
      if (Number.isNaN(date.getTime())) {
        return <span className="truncate">{String(value)}</span>
      }
      return (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatLocaleDate(date, locale, { day: "2-digit", month: "short", year: "2-digit" })}
        </span>
      )
    }
    case "total":
      return (
        <span className="font-mono text-sm font-semibold tabular-nums">
          {formatLocaleCurrency(Number(value), expense.currencyCode ?? "EUR", locale)}
        </span>
      )
    case "taxAmount":
      return (
        <span className="font-mono text-sm tabular-nums">
          {formatLocaleCurrency(Number(value), expense.currencyCode ?? "EUR", locale)}
        </span>
      )
    case "convertedTotal":
      return (
        <span className="font-mono text-sm tabular-nums">
          {formatLocaleCurrency(Number(value), expense.convertedCurrencyCode ?? defaultCurrency, locale)}
        </span>
      )
    case "files": {
      const fileCount = Array.isArray(expense.files) ? expense.files.length : 0
      return <span>{formatLocaleNumber(fileCount, locale)}</span>
    }
    default:
      if (field.type === "boolean") {
        return <span>{value ? (locale === "nl" ? "Ja" : "Yes") : (locale === "nl" ? "Nee" : "No")}</span>
      }

      if (field.type === "number") {
        return <span className="font-mono text-sm tabular-nums">{formatLocaleNumber(Number(value), locale)}</span>
      }

      if (field.type === "single_select") {
        return (
          <span className="inline-flex min-h-7 items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">
            {String(value)}
          </span>
        )
      }

      return <span className="block max-w-[280px] truncate">{String(value)}</span>
  }
}

function getDefaultColumnWidth(fieldCode: string) {
  switch (fieldCode) {
    case "name":
    case "merchant":
    case "description":
    case "note":
      return 260
    case "issuedAt":
    case "dueDate":
      return 160
    case "categoryCode":
    case "projectCode":
      return 200
    case "total":
    case "convertedTotal":
    case "taxAmount":
      return 160
    default:
      return 160
  }
}

function getLookupPillStyle(color?: string) {
  if (!color) {
    return {
      className: "border-border bg-secondary text-foreground",
      style: undefined,
    }
  }

  return {
    className: "text-foreground",
    style: {
      backgroundColor: `${color}22`,
      borderColor: `${color}55`,
    },
  }
}

function LookupCellEditor({
  value,
  items,
  locale,
  placeholder,
  pending,
  onChange,
}: {
  value: string
  items: Array<{ code: string; name: string; color?: string }>
  locale: UiLocale
  placeholder: string
  pending: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const selected = items.find((item) => item.code === value)
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return items
    }

    return items.filter((item) => item.name.toLowerCase().includes(needle))
  }, [items, query])
  const selectedStyle = getLookupPillStyle(selected?.color)

  function handleSelect(nextValue: string) {
    onChange(nextValue)
    setOpen(false)
    setQuery("")
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setQuery("")
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-[48px] w-full items-center justify-between gap-2 border border-transparent bg-background px-3 text-left text-sm transition-colors hover:bg-secondary/20",
            open && "rounded-[6px] border-[#2d7ff9] ring-1 ring-[#2d7ff9]",
            !open && "rounded-none",
            !selected && "text-muted-foreground"
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="min-w-0 flex-1 truncate">
            {selected ? (
              <span
                className={cn(
                  "inline-flex max-w-full items-center rounded-full border px-3 py-1 text-sm font-medium",
                  selectedStyle.className
                )}
                style={selectedStyle.style}
              >
                <span className="truncate">{selected.name}</span>
              </span>
            ) : (
              placeholder
            )}
          </span>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={0}
        className="w-[var(--radix-popover-trigger-width)] min-w-[240px] overflow-hidden rounded-[10px] border border-border p-0 shadow-popover"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b p-3">
          <div className="flex items-center gap-2 rounded-[8px] border border-input bg-background px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={locale === "nl" ? "Zoek een optie" : "Find an option"}
              className="h-11 w-full border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto p-3">
          {filteredItems.map((item) => {
            const itemStyle = getLookupPillStyle(item.color)
            const isSelected = item.code === value

            return (
              <button
                key={item.code}
                type="button"
                disabled={pending}
                onClick={() => handleSelect(item.code)}
                className={cn(
                  "flex w-full items-center justify-between rounded-[8px] px-2 py-1.5 text-left transition-colors hover:bg-secondary/50",
                  isSelected && "bg-secondary/50"
                )}
              >
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium",
                    itemStyle.className
                  )}
                  style={itemStyle.style}
                >
                  {item.name}
                </span>
                {isSelected ? <Check className="h-4 w-4 text-muted-foreground" /> : null}
              </button>
            )
          })}
          {value ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => handleSelect("")}
              className="flex w-full items-center justify-between rounded-[8px] px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/50"
            >
              <span>{locale === "nl" ? "Waarde wissen" : "Clear value"}</span>
              <X className="h-4 w-4" />
            </button>
          ) : null}
          {filteredItems.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground">
              {locale === "nl" ? "Geen opties gevonden" : "No options found"}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function AddFieldPopover({
  locale,
  isPending,
  onCreate,
}: {
  locale: UiLocale
  isPending: boolean
  onCreate: (data: { name: string; type: "string" | "single_select"; options?: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState<"string" | "single_select">("string")
  const [options, setOptions] = useState("")

  function reset() {
    setName("")
    setType("string")
    setOptions("")
  }

  function submit() {
    onCreate({ name, type, options })
    setOpen(false)
    reset()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 w-12 items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          onClick={(event) => event.stopPropagation()}
          aria-label={t(locale, "expenses.addField")}
        >
          <Plus className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 space-y-3 p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1">
          <div className="text-sm font-medium">{t(locale, "expenses.newField")}</div>
          <p className="text-xs text-muted-foreground">{t(locale, "expenses.newFieldDescription")}</p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t(locale, "expenses.fieldNameLabel")}</label>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t(locale, "expenses.fieldNamePlaceholder")} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t(locale, "expenses.fieldTypeLabel")}</label>
          <NativeSelect value={type} onChange={(event) => setType(event.target.value as "string" | "single_select")}>
            <option value="string">{t(locale, "expenses.fieldTypeText")}</option>
            <option value="single_select">{t(locale, "expenses.fieldTypeSingleSelect")}</option>
          </NativeSelect>
        </div>
        {type === "single_select" && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t(locale, "expenses.fieldOptionsLabel")}</label>
            <Textarea
              rows={4}
              value={options}
              onChange={(event) => setOptions(event.target.value)}
              placeholder={t(locale, "expenses.fieldOptionsPlaceholder")}
            />
          </div>
        )}
        <Button className="w-full" onClick={submit} disabled={isPending || !name.trim()}>
          {t(locale, "expenses.addField")}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

export function ExpenseList({
  expenses,
  categories,
  fields,
  projects,
  defaultCurrency,
  initialColumnOrder,
  initialColumnWidths,
  locale,
}: ExpenseListProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabStatus>("all")
  const [activeCategory, setActiveCategory] = useState<string>("all")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [fieldSearch, setFieldSearch] = useState("")
  const [fieldVisibility, setFieldVisibility] = useState<VisibilityMap>(() => buildVisibilityMap(fields))
  const [cellOverrides, setCellOverrides] = useState<CellOverrideMap>({})
  const [pendingCellKey, setPendingCellKey] = useState<string | null>(null)
  const [pendingVisibilityCode, setPendingVisibilityCode] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const defaultColumnOrder = useMemo(() => [...fields.map((field) => field.code), "status"], [fields])
  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    normalizeColumnOrder(defaultColumnOrder, initialColumnOrder)
  )
  const defaultColumnWidths = useMemo(
    () =>
      Object.fromEntries(
        defaultColumnOrder.map((columnId) => [
          columnId,
          columnId === "status" ? 140 : getDefaultColumnWidth(columnId),
        ])
      ),
    [defaultColumnOrder]
  )
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    normalizeColumnWidths(defaultColumnWidths, initialColumnWidths)
  )

  useEffect(() => {
    setFieldVisibility(buildVisibilityMap(fields))
  }, [fields])

  useEffect(() => {
    setColumnOrder((prev) => reconcileColumnOrder(defaultColumnOrder, prev))
  }, [defaultColumnOrder])

  useEffect(() => {
    setColumnWidths((prev) => reconcileColumnWidths(defaultColumnWidths, prev))
  }, [defaultColumnWidths])

  useEffect(() => {
    setCellOverrides({})
  }, [expenses])

  const tabConfig = useMemo(() => getTabConfig(locale), [locale])

  const handleToggleFieldVisibility = useCallback((field: Field, nextValue: boolean) => {
    const previousValue = fieldVisibility[field.code]
    setFieldVisibility((prev) => ({ ...prev, [field.code]: nextValue }))
    setPendingVisibilityCode(field.code)

    startTransition(async () => {
      try {
        await updateExpenseFieldVisibilityAction(field.code, nextValue)
      } catch (error) {
        console.error("Failed to update field visibility:", error)
        setFieldVisibility((prev) => ({ ...prev, [field.code]: previousValue }))
        toast.error(t(locale, "expenses.fieldVisibilityFailed"))
      } finally {
        setPendingVisibilityCode(null)
      }
    })
  }, [fieldVisibility, locale, startTransition])

  const visibleFields = useMemo(
    () => fields.filter((field) => fieldVisibility[field.code]),
    [fieldVisibility, fields]
  )
  const fieldByCode = useMemo(() => new Map(fields.map((field) => [field.code, field])), [fields])
  const visibleColumnIds = useMemo(
    () => columnOrder.filter((columnId) => columnId === "status" || fieldVisibility[columnId]),
    [columnOrder, fieldVisibility]
  )
  const columnPickerItems = useMemo(() => {
    const needle = fieldSearch.trim().toLowerCase()
    const statusLabel = t(locale, "expenses.tableStatus")

    return columnOrder.flatMap((columnId) => {
      if (columnId === "status") {
        if (needle && !statusLabel.toLowerCase().includes(needle)) {
          return []
        }

        return [
          {
            id: columnId,
            label: statusLabel,
            endContent: <Checkbox checked disabled aria-label={statusLabel} />,
          },
        ]
      }

      const field = fieldByCode.get(columnId)
      if (!field) {
        return []
      }

      if (needle && !field.name.toLowerCase().includes(needle)) {
        return []
      }

      return [
        {
          id: field.code,
          label: field.name,
          endContent: (
            <Checkbox
              checked={fieldVisibility[field.code]}
              disabled={pendingVisibilityCode === field.code}
              onCheckedChange={(checked) => handleToggleFieldVisibility(field, checked === true)}
              aria-label={field.name}
            />
          ),
        },
      ]
    })
  }, [columnOrder, fieldByCode, fieldSearch, fieldVisibility, handleToggleFieldVisibility, locale, pendingVisibilityCode])
  const columnPickerItemIds = useMemo(() => columnPickerItems.map((item) => item.id), [columnPickerItems])

  const counts = useMemo(() => {
    const nextCounts: Record<string, number> = {}
    for (const expense of expenses) {
      const status = normalizeExpenseStatus(expense.status)
      nextCounts[status] = (nextCounts[status] ?? 0) + 1
    }
    return nextCounts
  }, [expenses])

  const filtered = useMemo(() => {
    return expenses.filter((expense) => {
      const matchesStatus = activeTab === "all" || normalizeExpenseStatus(expense.status) === activeTab
      const matchesCategory = activeCategory === "all" || expense.categoryCode === activeCategory
      return matchesStatus && matchesCategory
    })
  }, [activeCategory, activeTab, expenses])

  const filteredTotal = useMemo(() => {
    const sum = filtered.reduce((acc, expense) => acc + getExpenseAmountForCurrency(expense, defaultCurrency), 0)
    return formatLocaleCurrency(sum, defaultCurrency, locale)
  }, [defaultCurrency, filtered, locale])

  const allSelected = filtered.length > 0 && filtered.every((expense) => selectedIds.has(expense.id))
  const someSelected = filtered.some((expense) => selectedIds.has(expense.id)) && !allSelected
  const hiddenCount = fields.length - visibleFields.length

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

  async function handleBulkDownload() {
    const selected = filtered.filter((expense) => selectedIds.has(expense.id))
    if (selected.length === 0) return

    try {
      const params = new URLSearchParams()
      for (const expense of selected) {
        params.append("ids", expense.id)
      }

      const response = await fetch(`/expenses/export-files?${params.toString()}`)
      if (!response.ok) {
        throw new Error(await response.text())
      }

      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = downloadUrl
      anchor.download = response.headers.get("X-Archive-Name") || "expense-files.zip"
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error("Failed to download bulk files:", error)
      toast.error(t(locale, "expenses.bulkDownloadFailed"))
    }
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

  function handleCreateField(data: { name: string; type: "string" | "single_select"; options?: string }) {
    startTransition(async () => {
      const result = await createExpenseFieldAction(data)
      if (!result.success) {
        toast.error(result.error || t(locale, "expenses.addFieldFailed"))
        return
      }

      toast.success(t(locale, "expenses.addFieldSuccess"))
      router.refresh()
    })
  }

  function persistColumnOrder(nextOrder: string[]) {
    setColumnOrder(nextOrder)

    startTransition(async () => {
      const result = await updateTableColumnOrderAction("expenses_list_column_order", nextOrder)
      if (!result.success) {
        toast.error(result.error)
      }
    })
  }

  function handleColumnPickerOrderChange(nextVisibleOrder: string[]) {
    const nextOrder = reorderVisibleColumns(columnOrder, columnPickerItemIds, nextVisibleOrder)
    persistColumnOrder(nextOrder)
  }

  function persistColumnWidths(nextWidths: Record<string, number>) {
    setColumnWidths(nextWidths)

    startTransition(async () => {
      const result = await updateTableColumnWidthsAction("expenses_list_column_widths", nextWidths)
      if (!result.success) {
        toast.error(result.error)
      }
    })
  }

  function handleColumnWidthChange(columnId: string, width: number) {
    setColumnWidths((prev) => ({ ...prev, [columnId]: clampColumnWidth(width) }))
  }

  function handleColumnWidthCommit(columnId: string, width: number) {
    const nextWidths = { ...columnWidths, [columnId]: clampColumnWidth(width) }
    persistColumnWidths(nextWidths)
  }

  function handleLookupUpdate(expense: ExpenseWithRelations, fieldCode: "categoryCode" | "projectCode", value: string) {
    const key = `${expense.id}:${fieldCode}`
    const previousValue = String((getTransactionFieldValue(expense, { code: fieldCode, isExtra: false }) as string | null) ?? "")

    setPendingCellKey(key)
    setCellOverrides((prev) => ({ ...prev, [key]: value }))

    startTransition(async () => {
      try {
        await updateExpenseAction(expense.id, { [fieldCode]: value || null })
        router.refresh()
      } catch (error) {
        console.error(`Failed to update ${fieldCode}:`, error)
        setCellOverrides((prev) => ({ ...prev, [key]: previousValue }))
        toast.error(t(locale, "expenses.inlineUpdateFailed"))
      } finally {
        setPendingCellKey(null)
      }
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
    <div className="relative overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b bg-secondary/30 px-4 py-3">
        <div className="min-w-[220px] max-w-sm">
          <FormSelect
            title={t(locale, "expenses.filterCategoryLabel")}
            value={activeCategory}
            onValueChange={(value) => {
              setActiveCategory(value || "all")
              setSelectedIds(new Set())
            }}
            items={[
              { code: "all", name: t(locale, "expenses.filterCategoryAll") },
              ...categories.map((category) => ({ code: category.code, name: category.name })),
            ]}
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <EyeOff className="h-4 w-4" />
              {hiddenCount > 0 ? t(locale, "expenses.hiddenFields", { count: hiddenCount }) : t(locale, "expenses.hideFields")}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-3 p-4">
            <Input
              value={fieldSearch}
              onChange={(event) => setFieldSearch(event.target.value)}
              placeholder={t(locale, "expenses.findField")}
            />
            <div className="max-h-96 overflow-y-auto">
              <ColumnOrderList
                items={columnPickerItems}
                onChange={handleColumnPickerOrderChange}
                emptyState="No fields available."
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>

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
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3">
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
        <div className="flex items-center justify-between px-4 py-2 border-b bg-secondary/60">
          <span className="text-xs text-muted-foreground">
            {t(locale, "expenses.filteredSummary", {
              count: formatLocaleNumber(filtered.length, locale),
              label: t(locale, filtered.length === 1 ? "expenses.countExpense" : "expenses.countExpenses"),
            })}
          </span>
          <span className="text-xs font-mono font-medium text-foreground tabular-nums">{filteredTotal}</span>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-10 text-sm">{t(locale, "expenses.noResultsForStatus")}</p>
      )}

      {filtered.length > 0 && (
        <Table className="min-w-max">
          <colgroup>
            <col style={{ width: 48, minWidth: 48, maxWidth: 48 }} />
            {visibleColumnIds.map((columnId) => (
              <col
                key={columnId}
                style={{
                  width: columnWidths[columnId],
                  minWidth: columnWidths[columnId],
                  maxWidth: columnWidths[columnId],
                }}
              />
            ))}
            <col style={{ width: 64, minWidth: 64, maxWidth: 64 }} />
          </colgroup>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12 px-4">
                <Checkbox
                  checked={someSelected ? "indeterminate" : allSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label={t(locale, "expenses.bulkSelected", { count: formatLocaleNumber(filtered.length, locale) })}
                />
              </TableHead>
              {visibleColumnIds.map((columnId) => {
                if (columnId === "status") {
                  return (
                    <ResizableTableHead
                      key={columnId}
                      width={columnWidths[columnId]}
                      minWidth={120}
                      onWidthChange={(width) => handleColumnWidthChange(columnId, width)}
                      onWidthCommit={(width) => handleColumnWidthCommit(columnId, width)}
                      className="group/header border-r px-3 py-3 text-sm font-semibold text-foreground"
                    >
                      {t(locale, "expenses.tableStatus")}
                    </ResizableTableHead>
                  )
                }

                const field = fieldByCode.get(columnId)
                if (!field) return null

                return (
                  <ResizableTableHead
                    key={field.code}
                    width={columnWidths[field.code]}
                    minWidth={getDefaultColumnWidth(field.code)}
                    onWidthChange={(width) => handleColumnWidthChange(field.code, width)}
                    onWidthCommit={(width) => handleColumnWidthCommit(field.code, width)}
                    className="group/header border-r px-3 py-3 text-sm font-semibold text-foreground"
                  >
                    {field.name}
                  </ResizableTableHead>
                )
              })}
              <TableHead className="w-16 px-3 py-3 text-right text-foreground">
                <AddFieldPopover locale={locale} isPending={isPending} onCreate={handleCreateField} />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((expense) => {
              const statusMeta = getExpenseStatusMeta(expense.status, locale)
              const isSelected = selectedIds.has(expense.id)

              return (
                <TableRow
                  key={expense.id}
                  className={cn("cursor-pointer", isSelected && "bg-secondary/60")}
                  onClick={() => router.push(`/expenses/${expense.id}`)}
                >
                  <TableCell className="w-12 border-r px-4 py-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(expense.id)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`${t(locale, "expenses.detailFallbackTitle")} ${expense.id}`}
                    />
                  </TableCell>

                  {visibleColumnIds.map((columnId) => {
                    if (columnId === "status") {
                      return (
                        <TableCell key={columnId} className="border-r px-3 py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </TableCell>
                      )
                    }

                    const field = fieldByCode.get(columnId)
                    if (!field) return null

                    if (field.code === "categoryCode") {
                      const key = `${expense.id}:${field.code}`
                      const value = cellOverrides[key] ?? String(expense.categoryCode ?? "")

                      return (
                        <TableCell key={field.code} className="border-r p-0">
                          <LookupCellEditor
                            value={value}
                            items={categories.map((category) => ({
                              code: category.code,
                              name: category.name,
                              color: category.color,
                            }))}
                            locale={locale}
                            placeholder={t(locale, "expenses.selectCategory")}
                            pending={pendingCellKey === key}
                            onChange={(nextValue) => handleLookupUpdate(expense, "categoryCode", nextValue)}
                          />
                        </TableCell>
                      )
                    }

                    if (field.code === "projectCode") {
                      const key = `${expense.id}:${field.code}`
                      const value = cellOverrides[key] ?? String(expense.projectCode ?? "")

                      return (
                        <TableCell key={field.code} className="border-r p-0">
                          <LookupCellEditor
                            value={value}
                            items={projects.map((project) => ({
                              code: project.code,
                              name: project.name,
                              color: project.color,
                            }))}
                            locale={locale}
                            placeholder={t(locale, "expenses.selectProject")}
                            pending={pendingCellKey === key}
                            onChange={(nextValue) => handleLookupUpdate(expense, "projectCode", nextValue)}
                          />
                        </TableCell>
                      )
                    }

                    return (
                      <TableCell key={field.code} className="border-r px-3 py-3">
                        {formatFieldValue(expense, field, defaultCurrency, locale)}
                      </TableCell>
                    )
                  })}

                  <TableCell className="px-3 py-3" />
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
