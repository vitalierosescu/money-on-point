"use client"

import { analyzeFileAction, deleteUnsortedFileAction, saveFileAsTransactionAction } from "@/app/(app)/unsorted/actions"
import { CurrencyConverterTool } from "@/components/agents/currency-converter"
import { ItemsDetectTool } from "@/components/agents/items-detect"
import ToolWindow from "@/components/agents/tool-window"
import { FormError } from "@/components/forms/error"
import { FormSelectCategory } from "@/components/forms/select-category"
import { FormSelectCurrency } from "@/components/forms/select-currency"
import { FormSelectProject } from "@/components/forms/select-project"
import { FormSelectType } from "@/components/forms/select-type"
import { FormInput, FormTextarea } from "@/components/forms/simple"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"
import { formatLocaleCurrency, formatLocaleDate, type UiLocale } from "@/lib/locale"
import { TransactionData } from "@/models/transactions"
import { Category, Currency, Field, File, Project } from "@/prisma/client"
import { AlertTriangle, ArrowDownToLine, Brain, Loader2, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

function parseAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number.parseFloat(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function parseDateInput(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }

  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) return null

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00` : trimmed
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeDateField(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value !== "string") {
    return ""
  }

  const trimmed = value.trim()
  if (!trimmed) return ""

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const parsed = parseDateInput(trimmed)
  return parsed ? parsed.toISOString().slice(0, 10) : ""
}

export default function AnalyzeForm({
  file,
  categories,
  projects,
  currencies,
  fields,
  settings,
  locale,
  hasNextFile,
}: {
  file: File
  categories: Category[]
  projects: Project[]
  currencies: Currency[]
  fields: Field[]
  settings: Record<string, string>
  locale: UiLocale
  hasNextFile: boolean
}) {
  const router = useRouter()
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeStep, setAnalyzeStep] = useState<string>("")
  const [analyzeError, setAnalyzeError] = useState<string>("")
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [requiresWarningReview, setRequiresWarningReview] = useState(false)
  const [isDeletePending, startDeleteTransition] = useTransition()
  const warningRef = useRef<HTMLDivElement | null>(null)
  const dirtyFieldsRef = useRef<Set<string>>(new Set())

  const fieldMap = useMemo(() => {
    return fields.reduce(
      (acc, field) => {
        acc[field.code] = field
        return acc
      },
      {} as Record<string, Field>
    )
  }, [fields])

  const extraFields = useMemo(() => fields.filter((field) => field.isExtra), [fields])
  const initialFormState = useMemo(() => {
    const baseState = {
      name: file.filename,
      merchant: "",
      description: "",
      type: settings.default_type,
      total: "",
      currencyCode: settings.default_currency,
      convertedTotal: "",
      convertedCurrencyCode: settings.default_currency,
      categoryCode: settings.default_category,
      projectCode: settings.default_project,
      issuedAt: "",
      note: "",
      text: "",
      items: [],
    }

    // Add extra fields
    const extraFieldsState = extraFields.reduce(
      (acc, field) => {
        acc[field.code] = ""
        return acc
      },
      {} as Record<string, string>
    )

      // Load cached results if they exist
      const cachedResults = file.cachedParseResult
        ? Object.fromEntries(
            Object.entries(file.cachedParseResult as Record<string, unknown>).filter(
              ([, value]) => value !== null && value !== undefined && value !== ""
            )
          )
        : {}

    const normalizedIssuedAt = normalizeDateField(cachedResults.issuedAt)

    return {
      ...baseState,
      ...extraFieldsState,
      ...cachedResults,
      issuedAt: normalizedIssuedAt,
    }
  }, [file.filename, settings, extraFields, file.cachedParseResult])
  const [formData, setFormData] = useState(initialFormState)

  const typeOptions = useMemo(
    () => [
      { code: "expense", name: t(locale, "transactionType.expense"), badge: "↓" },
      { code: "income", name: t(locale, "transactionType.income"), badge: "↑" },
      { code: "pending", name: t(locale, "transactionType.pending"), badge: "⏲︎" },
      { code: "other", name: t(locale, "transactionType.other"), badge: "?" },
    ],
    [locale]
  )

  const warnings = useMemo(() => {
    const nextWarnings: string[] = []
    const amount = parseAmount(formData.total)
    const issueDateRaw = typeof formData.issuedAt === "string" ? formData.issuedAt.trim() : ""
    const issueDate = parseDateInput(issueDateRaw)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const typeValue = typeof formData.type === "string" ? formData.type.trim() : ""
    const currencyValue = typeof formData.currencyCode === "string" ? formData.currencyCode.trim() : ""

    if (amount === null) {
      nextWarnings.push(t(locale, "analyze.warningAmountMissing"))
    } else if (amount <= 0) {
      nextWarnings.push(t(locale, "analyze.warningAmountNonPositive"))
    }

    if (!issueDateRaw) {
      nextWarnings.push(t(locale, "analyze.warningIssueDateMissing"))
    } else if (!issueDate) {
      nextWarnings.push(t(locale, "analyze.warningIssueDateInvalid"))
    } else if (issueDate > today) {
      nextWarnings.push(t(locale, "analyze.warningIssueDateFuture"))
    }

    if (!typeValue) {
      nextWarnings.push(t(locale, "analyze.warningTypeMissing"))
    }

    if (amount !== null && amount > 0 && !currencyValue) {
      nextWarnings.push(t(locale, "analyze.warningCurrencyMissing"))
    }

    return nextWarnings
  }, [formData.currencyCode, formData.issuedAt, formData.total, formData.type, locale])

  const warningFingerprint = warnings.join("|")
  const totalValue = parseAmount(formData.total)
  const issuedAtValue = parseDateInput(formData.issuedAt)
  const currencyCode = typeof formData.currencyCode === "string" ? formData.currencyCode : ""
  const itemsData = useMemo<TransactionData>(
    () => ({
      ...formData,
      total: totalValue,
      convertedTotal: parseAmount(formData.convertedTotal),
      issuedAt: issuedAtValue ?? formData.issuedAt,
    }),
    [formData, issuedAtValue, totalValue]
  )

  useEffect(() => {
    setRequiresWarningReview(false)
  }, [warningFingerprint])

  const reviewRows = useMemo(() => {
    const amount = parseAmount(formData.total)
    const currencyCode =
      (typeof formData.currencyCode === "string" && formData.currencyCode.trim()) || settings.default_currency || "EUR"
    const issueDate = parseDateInput(formData.issuedAt)
    const typeValue = typeof formData.type === "string" ? formData.type.trim() : ""
    const typeLabel = typeOptions.find((option) => option.code === typeValue)?.name ?? typeValue

    return [
      {
        label: t(locale, "analyze.reviewAmount"),
        value:
          amount === null
            ? t(locale, "analyze.missingValue")
            : formatLocaleCurrency(Math.round(amount * 100), currencyCode, locale),
        tone: amount === null || amount <= 0 ? "text-amber-700" : "text-foreground",
      },
      {
        label: t(locale, "analyze.reviewIssueDate"),
        value:
          issueDate && typeof formData.issuedAt === "string" && formData.issuedAt.trim()
            ? formatLocaleDate(issueDate, locale, { day: "numeric", month: "short", year: "numeric" })
            : t(locale, "analyze.missingValue"),
        tone: issueDate ? "text-foreground" : "text-amber-700",
      },
      {
        label: t(locale, "analyze.reviewType"),
        value: typeLabel || t(locale, "analyze.missingValue"),
        tone: typeLabel ? "text-foreground" : "text-amber-700",
      },
    ]
  }, [formData.currencyCode, formData.issuedAt, formData.total, formData.type, locale, settings.default_currency, typeOptions])

  const updateField = (name: string, value: unknown) => {
    dirtyFieldsRef.current.add(name)
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  async function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteUnsortedFileAction(null, file.id)

      if (result.success) {
        toast.success(t(locale, "analyze.deleteSuccess"))
        router.refresh()
        return
      }

      toast.error(result.error || (locale === "nl" ? "Bestand verwijderen mislukt" : "Failed to delete file"))
    })
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (warnings.length > 0 && !requiresWarningReview) {
      event.preventDefault()
      setRequiresWarningReview(true)
      warningRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }

  async function saveAsTransaction(formData: FormData) {
    setSaveError("")
    setIsSaving(true)
    const result = await saveFileAsTransactionAction(null, formData)
    setIsSaving(false)

    if (result.success && result.data) {
      toast.success(t(locale, "analyze.saveToastTitle"), {
        description: hasNextFile
          ? t(locale, "analyze.saveToastDescription")
          : t(locale, "analyze.saveLastToastDescription"),
        action: {
          label: t(locale, "common.openExpense"),
          onClick: () => router.push(`/expenses/${result.data?.id}`),
        },
      })
      if (hasNextFile) {
        router.refresh()
      } else {
        router.replace("/unsorted?saved=1")
      }
    } else {
      const message = result.error ? result.error : t(locale, "analyze.saveFailed")
      setSaveError(message)
      toast.error(message)
    }
  }

  const startAnalyze = async () => {
    setIsAnalyzing(true)
    setAnalyzeError("")
    try {
      setAnalyzeStep(t(locale, "analyze.analyzing"))
      const results = await analyzeFileAction(file, settings, fields, categories, projects)

      console.log("Analysis results:", results)

      if (!results.success) {
        setAnalyzeError(results.error ? results.error : "Something went wrong...")
      } else {
        const nonEmptyFields = Object.fromEntries(
          Object.entries(results.data?.output || {}).filter(
            ([, value]) => value !== null && value !== undefined && value !== ""
          )
        )
        setFormData((prev) => {
          const next = { ...prev } as Record<string, unknown>
          for (const [key, value] of Object.entries(nonEmptyFields)) {
            if (dirtyFieldsRef.current.has(key)) continue
            next[key] = key === "issuedAt" ? normalizeDateField(value) : value
          }
          return next as typeof prev
        })
      }
    } catch (error) {
      console.error("Analysis failed:", error)
      setAnalyzeError(error instanceof Error ? error.message : "Analysis failed")
    } finally {
      setIsAnalyzing(false)
      setAnalyzeStep("")
    }
  }

  return (
    <>
      {file.isSplitted ? (
        <div className="flex justify-end">
          <Badge variant="outline">{locale === "nl" ? "Dit bestand is opgesplitst" : "This file has been split up"}</Badge>
        </div>
      ) : (
        <Button className="w-full mb-6 py-6 text-lg" onClick={startAnalyze} disabled={isAnalyzing} data-analyze-button>
          {isAnalyzing ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              <span>{analyzeStep}</span>
            </>
          ) : (
            <>
              <Brain className="mr-1 h-4 w-4" />
              <span>{t(locale, "analyze.analyzeWithAI")}</span>
            </>
          )}
        </Button>
      )}

      <div>{analyzeError && <FormError>{analyzeError}</FormError>}</div>

      <form className="space-y-4" action={saveAsTransaction} onSubmit={handleSubmit}>
        <input type="hidden" name="fileId" value={file.id} />

        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="text-sm font-semibold">{t(locale, "analyze.reviewTitle")}</div>
          <p className="mt-1 text-sm text-muted-foreground">{t(locale, "analyze.reviewDescription")}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {reviewRows.map((row) => (
              <div key={row.label} className="rounded-md border bg-background px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</div>
                <div className={`mt-1 text-sm font-medium ${row.tone}`}>{row.value}</div>
              </div>
            ))}
          </div>
        </div>

        {warnings.length > 0 && (
          <div ref={warningRef}>
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              <div>
                <AlertTitle>{t(locale, "analyze.warningTitle")}</AlertTitle>
                <AlertDescription>
                  <p>{t(locale, "analyze.warningDescription")}</p>
                  <ul className="mt-2 list-disc pl-4">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                  {requiresWarningReview && <p className="mt-2 font-medium">{t(locale, "analyze.savePrompt")}</p>}
                </AlertDescription>
              </div>
            </Alert>
          </div>
        )}

        <FormInput
          title={fieldMap.name.name}
          name="name"
          value={formData.name}
          onChange={(e) => updateField("name", e.target.value)}
          required={fieldMap.name.isRequired}
        />

        <FormInput
          title={fieldMap.merchant.name}
          name="merchant"
          value={formData.merchant}
          onChange={(e) => updateField("merchant", e.target.value)}
          hideIfEmpty={!fieldMap.merchant.isVisibleInAnalysis}
          required={fieldMap.merchant.isRequired}
        />

        <FormInput
          title={fieldMap.description.name}
          name="description"
          value={formData.description}
          onChange={(e) => updateField("description", e.target.value)}
          hideIfEmpty={!fieldMap.description.isVisibleInAnalysis}
          required={fieldMap.description.isRequired}
        />

        <div className="flex flex-wrap gap-4">
          <FormInput
            title={fieldMap.total.name}
            name="total"
            type="number"
            step="0.01"
            value={formData.total ?? ""}
            onChange={(e) => {
              if (e.target.value === "") {
                updateField("total", "")
                return
              }
              const newValue = parseFloat(e.target.value)
              if (!isNaN(newValue)) {
                updateField("total", newValue)
              }
            }}
            className="w-32"
            required={fieldMap.total.isRequired}
          />

          <FormSelectCurrency
            title={fieldMap.currencyCode.name}
            currencies={currencies}
            name="currencyCode"
            value={formData.currencyCode}
            onValueChange={(value) => updateField("currencyCode", value)}
            hideIfEmpty={!fieldMap.currencyCode.isVisibleInAnalysis}
            isRequired={fieldMap.currencyCode.isRequired}
          />

          <FormSelectType
            title={fieldMap.type.name}
            name="type"
            value={formData.type}
            onValueChange={(value) => updateField("type", value)}
            hideIfEmpty={!fieldMap.type.isVisibleInAnalysis}
            isRequired={fieldMap.type.isRequired}
            options={typeOptions}
          />
        </div>

        {totalValue !== null &&
          totalValue !== 0 &&
          currencyCode &&
          currencyCode !== settings.default_currency && (
          <ToolWindow
            title={t(locale, "analyze.exchangeRateTitle", {
              date: formatLocaleDate(issuedAtValue ?? new Date(), locale, {
                day: "numeric",
                month: "long",
                year: "numeric",
              }),
            })}
          >
            <CurrencyConverterTool
              originalTotal={totalValue}
              originalCurrencyCode={currencyCode}
              targetCurrencyCode={settings.default_currency}
              date={issuedAtValue ?? new Date()}
              onChange={(value) => updateField("convertedTotal", value)}
              locale={locale}
            />
            <input type="hidden" name="convertedCurrencyCode" value={settings.default_currency} />
          </ToolWindow>
        )}

        <div className="flex flex-row gap-4">
          <FormInput
            title={fieldMap.issuedAt.name}
            type="date"
            name="issuedAt"
            value={formData.issuedAt}
            onChange={(e) => updateField("issuedAt", e.target.value)}
            hideIfEmpty={!fieldMap.issuedAt.isVisibleInAnalysis}
            required={fieldMap.issuedAt.isRequired}
          />
        </div>

        <div className="flex flex-row gap-4">
          <FormSelectCategory
            title={fieldMap.categoryCode.name}
            categories={categories}
            name="categoryCode"
            value={formData.categoryCode}
            onValueChange={(value) => updateField("categoryCode", value)}
            placeholder={t(locale, "analyze.selectCategory")}
            hideIfEmpty={!fieldMap.categoryCode.isVisibleInAnalysis}
            isRequired={fieldMap.categoryCode.isRequired}
          />

          {projects.length > 0 && (
            <FormSelectProject
              title={fieldMap.projectCode.name}
              projects={projects}
              name="projectCode"
              value={formData.projectCode}
              onValueChange={(value) => updateField("projectCode", value)}
              placeholder={t(locale, "analyze.selectProject")}
              hideIfEmpty={!fieldMap.projectCode.isVisibleInAnalysis}
              isRequired={fieldMap.projectCode.isRequired}
            />
          )}
        </div>

        <FormInput
          title={fieldMap.note.name}
          name="note"
          value={formData.note}
          onChange={(e) => updateField("note", e.target.value)}
          hideIfEmpty={!fieldMap.note.isVisibleInAnalysis}
          required={fieldMap.note.isRequired}
        />

        {extraFields.map((field) => (
          <FormInput
            key={field.code}
            type="text"
            title={field.name}
            name={field.code}
            value={formData[field.code as keyof typeof formData]}
            onChange={(e) => updateField(field.code, e.target.value)}
            hideIfEmpty={!field.isVisibleInAnalysis}
            required={field.isRequired}
          />
        ))}

        {Array.isArray(formData.items) && formData.items.length > 0 && (
          <ToolWindow title={t(locale, "analyze.detectedItems")}>
            <ItemsDetectTool file={file} data={itemsData} locale={locale} />
          </ToolWindow>
        )}

        <div className="hidden">
          <input type="text" name="items" value={JSON.stringify(formData.items)} readOnly />
          <FormTextarea
            title={fieldMap.text.name}
            name="text"
            value={formData.text}
            onChange={(e) => updateField("text", e.target.value)}
            hideIfEmpty={!fieldMap.text.isVisibleInAnalysis}
          />
        </div>

        <div className="flex justify-between gap-4 pt-6">
          <Button
            type="button"
            onClick={handleDelete}
            variant="destructive"
            disabled={isDeletePending}
          >
            <Trash2 className="h-4 w-4" />
            {isDeletePending ? t(locale, "common.deleting") : t(locale, "common.delete")}
          </Button>

          <Button type="submit" disabled={isSaving} data-save-button>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t(locale, "common.saving")}
              </>
            ) : (
              <>
                <ArrowDownToLine className="h-4 w-4" />
                {warnings.length > 0 && requiresWarningReview
                  ? t(locale, "common.saveAnyway")
                  : t(locale, "analyze.saveAsTransaction")}
              </>
            )}
          </Button>
        </div>

        <div>
          {saveError && <FormError>{saveError}</FormError>}
        </div>
      </form>
    </>
  )
}
