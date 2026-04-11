"use client"

import { ExtractFromPdfPanel, type ExtractionResult } from "@/components/invoices/extract-from-pdf-panel"
import { InvoiceGenerator } from "@/components/invoices/invoice-generator"
import type { ExtractedInvoice } from "@/ai/invoice-extraction-schema"
import type { InvoiceTemplate } from "@/lib/invoice-pdf/templates"
import type { AdditionalTax, InvoiceFormData, InvoiceItem } from "@/lib/invoice-pdf/types"
import type { UiLocale } from "@/lib/locale"
import type { SettingsMap } from "@/models/settings"
import type { Currency, Customer, User } from "@/prisma/client"
import { useMemo, useState } from "react"

type InvoiceAppData = {
  templates: InvoiceTemplate[]
}

/**
 * Client wrapper for the New Invoice page. Owns the PDF-extraction state
 * so the extract panel and `InvoiceGenerator` can share data without a
 * full server round-trip.
 *
 * When extraction completes, we re-mount `InvoiceGenerator` via a `key`
 * prop so its `useReducer` picks up the new `initialFormData`. (The
 * component computes its initial state once on mount, so re-mounting is
 * the simplest way to seed it with extracted data.)
 */
export function NewInvoiceClient({
  user,
  settings,
  currencies,
  appData,
  customers,
  nextInvoiceNumber,
  locale,
}: {
  user: User
  settings: SettingsMap
  currencies: Currency[]
  appData: InvoiceAppData | null
  customers: Customer[]
  nextInvoiceNumber: string
  locale: UiLocale
}) {
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)

  const initialFormData = useMemo<Partial<InvoiceFormData> | undefined>(() => {
    if (!extraction) return undefined
    return extractedToFormData(extraction.extracted, nextInvoiceNumber)
  }, [extraction, nextInvoiceNumber])

  const initialCustomer = useMemo<Customer | null>(() => {
    if (!extraction?.chosenCustomerId) return null
    return customers.find((c) => c.id === extraction.chosenCustomerId) ?? null
  }, [extraction, customers])

  // When extraction found no matching customer, pre-fill the "new customer"
  // form fields with whatever the LLM extracted from the PDF.
  const initialNewCustomer = useMemo(() => {
    if (!extraction || extraction.chosenCustomerId) return undefined
    const c = extraction.extracted.customer
    if (!c.name && !c.vatNumber) return undefined
    return {
      name: c.name || undefined,
      country: c.country || undefined,
      vatNumber: c.vatNumber || undefined,
      street: c.street || undefined,
      zipCode: c.zipCode || undefined,
      city: c.city || undefined,
      email: c.email || undefined,
    }
  }, [extraction])

  // Re-mount InvoiceGenerator when a new extraction lands so its
  // useReducer seed picks up the initialFormData. Without the key change,
  // the reducer keeps the state it computed on first mount.
  const generatorKey = extraction ? `extracted-${extraction.fileId}-${extraction.chosenCustomerId ?? "none"}` : "empty"

  return (
    <>
      <ExtractFromPdfPanel
        onExtracted={setExtraction}
        onClear={() => setExtraction(null)}
        currentResult={extraction}
        locale={locale}
      />
      <InvoiceGenerator
        key={generatorKey}
        appData={appData}
        customers={customers}
        currencies={currencies}
        locale={locale}
        nextInvoiceNumber={nextInvoiceNumber}
        settings={settings}
        user={user}
        mode="create"
        initialFormData={initialFormData}
        initialCustomer={initialCustomer}
        initialNewCustomer={initialNewCustomer}
        importMode={Boolean(extraction)}
        uploadedFileId={extraction?.fileId ?? null}
        uploadedFilePath={extraction?.filePath ?? null}
        uploadedPreviewImages={extraction?.previewDataUrls ?? []}
      />
    </>
  )
}

/**
 * Pick the tax rate that will end up on the reconstructed invoice. The
 * extraction schema gives us a per-item taxRate but the TaxHacker form
 * stores VAT as a single `additionalTaxes` entry (name + rate + amount)
 * applied to the whole subtotal. We collapse by picking the rate used
 * on the most line items, falling back to the Belgian standard 21%.
 */
function dominantTaxRate(items: ExtractedInvoice["items"]): number {
  if (items.length === 0) return 21
  const counts = new Map<number, number>()
  for (const item of items) {
    const rate = Number.isFinite(item.taxRate) ? item.taxRate : 0
    counts.set(rate, (counts.get(rate) ?? 0) + 1)
  }
  let dominant = 21
  let best = 0
  for (const [rate, count] of counts) {
    if (count > best) {
      dominant = rate
      best = count
    }
  }
  return dominant
}

/**
 * Translate the LLM output into the shape `InvoiceGenerator` expects.
 *
 * The extraction schema uses single types only for Gemini compatibility
 * (see `ai/invoice-extraction-schema.ts`), which means "missing" is
 * represented as empty string or 0 on the wire — not null. This function
 * treats both as "absent" via truthiness checks and falls back to sensible
 * defaults. The user reviews and edits everything before saving anyway.
 *
 * Importantly, we also pre-compute `additionalTaxes` based on the
 * extracted per-item taxRate. Without this, the merged form data would
 * inherit the base template's `BTW 21% / amount: 0` entry and the live
 * preview would show €0 VAT even though items imply 21%. The reducer's
 * `recalculateTaxAmounts` only runs on dispatched actions, not on the
 * initial `useReducer` seed.
 */
function extractedToFormData(
  extracted: ExtractedInvoice,
  fallbackInvoiceNumber: string
): Partial<InvoiceFormData> {
  const items: InvoiceItem[] =
    extracted.items.length > 0
      ? extracted.items.map((item) => {
          const quantity = item.quantity > 0 ? item.quantity : 1
          const unitPrice = item.unitPrice
          return {
            name: item.name,
            subtitle: "",
            showSubtitle: false,
            quantity,
            unitPrice,
            subtotal: Number((quantity * unitPrice).toFixed(2)),
          }
        })
      : // Fallback: no items extracted but we have a total → synthesize
        // a single line so the form isn't empty.
        extracted.total > 0
        ? [
            {
              name: "Imported from PDF",
              subtitle: "",
              showSubtitle: false,
              quantity: 1,
              unitPrice: extracted.total,
              subtotal: extracted.total,
            },
          ]
        : []

  const subtotalSum = items.reduce((sum, item) => sum + item.subtotal, 0)
  const taxRate = dominantTaxRate(extracted.items)
  const additionalTaxes: AdditionalTax[] = [
    {
      name: "BTW",
      rate: taxRate,
      amount: Number(((subtotalSum * taxRate) / 100).toFixed(2)),
    },
  ]

  const customerLines = [
    extracted.customer.name,
    extracted.customer.street,
    [extracted.customer.zipCode, extracted.customer.city].filter(Boolean).join(" "),
    extracted.customer.country,
    extracted.customer.vatNumber ? `VAT: ${extracted.customer.vatNumber}` : "",
  ].filter((line) => line && String(line).trim().length > 0)

  const result: Partial<InvoiceFormData> = {
    invoiceNumber: extracted.invoiceNumber || fallbackInvoiceNumber,
    currency: extracted.currency || "EUR",
    items,
    additionalTaxes,
    notes: extracted.notes || "",
  }

  if (extracted.issuedAt) result.date = extracted.issuedAt
  if (extracted.dueDate) result.dueDate = extracted.dueDate
  if (customerLines.length > 0) result.billTo = customerLines.join("\n")

  return result
}
