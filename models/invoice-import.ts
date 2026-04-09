import { prisma } from "@/lib/db"
import { createCustomer } from "@/models/customers"
import { Customer } from "@/prisma/client"

/**
 * Invoice CSV import model layer.
 *
 * Unlike the expense CSV import (which uses dynamic `Field[]` definitions
 * from `models/fields.ts`), invoice import has a fixed target schema
 * because Invoice columns are well-defined in the Prisma model.
 */

export type InvoiceImportFieldCode =
  | "invoiceNumber"
  | "issuedAt"
  | "dueDate"
  | "paidAt"
  | "customerName"
  | "customerEmail"
  | "customerVatNumber"
  | "customerCountry"
  | "currency"
  | "subtotal"
  | "taxTotal"
  | "total"
  | "description"
  | "notes"
  | "poNumber"
  | "paymentReference"
  | "status"

export type InvoiceImportFieldDef = {
  code: InvoiceImportFieldCode
  label: string
  required: boolean
  hint?: string
}

export const INVOICE_IMPORT_FIELDS: InvoiceImportFieldDef[] = [
  { code: "invoiceNumber", label: "Invoice number", required: true, hint: "Unique per user" },
  { code: "issuedAt", label: "Issue date", required: true, hint: "e.g. 2025-03-14 or 14/03/2025" },
  { code: "dueDate", label: "Due date", required: true },
  { code: "paidAt", label: "Paid date", required: false, hint: "If present, status defaults to paid" },
  { code: "customerName", label: "Customer name", required: true },
  { code: "customerEmail", label: "Customer email", required: false },
  { code: "customerVatNumber", label: "Customer VAT number", required: false },
  { code: "customerCountry", label: "Customer country", required: false, hint: "2-letter code, defaults to BE" },
  { code: "currency", label: "Currency", required: false, hint: "Defaults to EUR" },
  { code: "total", label: "Total (incl. VAT)", required: true, hint: "Decimal, e.g. 1210.00" },
  { code: "subtotal", label: "Subtotal (excl. VAT)", required: false, hint: "Derived from total if blank" },
  { code: "taxTotal", label: "Tax total", required: false, hint: "Derived from total if blank" },
  { code: "description", label: "Description", required: false, hint: "Becomes a single line item" },
  { code: "notes", label: "Notes", required: false },
  { code: "poNumber", label: "PO number", required: false },
  { code: "paymentReference", label: "Payment reference", required: false },
  { code: "status", label: "Status", required: false, hint: "draft | sent | paid | overdue | cancelled" },
]

const INVOICE_IMPORT_FIELD_CODES = new Set(INVOICE_IMPORT_FIELDS.map((f) => f.code))

export function isInvoiceImportFieldCode(value: string): value is InvoiceImportFieldCode {
  return INVOICE_IMPORT_FIELD_CODES.has(value as InvoiceImportFieldCode)
}

/**
 * Parse a decimal string like "1,234.56" / "1.234,56" / "1210" into
 * integer cents. Returns null on parse failure.
 */
export function parseDecimalToCents(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null

  // Strip currency symbols and spaces
  let cleaned = trimmed.replace(/[^\d,.\-]/g, "")
  if (!cleaned) return null

  // Detect whether comma or dot is the decimal separator
  const lastComma = cleaned.lastIndexOf(",")
  const lastDot = cleaned.lastIndexOf(".")
  if (lastComma > lastDot) {
    // European format: "1.234,56" → "1234.56"
    cleaned = cleaned.replace(/\./g, "").replace(",", ".")
  } else {
    // US/ISO format: "1,234.56" → "1234.56"
    cleaned = cleaned.replace(/,/g, "")
  }

  const asFloat = Number.parseFloat(cleaned)
  if (!Number.isFinite(asFloat)) return null

  return Math.round(asFloat * 100)
}

/**
 * Parse a date string in common formats (ISO, DD/MM/YYYY, DD-MM-YYYY,
 * MM/DD/YYYY). Returns null on failure. Prefers DD/MM for ambiguous cases
 * because the primary user is Belgian.
 */
export function parseImportDate(raw: string | null | undefined): Date | null {
  if (raw === null || raw === undefined) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null

  // Try ISO first (YYYY-MM-DD, with optional time)
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed)
    if (!Number.isNaN(d.getTime())) return d
  }

  // DD/MM/YYYY or DD-MM-YYYY or D/M/YY
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/)
  if (dmyMatch) {
    const day = Number.parseInt(dmyMatch[1], 10)
    const month = Number.parseInt(dmyMatch[2], 10)
    let year = Number.parseInt(dmyMatch[3], 10)
    if (year < 100) year += 2000
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const d = new Date(Date.UTC(year, month - 1, day))
      if (!Number.isNaN(d.getTime())) return d
    }
  }

  // Fallback to native parsing
  const fallback = new Date(trimmed)
  if (!Number.isNaN(fallback.getTime())) return fallback

  return null
}

const NORMALIZED_STATUSES = new Set(["draft", "sent", "overdue", "partially_paid", "paid", "cancelled"])

export function normalizeImportStatus(raw: string | null | undefined, hasPaidAt: boolean): string {
  const trimmed = (raw ?? "").trim().toLowerCase()
  if (trimmed && NORMALIZED_STATUSES.has(trimmed)) return trimmed
  if (hasPaidAt) return "paid"
  return "sent"
}

/**
 * Resolve an existing Customer by normalized name + email, or create a new
 * minimal one. Mirrors the auto-create pattern from `models/export_and_import.ts`
 * (see `importCategory` / `importProject`).
 *
 * Returns the customer plus a flag indicating whether we created it, so the
 * caller can surface a "will create X new customers" preview.
 */
export async function resolveOrCreateCustomer(
  userId: string,
  input: {
    customerName: string
    customerEmail?: string | null
    customerVatNumber?: string | null
    customerCountry?: string | null
  }
): Promise<{ customer: Customer; created: boolean }> {
  const name = input.customerName.trim()
  const email = input.customerEmail?.trim() || null

  // 1. Exact name + email match (most specific)
  if (email) {
    const byNameAndEmail = await prisma.customer.findFirst({
      where: {
        userId,
        name: { equals: name, mode: "insensitive" },
        email: { equals: email, mode: "insensitive" },
      },
    })
    if (byNameAndEmail) return { customer: byNameAndEmail, created: false }
  }

  // 2. Name-only match (fall back for CSVs that don't have email)
  const byName = await prisma.customer.findFirst({
    where: {
      userId,
      name: { equals: name, mode: "insensitive" },
    },
  })
  if (byName) return { customer: byName, created: false }

  // 3. Create a minimal Customer
  const created = await createCustomer(userId, {
    name,
    email,
    vatNumber: input.customerVatNumber?.trim() || null,
    country: input.customerCountry?.trim() || "BE",
  })
  return { customer: created, created: true }
}

/**
 * Build the items JSON array for an imported invoice. MVP: one synthetic
 * line item per row. Multi-line imports are out of scope for MVP.
 */
export function buildImportedInvoiceItems(
  description: string | null,
  totalCents: number,
  subtotalCents: number,
  taxTotalCents: number
): Array<{
  name: string
  quantity: number
  unitPrice: number
  taxRate: number
  subtotal: number
}> {
  const unitPrice = subtotalCents / 100
  const taxRate = subtotalCents > 0 ? Math.round((taxTotalCents / subtotalCents) * 100) : 0
  return [
    {
      name: description?.trim() || "Imported invoice",
      quantity: 1,
      unitPrice,
      taxRate,
      subtotal: subtotalCents / 100,
    },
  ]
}

/**
 * Derive subtotal + taxTotal from total when the CSV doesn't provide them.
 * Assumes Belgian default 21% VAT. The user can always edit after import.
 */
export function deriveSubtotalAndTax(
  totalCents: number,
  providedSubtotalCents: number | null,
  providedTaxTotalCents: number | null
): { subtotalCents: number; taxTotalCents: number } {
  if (providedSubtotalCents !== null && providedTaxTotalCents !== null) {
    return { subtotalCents: providedSubtotalCents, taxTotalCents: providedTaxTotalCents }
  }
  if (providedSubtotalCents !== null) {
    return { subtotalCents: providedSubtotalCents, taxTotalCents: totalCents - providedSubtotalCents }
  }
  if (providedTaxTotalCents !== null) {
    return { subtotalCents: totalCents - providedTaxTotalCents, taxTotalCents: providedTaxTotalCents }
  }
  // Neither provided: back out from total assuming 21% VAT
  const subtotalCents = Math.round(totalCents / 1.21)
  return { subtotalCents, taxTotalCents: totalCents - subtotalCents }
}

export type ParsedInvoiceRow = {
  rowNumber: number
  invoiceNumber: string
  issuedAt: Date
  dueDate: Date
  paidAt: Date | null
  customerName: string
  customerEmail: string | null
  customerVatNumber: string | null
  customerCountry: string | null
  currency: string
  totalCents: number
  subtotalCents: number
  taxTotalCents: number
  description: string | null
  notes: string | null
  poNumber: string | null
  paymentReference: string | null
  status: string
}

export type RowParseError = {
  rowNumber: number
  reason: string
}

/**
 * Take a raw CSV row (values keyed by field code) and turn it into a
 * validated ParsedInvoiceRow. Returns either the parsed row or an error
 * describing why the row failed.
 */
export function parseInvoiceRow(
  rowNumber: number,
  raw: Record<string, string>
): { ok: true; row: ParsedInvoiceRow } | { ok: false; error: RowParseError } {
  const err = (reason: string) => ({
    ok: false as const,
    error: { rowNumber, reason },
  })

  const invoiceNumber = raw.invoiceNumber?.trim()
  if (!invoiceNumber) return err("Missing invoice number")

  const customerName = raw.customerName?.trim()
  if (!customerName) return err("Missing customer name")

  const issuedAt = parseImportDate(raw.issuedAt)
  if (!issuedAt) return err("Unparseable issue date")

  const dueDate = parseImportDate(raw.dueDate)
  if (!dueDate) return err("Unparseable due date")

  const paidAt = raw.paidAt ? parseImportDate(raw.paidAt) : null

  const totalCents = parseDecimalToCents(raw.total)
  if (totalCents === null) return err("Missing or unparseable total")
  if (totalCents <= 0) return err("Total must be greater than zero")

  const providedSubtotal = raw.subtotal ? parseDecimalToCents(raw.subtotal) : null
  const providedTaxTotal = raw.taxTotal ? parseDecimalToCents(raw.taxTotal) : null
  const { subtotalCents, taxTotalCents } = deriveSubtotalAndTax(totalCents, providedSubtotal, providedTaxTotal)

  return {
    ok: true,
    row: {
      rowNumber,
      invoiceNumber,
      issuedAt,
      dueDate,
      paidAt,
      customerName,
      customerEmail: raw.customerEmail?.trim() || null,
      customerVatNumber: raw.customerVatNumber?.trim() || null,
      customerCountry: raw.customerCountry?.trim() || null,
      currency: (raw.currency?.trim() || "EUR").toUpperCase(),
      totalCents,
      subtotalCents,
      taxTotalCents,
      description: raw.description?.trim() || null,
      notes: raw.notes?.trim() || null,
      poNumber: raw.poNumber?.trim() || null,
      paymentReference: raw.paymentReference?.trim() || null,
      status: normalizeImportStatus(raw.status, raw.paidAt ? true : false),
    },
  }
}
