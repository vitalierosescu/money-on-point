"use client"

import {
  deleteExpenseAction,
  duplicateExpenseAction,
  markExpensePaidAction,
  markExpenseToPayAction,
  markExpenseUnpaidAction,
  updateExpenseAction,
  uploadAndAttachFileToExpenseAction,
} from "@/app/(app)/expenses/actions"
import { FormSelectCategory } from "@/components/forms/select-category"
import { FormSelectCurrency } from "@/components/forms/select-currency"
import { FormSelectProject } from "@/components/forms/select-project"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { getExpenseStatusMeta } from "@/lib/expense-status"
import { t } from "@/lib/i18n"
import { formatLocaleCurrency, type UiLocale } from "@/lib/locale"
import { formatBytes } from "@/lib/utils"
import { Category, Currency, File, Project, Transaction } from "@/prisma/client"
import {
  CheckCircle,
  Copy,
  CreditCard,
  Download,
  Loader2,
  Trash2,
  Upload,
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

export function ExpenseDetail({
  expense,
  categories,
  projects,
  currencies,
  files,
  defaultCurrency,
  locale,
}: ExpenseDetailProps) {
  const router = useRouter()
  const [formState, setFormState] = useState<ExpenseFormState>(() => buildFormState(expense, defaultCurrency))
  const [savedState, setSavedState] = useState<ExpenseFormState>(() => buildFormState(expense, defaultCurrency))
  const [selectedFileId, setSelectedFileId] = useState<string | null>(files[0]?.id ?? null)
  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const nextState = buildFormState(expense, defaultCurrency)
    setFormState(nextState)
    setSavedState(nextState)
  }, [defaultCurrency, expense])

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
  const isDirty = JSON.stringify(formState) !== JSON.stringify(savedState)
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? null

  function updateField(name: keyof ExpenseFormState, value: string) {
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  function revertChanges() {
    setFormState(savedState)
    setUploadError("")
  }

  function handleSave() {
    startTransition(async () => {
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
      })

      if (result.success) {
        setSavedState(formState)
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
    <div className="grid w-full gap-6 lg:grid-cols-[minmax(360px,480px)_minmax(0,1fr)]">
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
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            {t(locale, "expenses.dirtyState")}
          </div>
        )}

        <section className="rounded-xl border bg-card p-5">
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
              <label className="space-y-1">
                <span className="text-sm font-medium">{t(locale, "expenses.fieldMerchant")}</span>
                <Input value={formState.merchant} onChange={(event) => updateField("merchant", event.target.value)} />
              </label>
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

            {expense.linkedExpenseId && (
              <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "expenses.fieldLinkedExpense")}</div>
                <Link href={`/expenses/${expense.linkedExpenseId}`} className="mt-1 inline-block font-medium hover:underline">
                  {expense.linkedExpenseId}
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
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

      <div className="space-y-6">
        <section className="rounded-xl border bg-card">
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

          <div className="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="border-b lg:border-b-0 lg:border-r p-3 space-y-2">
              {files.length > 0 ? (
                files.map((file) => {
                  const fileSize =
                    file.metadata && typeof file.metadata === "object" && "size" in file.metadata
                      ? Number(file.metadata.size)
                      : 0

                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => setSelectedFileId(file.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                        selectedFileId === file.id
                          ? "border-foreground bg-muted"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="truncate text-sm font-medium">{file.filename}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {file.mimetype} · {formatBytes(fileSize)}
                      </div>
                    </button>
                  )
                })
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  {t(locale, "expenses.noFiles")}
                </div>
              )}
            </div>

            <div className="p-3">
              {selectedFile ? (
                <iframe
                  key={selectedFile.id}
                  src={`/files/preview/${selectedFile.id}`}
                  title={selectedFile.filename}
                  className="min-h-[480px] w-full rounded-lg border bg-background"
                />
              ) : (
                <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                  {files.length === 0 ? t(locale, "expenses.noFiles") : t(locale, "expenses.noPreviewAvailable")}
                </div>
              )}
            </div>
          </div>

          <div className="border-t p-4">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => void handleFileUpload(event.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault()
                setIsDragOver(true)
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(event) => {
                event.preventDefault()
                setIsDragOver(false)
                void handleFileUpload(event.dataTransfer.files)
              }}
              disabled={isUploading}
              className={`flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-4 text-sm transition-colors ${
                isDragOver
                  ? "border-foreground/40 bg-muted/60 text-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:bg-muted/50"
              } ${isUploading ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span>{isUploading ? t(locale, "expenses.uploading") : t(locale, "expenses.addFiles")}</span>
            </button>
            {uploadError && <p className="mt-2 text-xs text-destructive">{uploadError}</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
