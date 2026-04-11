"use client"

import { extractInvoiceFromPdfAction } from "@/ai/extract-invoice"
import type { ExtractedInvoice } from "@/ai/invoice-extraction-schema"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SectionLabel } from "@/components/ui/section-label"
import { t } from "@/lib/i18n"
import type { UiLocale } from "@/lib/locale"
import type { Customer } from "@/prisma/client"
import { FileUp, Loader2, Sparkles, X } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

export type ExtractionResult = {
  fileId: string
  filePath: string
  extracted: ExtractedInvoice
  matchedCustomers: Customer[]
  previewDataUrls: string[]
  chosenCustomerId: string | null
}

/**
 * Dropzone panel shown above the New Invoice form. User drops an
 * existing invoice PDF → LLM extracts fields via `extractInvoiceFromPdfAction`
 * → this panel hands the result up to the parent which re-mounts
 * `<InvoiceGenerator />` with the extracted data as `initialFormData`.
 *
 * All extracted data is a suggestion. The user reviews and edits every
 * field before saving through the normal `createInvoiceAction` flow.
 */
export function ExtractFromPdfPanel({
  onExtracted,
  onClear,
  currentResult,
  locale,
}: {
  onExtracted: (result: ExtractionResult) => void
  onClear: () => void
  currentResult: ExtractionResult | null
  locale: UiLocale
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    setIsExtracting(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const result = await extractInvoiceFromPdfAction(formData)

      if (!result.success || !result.data) {
        setError(result.error ?? t(locale, "invoices.extractFailed"))
        toast.error(result.error ?? t(locale, "invoices.extractFailed"))
        return
      }

      // Pick the best customer automatically if there's exactly one match
      const chosenCustomerId =
        result.data.matchedCustomers.length === 1 ? result.data.matchedCustomers[0].id : null

      onExtracted({
        fileId: result.data.fileId,
        filePath: result.data.filePath,
        extracted: result.data.extracted,
        matchedCustomers: result.data.matchedCustomers,
        previewDataUrls: result.data.previewDataUrls,
        chosenCustomerId,
      })

      toast.success(t(locale, "invoices.extractSuccess"))
    } finally {
      setIsExtracting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleCustomerPick = (customerId: string | null) => {
    if (!currentResult) return
    onExtracted({ ...currentResult, chosenCustomerId: customerId })
  }

  const handleClear = () => {
    setError(null)
    onClear()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // Empty state — just the dropzone
  if (!currentResult) {
    return (
      <Card className="mb-6 border-dashed">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <SectionLabel>{t(locale, "invoices.extractLabel")}</SectionLabel>
              <p className="font-medium text-foreground">{t(locale, "invoices.extractTitle")}</p>
              <p className="text-sm text-muted-foreground">{t(locale, "invoices.extractDescription")}</p>
            </div>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              disabled={isExtracting}
              onClick={() => fileInputRef.current?.click()}
            >
              {isExtracting ? (
                <>
                  <Loader2 className="animate-spin" /> {t(locale, "invoices.extracting")}
                </>
              ) : (
                <>
                  <FileUp /> {t(locale, "invoices.extractUpload")}
                </>
              )}
            </Button>
          </div>
          {error && <p className="sm:basis-full text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    )
  }

  // Filled state — show what was extracted and let user pick a customer
  const { extracted, matchedCustomers, chosenCustomerId } = currentResult
  const extractedCustomerName = extracted.customer.name || "(no name extracted)"

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardContent className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <SectionLabel>{t(locale, "invoices.extractReadyLabel")}</SectionLabel>
            <p className="font-medium text-foreground">{t(locale, "invoices.extractReadyTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t(locale, "invoices.extractReadyDescription")}
            </p>
            <dl className="mt-2 text-sm grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">{t(locale, "invoices.extractRecipientLabel")}</dt>
              <dd>{extractedCustomerName}</dd>
              {extracted.invoiceNumber && (
                <>
                  <dt className="text-muted-foreground">{t(locale, "invoices.extractInvoiceNumberLabel")}</dt>
                  <dd>{extracted.invoiceNumber}</dd>
                </>
              )}
              {extracted.total > 0 && (
                <>
                  <dt className="text-muted-foreground">{t(locale, "invoices.extractTotalLabel")}</dt>
                  <dd>
                    {extracted.currency || "EUR"} {extracted.total.toFixed(2)}
                  </dd>
                </>
              )}
              {extracted.items.length > 0 && (
                <>
                  <dt className="text-muted-foreground">{t(locale, "invoices.extractItemsLabel")}</dt>
                  <dd>
                    {t(locale, "invoices.extractItemsCount", { count: extracted.items.length })}
                  </dd>
                </>
              )}
            </dl>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
          <X /> {t(locale, "invoices.extractClear")}
        </Button>
      </div>

      {matchedCustomers.length > 0 && (
        <div className="mt-4 border-t border-primary/20 pt-3">
          <p className="text-sm font-medium mb-2">
            {matchedCustomers.length === 1
              ? t(locale, "invoices.extractMatchedCustomer")
              : t(locale, "invoices.extractMatchedMany", { count: matchedCustomers.length })}
          </p>
          <div className="flex flex-wrap gap-2">
            {matchedCustomers.map((customer) => {
              const isChosen = customer.id === chosenCustomerId
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => handleCustomerPick(isChosen ? null : customer.id)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    isChosen
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary"
                  }`}
                >
                  {customer.name}
                </button>
              )
            })}
          </div>
          {chosenCustomerId === null && matchedCustomers.length > 1 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t(locale, "invoices.extractPickCustomerHint")}
            </p>
          )}
        </div>
      )}

      {matchedCustomers.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t(locale, "invoices.extractNoCustomer")}
        </p>
      )}
      </CardContent>
    </Card>
  )
}
