"use client"

import { ExtractFromPdfPanel, type ExtractionResult } from "@/components/invoices/extract-from-pdf-panel"
import { InvoiceGenerator } from "@/components/invoices/invoice-generator"
import type { ExtractedInvoice } from "@/ai/invoice-extraction-schema"
import type { InvoiceTemplate } from "@/lib/invoice-pdf/templates"
import type { InvoiceFormData, InvoiceItem } from "@/lib/invoice-pdf/types"
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
}: {
  user: User
  settings: SettingsMap
  currencies: Currency[]
  appData: InvoiceAppData | null
  customers: Customer[]
  nextInvoiceNumber: string
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
      />
      <InvoiceGenerator
        key={generatorKey}
        appData={appData}
        customers={customers}
        currencies={currencies}
        nextInvoiceNumber={nextInvoiceNumber}
        settings={settings}
        user={user}
        mode="create"
        initialFormData={initialFormData}
        initialCustomer={initialCustomer}
      />
    </>
  )
}

/**
 * Translate the LLM output into the shape `InvoiceGenerator` expects.
 * Missing fields fall back sensibly — the user reviews and edits before
 * saving anyway, so defaults are safer than leaving them undefined.
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
        extracted.total !== null
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

  const customerLines = [
    extracted.customer.name,
    extracted.customer.street,
    [extracted.customer.zipCode, extracted.customer.city].filter(Boolean).join(" "),
    extracted.customer.country,
    extracted.customer.vatNumber ? `VAT: ${extracted.customer.vatNumber}` : null,
  ].filter((line) => line && String(line).trim().length > 0)

  const result: Partial<InvoiceFormData> = {
    invoiceNumber: extracted.invoiceNumber ?? fallbackInvoiceNumber,
    currency: extracted.currency ?? "EUR",
    items,
    notes: extracted.notes ?? "",
  }

  if (extracted.issuedAt) result.date = extracted.issuedAt
  if (extracted.dueDate) result.dueDate = extracted.dueDate
  if (customerLines.length > 0) result.billTo = customerLines.join("\n")

  return result
}
