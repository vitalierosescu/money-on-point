"use client"

import {
  deleteExpenseAction,
  duplicateExpenseAction,
  markExpensePaidAction,
  markExpenseToPayAction,
  markExpenseUnpaidAction,
  removeFileFromExpenseAction,
  updateExpenseAction,
  uploadAndAttachFileToExpenseAction,
} from "@/app/(app)/expenses/actions"
import { MerchantAutocomplete } from "@/components/forms/merchant-autocomplete"
import { FormSelectCategory } from "@/components/forms/select-category"
import { FormSelectCurrency } from "@/components/forms/select-currency"
import { FormSelectProject } from "@/components/forms/select-project"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { getExpenseStatusMeta } from "@/lib/expense-status"
import { getFieldOptions } from "@/lib/fields"
import { t } from "@/lib/i18n"
import { formatLocaleCurrency, type UiLocale } from "@/lib/locale"
import { formatBytes } from "@/lib/utils"
import { Category, Currency, Field, File, Project, Transaction } from "@/prisma/client"
import {
  CheckCircle,
  Copy,
  CreditCard,
  Download,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

type ExpenseDetailProps = {
  expense: Transaction & { category?: Category | null; project?: Project | null }
  categories: Category[]
  projects: Project[]
  currencies: Currency[]
  fields: Field[]
  files: File[]
  defaultCurrency: string
  locale: UiLocale
}

type ExpenseFormState = {
  name: string
  merchant: string
  description: string
  total: string
  currencyCode: string
  taxAmount: string
  convertedTotal: string
  convertedCurrencyCode: string
  issuedAt: string
  dueDate: string
  categoryCode: string
  projectCode: string
  note: string
}

type CustomFieldState = Record<string, string | boolean>

function toDateInput(value: Date | string | null | undefined) {
  if (!value) return ""
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

function toAmountInput(value: number | null | undefined) {
  if (value === null || value === undefined) return ""
  return (value / 100).toFixed(2)
}

function parseAmountToCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".")
  if (!normalized) return null
  const parsed = Number.parseFloat(normalized)
  if (Number.isNaN(parsed)) return null
  return Math.round(parsed * 100)
}

function normalizeCurrencyCode(value: string): string | null {
  const normalized = value.trim().toUpperCase()
  return normalized || null
}

function buildFormState(
  expense: Transaction & { category?: Category | null; project?: Project | null },
  defaultCurrency: string
): ExpenseFormState {
  return {
    name: expense.name ?? "",
    merchant: expense.merchant ?? "",
    description: expense.description ?? "",
    total: toAmountInput(expense.total),
    currencyCode: expense.currencyCode ?? defaultCurrency,
    taxAmount: toAmountInput(expense.taxAmount),
    convertedTotal: toAmountInput(expense.convertedTotal),
    convertedCurrencyCode: expense.convertedCurrencyCode ?? defaultCurrency,
    issuedAt: toDateInput(expense.issuedAt),
    dueDate: toDateInput(expense.dueDate),
    categoryCode: expense.categoryCode ?? "",
    projectCode: expense.projectCode ?? "",
    note: expense.note ?? "",
  }
}

function buildCustomFieldState(
  expense: Transaction,
  fields: Field[]
): CustomFieldState {
  const extra = (expense.extra as Record<string, unknown> | null) ?? {}

  return fields.reduce<CustomFieldState>((acc, field) => {
    const value = extra[field.code]

    if (field.type === "boolean") {
      acc[field.code] = value === true || value === "true"
      return acc
    }

    acc[field.code] = value === null || value === undefined ? "" : String(value)
    return acc
  }, {})
}

function serializeCustomFieldValue(field: Field, value: string | boolean) {
  if (field.type === "boolean") {
    return value === true
  }

  if (field.type === "number") {
    if (typeof value !== "string" || !value.trim()) {
      return null
    }

    const parsed = Number.parseFloat(value.replace(",", "."))
    return Number.isNaN(parsed) ? null : parsed
  }

  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function ExpenseDetail({
  expense,
  categories,
  projects,
  currencies,
  fields,
  files,
  defaultCurrency,
  locale,
}: ExpenseDetailProps) {
  const router = useRouter()
  const extraFields = useMemo(() => fields.filter((field) => field.isExtra), [fields])
  const [formState, setFormState] = useState<ExpenseFormState>(() => buildFormState(expense, defaultCurrency))
  const [savedState, setSavedState] = useState<ExpenseFormState>(() => buildFormState(expense, defaultCurrency))
  const [customFieldState, setCustomFieldState] = useState<CustomFieldState>(() => buildCustomFieldState(expense, extraFields))
  const [savedCustomFieldState, setSavedCustomFieldState] = useState<CustomFieldState>(() => buildCustomFieldState(expense, extraFields))
  const [selectedFileId, setSelectedFileId] = useState<string | null>(files[0]?.id ?? null)
  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const nextState = buildFormState(expense, defaultCurrency)
    const nextCustomFieldState = buildCustomFieldState(expense, extraFields)
    setFormState(nextState)
    setSavedState(nextState)
    setCustomFieldState(nextCustomFieldState)
    setSavedCustomFieldState(nextCustomFieldState)
  }, [defaultCurrency, expense, extraFields])

  useEffect(() => {
    if (files.length === 0) {
      setSelectedFileId(null)
      return
    }

    if (!selectedFileId || !files.some((file) => file.id === selectedFileId)) {
      setSelectedFileId(files[0].id)
    }
  }, [files, selectedFileId])

  const statusMeta = useMemo(() => getExpenseStatusMeta(expense.status, locale), [expense.status, locale])
  const isDirty =
    JSON.stringify(formState) !== JSON.stringify(savedState) ||
    JSON.stringify(customFieldState) !== JSON.stringify(savedCustomFieldState)
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? null

  function updateField(name: keyof ExpenseFormState, value: string) {
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  function updateCustomField(code: string, value: string | boolean) {
    setCustomFieldState((prev) => ({ ...prev, [code]: value }))
  }

  function revertChanges() {
    setFormState(savedState)
    setCustomFieldState(savedCustomFieldState)
    setUploadError("")
  }

  function handleSave() {
    startTransition(async () => {
      const customFieldPayload = extraFields.reduce<Record<string, string | number | boolean | null>>((acc, field) => {
        acc[field.code] = serializeCustomFieldValue(field, customFieldState[field.code] ?? "")
        return acc
      }, {})

      const result = await updateExpenseAction(expense.id, {
        name: formState.name || null,
        merchant: formState.merchant || null,
        description: formState.description || null,
        total: parseAmountToCents(formState.total),
        currencyCode: normalizeCurrencyCode(formState.currencyCode),
        taxAmount: parseAmountToCents(formState.taxAmount),
        convertedTotal: parseAmountToCents(formState.convertedTotal),
        convertedCurrencyCode: normalizeCurrencyCode(formState.convertedCurrencyCode),
        issuedAt: formState.issuedAt ? new Date(formState.issuedAt) : null,
        dueDate: formState.dueDate ? new Date(formState.dueDate) : null,
        categoryCode: formState.categoryCode || null,
        projectCode: formState.projectCode || null,
        note: formState.note || null,
        ...customFieldPayload,
      })

      if (result.success) {
        setSavedState(formState)
        setSavedCustomFieldState(customFieldState)
        toast.success(t(locale, "expenses.saveSuccess"))
        router.refresh()
        return
      }

      toast.error(t(locale, "expenses.saveFailed"))
    })
  }

  function runStatusAction(action: () => Promise<{ success: boolean }>) {
    startTransition(async () => {
      const result = await action()
      if (result.success) {
        toast.success(t(locale, "expenses.statusUpdated"))
        router.refresh()
        return
      }

      toast.error(t(locale, "expenses.saveFailed"))
    })
  }

  function runSecondaryAction(
    action: () => Promise<{ success: boolean; error?: string }>,
    successMessage: string,
    errorMessage: string
  ) {
    startTransition(async () => {
      const result = await action()
      if (result.success) {
        toast.success(successMessage)
        router.refresh()
        return
      }

      toast.error(result.error || errorMessage)
    })
  }

  function handleRemoveFile(fileId: string, filename: string) {
    if (!window.confirm(t(locale, "expenses.removeFileConfirm", { filename }))) {
      return
    }

    startTransition(async () => {
      const result = await removeFileFromExpenseAction(expense.id, fileId)
      if (result.success) {
        if (selectedFileId === fileId) {
          setSelectedFileId(null)
        }
        toast.success(t(locale, "expenses.removeFileSuccess"))
        router.refresh()
        return
      }

      toast.error(result.error || t(locale, "expenses.removeFileFailed"))
    })
  }

  function handleDelete() {
    if (!window.confirm(t(locale, "expenses.deleteConfirm"))) {
      return
    }

    startTransition(async () => {
      const result = await deleteExpenseAction(expense.id)
      if (result.success) {
        toast.success(t(locale, "expenses.deleteSuccess"))
        router.push("/expenses")
        router.refresh()
        return
      }

      toast.error(t(locale, "expenses.deleteFailed"))
    })
  }

  async function handleFileUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return

    setUploadError("")
    setIsUploading(true)

    try {
      const uploadForm = new FormData()
      for (let index = 0; index < fileList.length; index += 1) {
        uploadForm.append("files", fileList[index])
      }

      const result = await uploadAndAttachFileToExpenseAction(expense.id, uploadForm)
      if (result.success) {
        toast.success(t(locale, "expenses.filesUpdated"))
        router.refresh()
      } else {
        const message = result.error || t(locale, "expenses.uploadFailed")
        setUploadError(message)
        toast.error(message)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t(locale, "expenses.uploadFailed")
      setUploadError(message)
      toast.error(message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="grid w-full items-start gap-6 lg:grid-cols-[minmax(360px,480px)_auto] 2xl:grid-cols-[minmax(360px,1fr)_auto]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/expenses" className="text-sm text-muted-foreground hover:text-foreground">
              {t(locale, "expenses.backToExpenses")}
            </Link>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              {expense.merchant ?? expense.name ?? t(locale, "expenses.detailFallbackTitle")}
            </h1>
          </div>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.className}`}>
            {statusMeta.label}
          </span>
        </div>

        {isDirty && (
          <div className="rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            {t(locale, "expenses.dirtyState")}
          </div>
        )}

        <section className="rounded-card border bg-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold">{t(locale, "expenses.detailsTitle")}</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={revertChanges} disabled={!isDirty || isPending}>
                {t(locale, "expenses.revertChanges")}
              </Button>
              <Button onClick={handleSave} disabled={!isDirty || isPending}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t(locale, "expenses.saveChanges")}
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium">{t(locale, "expenses.fieldName")}</span>
                <Input value={formState.name} onChange={(event) => updateField("name", event.target.value)} />
              </label>
              <MerchantAutocomplete
                title={t(locale, "expenses.fieldMerchant")}
                name="merchant"
                value={formState.merchant}
                onChange={(next) => updateField("merchant", next)}
                locale={locale}
              />
            </div>

            <label className="space-y-1">
              <span className="text-sm font-medium">{t(locale, "expenses.fieldDescription")}</span>
              <Textarea value={formState.description} onChange={(event) => updateField("description", event.target.value)} rows={3} />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium">{t(locale, "expenses.fieldAmount")}</span>
                <Input type="number" step="0.01" value={formState.total} onChange={(event) => updateField("total", event.target.value)} />
              </label>
              <FormSelectCurrency
                title={t(locale, "expenses.fieldCurrency")}
                currencies={currencies}
                value={formState.currencyCode}
                onValueChange={(value) => updateField("currencyCode", value)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium">{t(locale, "expenses.fieldTaxAmount")}</span>
                <Input type="number" step="0.01" value={formState.taxAmount} onChange={(event) => updateField("taxAmount", event.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t(locale, "expenses.fieldIssuedAt")}</span>
                <Input type="date" value={formState.issuedAt} onChange={(event) => updateField("issuedAt", event.target.value)} />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium">{t(locale, "expenses.fieldConvertedAmount")}</span>
                <Input
                  type="number"
                  step="0.01"
                  value={formState.convertedTotal}
                  onChange={(event) => updateField("convertedTotal", event.target.value)}
                />
              </label>
              <FormSelectCurrency
                title={t(locale, "expenses.fieldConvertedCurrency")}
                currencies={currencies}
                value={formState.convertedCurrencyCode}
                onValueChange={(value) => updateField("convertedCurrencyCode", value)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium">{t(locale, "expenses.fieldDueDate")}</span>
                <Input type="date" value={formState.dueDate} onChange={(event) => updateField("dueDate", event.target.value)} />
              </label>
              <FormSelectCategory
                title={t(locale, "expenses.fieldCategory")}
                categories={categories}
                value={formState.categoryCode}
                onValueChange={(value) => updateField("categoryCode", value)}
                placeholder={t(locale, "expenses.selectCategory")}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormSelectProject
                title={t(locale, "expenses.fieldProject")}
                projects={projects}
                value={formState.projectCode}
                onValueChange={(value) => updateField("projectCode", value)}
                placeholder={t(locale, "expenses.selectProject")}
              />
              <label className="space-y-1">
                <span className="text-sm font-medium">{t(locale, "expenses.fieldNote")}</span>
                <Textarea value={formState.note} onChange={(event) => updateField("note", event.target.value)} rows={3} />
              </label>
            </div>

            {extraFields.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-medium">{t(locale, "expenses.customFieldsTitle")}</div>
                <div className="grid gap-4 md:grid-cols-2">
                  {extraFields.map((field) => {
                    const value = customFieldState[field.code]

                    return (
                      <label key={field.code} className="space-y-1">
                        <span className="text-sm font-medium">{field.name}</span>
                        {field.type === "boolean" ? (
                          <div className="flex min-h-10 items-center rounded-control border border-input bg-background px-3">
                            <Checkbox
                              checked={value === true}
                              onCheckedChange={(checked) => updateCustomField(field.code, checked === true)}
                            />
                          </div>
                        ) : field.type === "single_select" ? (
                          <NativeSelect
                            value={String(value ?? "")}
                            onChange={(event) => updateCustomField(field.code, event.target.value)}
                          >
                            <option value="">{t(locale, "expenses.selectOption")}</option>
                            {getFieldOptions(field.options).map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </NativeSelect>
                        ) : (
                          <Input
                            type={field.type === "number" ? "number" : "text"}
                            step={field.type === "number" ? "0.01" : undefined}
                            value={String(value ?? "")}
                            onChange={(event) => updateCustomField(field.code, event.target.value)}
                          />
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {expense.linkedExpenseId && (
              <div className="rounded-card border bg-muted/20 px-4 py-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "expenses.fieldLinkedExpense")}</div>
                <Link href={`/expenses/${expense.linkedExpenseId}`} className="mt-1 inline-block font-medium hover:underline">
                  {expense.linkedExpenseId}
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-card border bg-card p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {expense.status !== "paid" && (
              <Button onClick={() => runStatusAction(() => markExpensePaidAction(expense.id))} disabled={isPending}>
                <CheckCircle className="mr-2 h-4 w-4" />
                {t(locale, "expenses.markPaid")}
              </Button>
            )}
            {expense.status === "unpaid" && (
              <Button variant="outline" onClick={() => runStatusAction(() => markExpenseToPayAction(expense.id))} disabled={isPending}>
                <CreditCard className="mr-2 h-4 w-4" />
                {t(locale, "expenses.markToPay")}
              </Button>
            )}
            {expense.status === "to_pay" && (
              <Button variant="outline" onClick={() => runStatusAction(() => markExpenseUnpaidAction(expense.id))} disabled={isPending}>
                {t(locale, "expenses.markUnpaid")}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() =>
                runSecondaryAction(
                  () => duplicateExpenseAction(expense.id),
                  t(locale, "expenses.duplicateSuccess"),
                  t(locale, "expenses.duplicateFailed")
                )
              }
              disabled={isPending}
            >
              <Copy className="mr-2 h-4 w-4" />
              {t(locale, "expenses.duplicate")}
            </Button>
            <Button
              variant="outline"
              className="border-destructive/20 text-destructive hover:bg-destructive/5"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t(locale, "expenses.deleteExpense")}
            </Button>
          </div>
        </section>
      </div>

      <div className="space-y-6 lg:sticky lg:top-6">
        <section
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={(event) => {
            // only clear when leaving the section itself, not its children
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
            setIsDragOver(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragOver(false)
            void handleFileUpload(event.dataTransfer.files)
          }}
          className={`rounded-card border bg-card transition-colors ${
            isDragOver ? "border-foreground/50 ring-2 ring-foreground/20" : ""
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => void handleFileUpload(event.target.files)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">{t(locale, "expenses.sourceDocuments")}</h2>
              {expense.total !== null && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatLocaleCurrency(expense.total, expense.currencyCode ?? defaultCurrency, locale)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {selectedFile && (
                <Button variant="outline" asChild>
                  <a href={`/files/download/${selectedFile.id}`}>
                    <Download className="mr-2 h-4 w-4" />
                    {t(locale, "common.download")}
                  </a>
                </Button>
              )}
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {isUploading ? t(locale, "expenses.uploading") : t(locale, "expenses.addFiles")}
              </Button>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[240px_auto]">
            <div className="border-b lg:border-b-0 lg:border-r p-3 space-y-2">
              {files.length > 0 ? (
                files.map((file) => {
                  const fileSize =
                    file.metadata && typeof file.metadata === "object" && "size" in file.metadata
                      ? Number(file.metadata.size)
                      : 0

                  return (
                    <div
                      key={file.id}
                      className={`group relative rounded-control border transition-colors ${
                        selectedFileId === file.id
                          ? "border-foreground bg-muted"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedFileId(file.id)}
                        className="block w-full px-3 py-2 pr-9 text-left"
                      >
                        <div className="truncate text-sm font-medium">{file.filename}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {file.mimetype} · {formatBytes(fileSize)}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleRemoveFile(file.id, file.filename)
                        }}
                        disabled={isPending}
                        aria-label={t(locale, "expenses.removeFile")}
                        title={t(locale, "expenses.removeFile")}
                        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-control p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )
                })
              ) : (
                <div className="rounded-control border border-dashed p-4 text-sm text-muted-foreground">
                  {t(locale, "expenses.noFiles")}
                </div>
              )}
            </div>

            <div className="p-3">
              {selectedFile ? (
                selectedFile.mimetype === "application/pdf" || selectedFile.mimetype.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={selectedFile.id}
                    src={`/files/preview/${selectedFile.id}`}
                    alt={selectedFile.filename}
                    className="block h-auto max-h-[calc(100vh-220px)] w-full max-w-full rounded-control border bg-background object-contain lg:h-[calc(100vh-220px)] lg:max-h-[720px] lg:min-h-[520px] lg:w-auto lg:max-w-none"
                  />
                ) : (
                  <iframe
                    key={selectedFile.id}
                    src={`/files/preview/${selectedFile.id}`}
                    title={selectedFile.filename}
                    className="block h-[calc(100vh-220px)] min-h-[520px] w-full rounded-control border bg-background lg:w-[480px]"
                  />
                )
              ) : (
                <div className="flex min-h-[520px] items-center justify-center rounded-control border border-dashed text-sm text-muted-foreground lg:w-[480px]">
                  {files.length === 0 ? t(locale, "expenses.noFiles") : t(locale, "expenses.noPreviewAvailable")}
                </div>
              )}
            </div>
          </div>

          {(uploadError || isDragOver) && (
            <div className="border-t px-4 py-3">
              {isDragOver && (
                <p className="text-xs text-muted-foreground">{t(locale, "expenses.dropToUpload")}</p>
              )}
              {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
