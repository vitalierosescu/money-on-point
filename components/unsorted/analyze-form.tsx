"use client"

import { getMerchantAutofillAction, type MerchantAutofillProfile } from "@/app/(app)/expenses/actions"
import { analyzeFileAction, deleteUnsortedFileAction, saveFileAsTransactionAction } from "@/app/(app)/unsorted/actions"
import { CurrencyConverterTool } from "@/components/agents/currency-converter"
import { ItemsDetectTool } from "@/components/agents/items-detect"
import ToolWindow from "@/components/agents/tool-window"
import { FormError } from "@/components/forms/error"
import { LookupSelect } from "@/components/forms/lookup-select"
import { MerchantAutocomplete } from "@/components/forms/merchant-autocomplete"
import { FormInput, FormTextarea } from "@/components/forms/simple"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buildDocumentFilename } from "@/lib/document-filenames"
import { t } from "@/lib/i18n"
import { formatLocaleCurrency, formatLocaleDate, type UiLocale } from "@/lib/locale"
import { TransactionData } from "@/models/transactions"
import { Category, Currency, Field, File, Project } from "@/prisma/client"
import { AlertTriangle, ArrowDownToLine, Brain, Loader2, Plus, Trash2 } from "lucide-react"
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

function isBlankFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return false
}

function formatAutofillValue(value: string | number): string {
  return typeof value === "number" ? String(value) : value
}

function computeVatAmount(total: number, rate: number, basis: "gross" | "net"): string {
  if (!Number.isFinite(total) || !Number.isFinite(rate) || total <= 0 || rate < 0) {
    return ""
  }

  const amount = basis === "net" ? total * (rate / 100) : total * (rate / (100 + rate))
  return amount > 0 ? amount.toFixed(2) : ""
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
  const merchantVatProfileRef = useRef<{ rate: number; basis: "gross" | "net" } | null>(null)
  const merchantAutofillRequestRef = useRef(0)
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set())
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false)
  const [showDescription, setShowDescription] = useState(() => {
    if (file.cachedParseResult && typeof file.cachedParseResult === "object") {
      const cached = file.cachedParseResult as Record<string, unknown>
      return !!(cached.description && String(cached.description).trim())
    }
    return false
  })
  const [showNote, setShowNote] = useState(() => {
    if (file.cachedParseResult && typeof file.cachedParseResult === "object") {
      const cached = file.cachedParseResult as Record<string, unknown>
      return !!(cached.note && String(cached.note).trim())
    }
    return false
  })

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
  const cachedParseFields = useMemo(() => {
    if (!file.cachedParseResult || typeof file.cachedParseResult !== "object") {
      return new Set<string>()
    }

    return new Set(
      Object.entries(file.cachedParseResult as Record<string, unknown>)
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([key]) => key)
    )
  }, [file.cachedParseResult])
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
    const generatedDocumentName = buildDocumentFilename({
      issuedAt: normalizedIssuedAt,
      merchant: typeof cachedResults.merchant === "string" ? cachedResults.merchant : "",
      originalFilename: file.filename,
    })

    return {
      ...baseState,
      ...extraFieldsState,
      ...cachedResults,
      name:
        generatedDocumentName ??
        (typeof cachedResults.name === "string" && cachedResults.name.trim() ? cachedResults.name : baseState.name),
      issuedAt: normalizedIssuedAt,
    }
  }, [file.filename, settings, extraFields, file.cachedParseResult])
  const [formData, setFormData] = useState(initialFormState)
  const generatedDocumentName = useMemo(
    () =>
      buildDocumentFilename({
        issuedAt: formData.issuedAt,
        merchant: typeof formData.merchant === "string" ? formData.merchant : "",
        originalFilename: file.filename,
      }),
    [file.filename, formData.issuedAt, formData.merchant]
  )

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
  const vatRateValue = (formData as Record<string, unknown>).vat_rate
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

  useEffect(() => {
    if (formData.description && String(formData.description).trim()) setShowDescription(true)
  }, [formData.description])

  useEffect(() => {
    if (formData.note && String(formData.note).trim()) setShowNote(true)
  }, [formData.note])

  useEffect(() => {
    if (isNameManuallyEdited || !generatedDocumentName) return

    dirtyFieldsRef.current.add("name")
    setFormData((prev) => (prev.name === generatedDocumentName ? prev : { ...prev, name: generatedDocumentName }))
  }, [generatedDocumentName, isNameManuallyEdited])

  useEffect(() => {
    const merchantVatProfile = merchantVatProfileRef.current
    if (!merchantVatProfile) return
    if (dirtyFieldsRef.current.has("vat") || dirtyFieldsRef.current.has("vat_rate") || cachedParseFields.has("vat")) return

    const total = parseAmount(formData.total)
    const currentVatRate = parseAmount(vatRateValue)
    const vatRate = currentVatRate ?? merchantVatProfile.rate
    const nextVat =
      total !== null && total > 0 && vatRate !== null
        ? computeVatAmount(total, vatRate, merchantVatProfile.basis)
        : ""

    setFormData((prev) => {
      const currentVat = typeof (prev as Record<string, unknown>).vat === "string"
        ? ((prev as Record<string, unknown>).vat as string)
        : ""

      if (currentVat === nextVat) {
        return prev
      }

      return {
        ...prev,
        vat: nextVat,
      }
    })
  }, [cachedParseFields, formData.total, vatRateValue])

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
    if (name === "merchant" || name === "vat" || name === "vat_rate") {
      merchantVatProfileRef.current = null
    }
    setEditedFields((prev) => new Set(prev).add(name))
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  function mergeMerchantAutofill(profile: MerchantAutofillProfile) {
    merchantVatProfileRef.current =
      profile.vatRate !== null
        ? { rate: profile.vatRate, basis: profile.vatComputationBasis }
        : null

    setFormData((prev) => {
      const next = { ...prev } as Record<string, unknown>

      Object.entries(profile.fields).forEach(([key, value]) => {
        if (dirtyFieldsRef.current.has(key)) return
        if (!isBlankFieldValue(next[key]) && cachedParseFields.has(key)) return
        next[key] = formatAutofillValue(value)
      })

      if (
        profile.vatRate !== null &&
        !dirtyFieldsRef.current.has("vat_rate") &&
        (isBlankFieldValue(next.vat_rate) || !cachedParseFields.has("vat_rate"))
      ) {
        next.vat_rate = formatAutofillValue(profile.vatRate)
      }

      const resolvedVatRate = parseAmount(next.vat_rate) ?? profile.vatRate
      const total = parseAmount(next.total)
      if (
        resolvedVatRate !== null &&
        !dirtyFieldsRef.current.has("vat") &&
        (isBlankFieldValue(next.vat) || !cachedParseFields.has("vat")) &&
        total !== null &&
        total > 0
      ) {
        next.vat = computeVatAmount(total, resolvedVatRate, profile.vatComputationBasis)
      }

      return next as typeof prev
    })
  }

  async function handleMerchantSelect(merchant: string) {
    const trimmedMerchant = merchant.trim()
    merchantAutofillRequestRef.current += 1
    const requestId = merchantAutofillRequestRef.current

    if (!trimmedMerchant) {
      merchantVatProfileRef.current = null
      return
    }

    const result = await getMerchantAutofillAction(trimmedMerchant)
    if (merchantAutofillRequestRef.current !== requestId) {
      return
    }

    if (!result.success) {
      console.error(result.error)
      return
    }

    if (!result.profile) {
      merchantVatProfileRef.current = null
      return
    }

    mergeMerchantAutofill(result.profile)
  }

  function getFieldBadge(fieldCode: string) {
    if (editedFields.has(fieldCode)) {
      return (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground">
          {t(locale, "analyze.editedLabel")}
        </span>
      )
    }

    if (cachedParseFields.has(fieldCode)) {
      return <span className="rounded-full bg-info/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-info">AI</span>
    }

    return null
  }

  function fieldTitle(title: string, fieldCode: string) {
    const badge = getFieldBadge(fieldCode)
    if (!badge) return title

    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span>{title}</span>
        {badge}
      </span>
    )
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

        {cachedParseFields.size > 0 && (
          <div className="rounded-card border border-info/20 bg-info/5 p-4">
            <div className="text-sm font-semibold text-foreground">{t(locale, "analyze.aiSuggestionTitle")}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(locale, "analyze.aiSuggestionDescription")}{" "}
              <span className="rounded-full bg-info/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-info">AI</span>{" "}
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground">{t(locale, "analyze.editedLabel")}</span>
            </p>
          </div>
        )}

        {requiresWarningReview && (
          <div className="rounded-card border bg-card p-4">
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
        )}

        {warnings.length > 0 && requiresWarningReview && (
          <div ref={warningRef}>
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              <div>
                <AlertTitle>
                  {file.cachedParseResult
                    ? t(locale, "analyze.needsReviewTitle")
                    : t(locale, "analyze.warningTitle")}
                </AlertTitle>
                <AlertDescription>
                  <p>
                    {file.cachedParseResult
                      ? t(locale, "analyze.needsReviewDescription")
                      : t(locale, "analyze.warningDescription")}
                  </p>
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
          title={fieldTitle(fieldMap.name.name, "name")}
          name="name"
          value={formData.name}
          onChange={(e) => {
            setIsNameManuallyEdited(true)
            updateField("name", e.target.value)
          }}
          required={fieldMap.name.isRequired}
        />

        <MerchantAutocomplete
          title={fieldTitle(fieldMap.merchant.name, "merchant")}
          name="merchant"
          value={formData.merchant ?? ""}
          onChange={(next) => updateField("merchant", next)}
          onSelect={handleMerchantSelect}
          required={fieldMap.merchant.isRequired}
          locale={locale}
        />

        {showDescription ? (
          <FormInput
            title={fieldTitle(fieldMap.description.name, "description")}
            name="description"
            value={formData.description}
            onChange={(e) => updateField("description", e.target.value)}
            required={fieldMap.description.isRequired}
          />
        ) : (
          <>
            <input type="hidden" name="description" value={formData.description ?? ""} />
            <button
              type="button"
              onClick={() => setShowDescription(true)}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {fieldMap.description.name}
            </button>
          </>
        )}

        <div className="flex flex-wrap gap-4">
          <FormInput
            title={fieldTitle(fieldMap.total.name, "total")}
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

          <LookupSelect
            title={fieldTitle(fieldMap.currencyCode.name, "currencyCode")}
            name="currencyCode"
            value={formData.currencyCode ?? ""}
            items={currencies.map((c) => ({ code: c.code, name: c.code }))}
            onValueChange={(value) => updateField("currencyCode", value)}
            placeholder="–"
            isRequired={fieldMap.currencyCode.isRequired}
            locale={locale}
          />

          <input type="hidden" name="type" value={formData.type} />
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
            title={fieldTitle(fieldMap.issuedAt.name, "issuedAt")}
            type="date"
            name="issuedAt"
            value={formData.issuedAt}
            onChange={(e) => updateField("issuedAt", e.target.value)}
            required={fieldMap.issuedAt.isRequired}
          />
        </div>

        <div className="flex flex-row gap-4">
          <LookupSelect
            title={fieldTitle(fieldMap.categoryCode.name, "categoryCode")}
            name="categoryCode"
            value={formData.categoryCode ?? ""}
            items={categories.map((c) => ({ code: c.code, name: c.name, color: c.color ?? undefined }))}
            onValueChange={(value) => updateField("categoryCode", value)}
            placeholder={t(locale, "analyze.selectCategory")}
            isRequired={fieldMap.categoryCode.isRequired}
            locale={locale}
          />

          {projects.length > 0 && (
            <LookupSelect
              title={fieldTitle(fieldMap.projectCode.name, "projectCode")}
              name="projectCode"
              value={formData.projectCode ?? ""}
              items={projects.map((p) => ({ code: p.code, name: p.name, color: p.color ?? undefined }))}
              onValueChange={(value) => updateField("projectCode", value)}
              placeholder={t(locale, "analyze.selectProject")}
              isRequired={fieldMap.projectCode.isRequired}
              locale={locale}
            />
          )}
        </div>

        {showNote ? (
          <FormInput
            title={fieldTitle(fieldMap.note.name, "note")}
            name="note"
            value={formData.note}
            onChange={(e) => updateField("note", e.target.value)}
            required={fieldMap.note.isRequired}
          />
        ) : (
          <>
            <input type="hidden" name="note" value={formData.note ?? ""} />
            <button
              type="button"
              onClick={() => setShowNote(true)}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {fieldMap.note.name}
            </button>
          </>
        )}

        {(() => {
          const vatRateField = extraFields.find((f) => f.code === "vat_rate")
          const vatField = extraFields.find((f) => f.code === "vat")
          const regularExtraFields = extraFields.filter((f) => f.code !== "vat_rate" && f.code !== "vat")

          return (
            <>
              {regularExtraFields.map((field) => (
                <FormInput
                  key={field.code}
                  type="text"
                  title={fieldTitle(field.name, field.code)}
                  name={field.code}
                  value={formData[field.code as keyof typeof formData]}
                  onChange={(e) => updateField(field.code, e.target.value)}
                  required={field.isRequired}
                />
              ))}

              {(vatRateField || vatField) && (
                <div className="flex flex-row items-end gap-4">
                  {vatRateField && (
                    <div className="w-28 shrink-0">
                      <LookupSelect
                        title={fieldTitle(vatRateField.name, vatRateField.code)}
                        name={vatRateField.code}
                        value={String((formData as Record<string, unknown>)[vatRateField.code] ?? "")}
                        items={[
                          { code: "0", name: "0%" },
                          { code: "6", name: "6%" },
                          { code: "21", name: "21%" },
                        ]}
                        onValueChange={(value) => updateField(vatRateField.code, value)}
                        placeholder="–"
                        isRequired={vatRateField.isRequired}
                        locale={locale}
                      />
                    </div>
                  )}
                  {vatField && (
                    <div className="flex-1">
                      <FormInput
                        title={fieldTitle(vatField.name, vatField.code)}
                        name={vatField.code}
                        type="number"
                        step="0.01"
                        value={String((formData as Record<string, unknown>)[vatField.code] ?? "")}
                        onChange={(e) => updateField(vatField.code, e.target.value)}
                        required={vatField.isRequired}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )
        })()}

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
