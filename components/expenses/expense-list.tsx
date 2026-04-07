"use client"

import {
  bulkDeleteExpenseAction,
  bulkMarkExpensePaidAction,
  bulkMarkExpenseToPayAction,
  createExpenseFieldAction,
  updateExpenseAction,
  updateExpenseFieldVisibilityAction,
} from "@/app/(app)/expenses/actions"
import { FormSelect } from "@/components/forms/simple"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { getExpenseAmountForCurrency, getExpenseStatusMeta, normalizeExpenseStatus, type ExpenseStatus } from "@/lib/expense-status"
import { getTransactionFieldValue } from "@/lib/fields"
import { t } from "@/lib/i18n"
import { formatLocaleCurrency, formatLocaleDate, formatLocaleNumber, type UiLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"
import type { ExpenseWithRelations } from "@/models/transactions"
import type { Category, Field, Project } from "@/prisma/client"
import { EyeOff, Loader2, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import React, { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

type ExpenseListProps = {
  expenses: ExpenseWithRelations[]
  categories: Category[]
  fields: Field[]
  projects: Project[]
  defaultCurrency: string
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

function groupByMonth(expenses: ExpenseWithRelations[], locale: UiLocale) {
  const groups: Record<string, { label: string; rows: ExpenseWithRelations[] }> = {}

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

function getColumnWidthClass(fieldCode: string) {
  switch (fieldCode) {
    case "name":
    case "merchant":
    case "description":
    case "note":
      return "min-w-[220px]"
    case "issuedAt":
    case "dueDate":
      return "min-w-[140px]"
    case "categoryCode":
    case "projectCode":
      return "min-w-[180px]"
    case "total":
    case "convertedTotal":
    case "taxAmount":
      return "min-w-[160px]"
    default:
      return "min-w-[160px]"
  }
}

function getLookupChipClass(color?: string) {
  if (!color) {
    return "bg-secondary text-foreground"
  }

  return "text-foreground"
}

function LookupCellEditor({
  value,
  items,
  placeholder,
  pending,
  onChange,
}: {
  value: string
  items: Array<{ code: string; name: string; color?: string }>
  placeholder: string
  pending: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = items.find((item) => item.code === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-7 min-w-[120px] items-center justify-between gap-2 rounded-full border px-3 py-1 text-left text-xs font-medium transition-colors hover:border-foreground/40",
            selected ? getLookupChipClass(selected.color) : "border-dashed text-muted-foreground"
          )}
          style={selected?.color ? { backgroundColor: `${selected.color}22`, borderColor: `${selected.color}55` } : undefined}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="truncate">{selected?.name ?? placeholder}</span>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-muted-foreground">▾</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <NativeSelect
          autoFocus
          value={value}
          disabled={pending}
          onChange={(event) => {
            onChange(event.target.value)
            setOpen(false)
          }}
        >
          <option value="">{placeholder}</option>
          {items.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </NativeSelect>
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

export function ExpenseList({ expenses, categories, fields, projects, defaultCurrency, locale }: ExpenseListProps) {
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

  useEffect(() => {
    setFieldVisibility(buildVisibilityMap(fields))
  }, [fields])

  useEffect(() => {
    setCellOverrides({})
  }, [expenses])

  const tabConfig = useMemo(() => getTabConfig(locale), [locale])

  const visibleFields = useMemo(
    () => fields.filter((field) => fieldVisibility[field.code]),
    [fieldVisibility, fields]
  )

  const filteredFieldChoices = useMemo(() => {
    const needle = fieldSearch.trim().toLowerCase()
    if (!needle) {
      return fields
    }

    return fields.filter((field) => field.name.toLowerCase().includes(needle))
  }, [fieldSearch, fields])

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

  const grouped = useMemo(() => groupByMonth(filtered, locale), [filtered, locale])

  const allSelected = filtered.length > 0 && filtered.every((expense) => selectedIds.has(expense.id))
  const someSelected = filtered.some((expense) => selectedIds.has(expense.id)) && !allSelected
  const hiddenCount = fields.length - visibleFields.length
  const totalColumnCount = visibleFields.length + 3

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

  function handleToggleFieldVisibility(field: Field, nextValue: boolean) {
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
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {filteredFieldChoices.map((field) => (
                <label key={field.code} className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 text-sm">
                  <span className="truncate">{field.name}</span>
                  <Checkbox
                    checked={fieldVisibility[field.code]}
                    disabled={pendingVisibilityCode === field.code}
                    onCheckedChange={(checked) => handleToggleFieldVisibility(field, checked === true)}
                  />
                </label>
              ))}
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

      {grouped.length === 0 && (
        <p className="text-center text-muted-foreground py-10 text-sm">{t(locale, "expenses.noResultsForStatus")}</p>
      )}

      {grouped.length > 0 && (
        <Table className="min-w-max">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12 px-4">
                <Checkbox
                  checked={someSelected ? "indeterminate" : allSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label={t(locale, "expenses.bulkSelected", { count: formatLocaleNumber(filtered.length, locale) })}
                />
              </TableHead>
              {visibleFields.map((field) => (
                <TableHead
                  key={field.code}
                  className={cn("px-3 py-3 text-xs uppercase tracking-wide", getColumnWidthClass(field.code))}
                >
                  {field.name}
                </TableHead>
              ))}
              <TableHead className="min-w-[140px] px-3 py-3 text-xs uppercase tracking-wide">
                {t(locale, "expenses.tableStatus")}
              </TableHead>
              <TableHead className="w-16 px-3 py-3 text-right">
                <AddFieldPopover locale={locale} isPending={isPending} onCreate={handleCreateField} />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.map(({ label, rows }) => (
              <React.Fragment key={label}>
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={totalColumnCount} className="bg-secondary/50 px-4 py-1.5">
                    <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</span>
                  </TableCell>
                </TableRow>

                {rows.map((expense) => {
                  const statusMeta = getExpenseStatusMeta(expense.status, locale)
                  const isSelected = selectedIds.has(expense.id)

                  return (
                    <TableRow
                      key={expense.id}
                      className={cn("cursor-pointer", isSelected && "bg-secondary/60")}
                      onClick={() => router.push(`/expenses/${expense.id}`)}
                    >
                      <TableCell className="w-12 px-4 py-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(expense.id)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`${t(locale, "expenses.detailFallbackTitle")} ${expense.id}`}
                        />
                      </TableCell>

                      {visibleFields.map((field) => {
                        if (field.code === "categoryCode") {
                          const key = `${expense.id}:${field.code}`
                          const value = cellOverrides[key] ?? String(expense.categoryCode ?? "")

                          return (
                            <TableCell key={field.code} className={cn("px-3 py-3", getColumnWidthClass(field.code))}>
                              <LookupCellEditor
                                value={value}
                                items={categories.map((category) => ({
                                  code: category.code,
                                  name: category.name,
                                  color: category.color,
                                }))}
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
                            <TableCell key={field.code} className={cn("px-3 py-3", getColumnWidthClass(field.code))}>
                              <LookupCellEditor
                                value={value}
                                items={projects.map((project) => ({
                                  code: project.code,
                                  name: project.name,
                                  color: project.color,
                                }))}
                                placeholder={t(locale, "expenses.selectProject")}
                                pending={pendingCellKey === key}
                                onChange={(nextValue) => handleLookupUpdate(expense, "projectCode", nextValue)}
                              />
                            </TableCell>
                          )
                        }

                        return (
                          <TableCell key={field.code} className={cn("px-3 py-3", getColumnWidthClass(field.code))}>
                            {formatFieldValue(expense, field, defaultCurrency, locale)}
                          </TableCell>
                        )
                      })}

                      <TableCell className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </TableCell>

                      <TableCell className="px-3 py-3" />
                    </TableRow>
                  )
                })}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
