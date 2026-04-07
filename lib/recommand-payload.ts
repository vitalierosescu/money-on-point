import { normalizeCountryCode } from "@/lib/invoice-delivery"
import { Prisma, User } from "@/prisma/client"

export type RecommandAttachment = {
  id: string
  documentType: string
  mimeCode: string
  filename: string
  embeddedDocument: string
}

function formatDateForApi(date: Date | string | null | undefined): string | undefined {
  if (!date) return undefined
  const value = date instanceof Date ? date : new Date(date)
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10)
}

function extractIban(value?: string | null): string | null {
  if (!value) return null
  const compact = value.toUpperCase().replace(/\s+/g, "")
  const match = compact.match(/[A-Z]{2}[0-9A-Z]{13,32}/)
  return match?.[0] ?? null
}

function normalizeOptionalText(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function buildStreetAddress(street?: string | null, houseNumber?: string | null, extraLine?: string | null) {
  const primaryLine = [street?.trim(), houseNumber?.trim()].filter(Boolean).join(" ").trim()
  return {
    street: primaryLine || normalizeOptionalText(street),
    street2: normalizeOptionalText(extraLine),
  }
}

function getPeppolVatCategory(invoice: Prisma.InvoiceGetPayload<{ include: { customer: true } }>, taxRate: number) {
  if (invoice.isVatReversed) {
    return { category: "AE", percentage: "0.00" }
  }

  if (taxRate <= 0) {
    return { category: "Z", percentage: "0.00" }
  }

  return { category: "S", percentage: taxRate.toFixed(2) }
}

export function buildRecommandInvoicePayload(
  user: User,
  settings: Record<string, string>,
  invoice: Prisma.InvoiceGetPayload<{ include: { customer: true } }>,
  attachments?: RecommandAttachment[]
) {
  const buyerAddress = buildStreetAddress(
    invoice.customer.street,
    invoice.customer.houseNumber,
    invoice.customer.bus
  )
  const items = Array.isArray(invoice.items) ? invoice.items : []
  const taxes = Array.isArray(invoice.taxes) ? invoice.taxes : []
  const taxRate =
    invoice.isVatReversed
      ? 0
      : typeof taxes[0] === "object" &&
          taxes[0] !== null &&
          "rate" in taxes[0] &&
          typeof taxes[0].rate === "number"
        ? taxes[0].rate
        : invoice.subtotal > 0
          ? Number(((invoice.taxTotal / invoice.subtotal) * 100).toFixed(2))
          : 0
  const vat = getPeppolVatCategory(invoice, taxRate)

  const lines = items
    .filter((item): item is { name?: string; subtitle?: string; quantity?: number; unitPrice?: number; subtotal?: number } => {
      return typeof item === "object" && item !== null
    })
    .map((item, index) => ({
      name: item.name?.trim() || `Line ${index + 1}`,
      description: item.subtitle?.trim() || undefined,
      sellersId: `${invoice.invoiceNumber}-${index + 1}`,
      quantity: Number(item.quantity ?? 1).toFixed(2),
      unitCode: "C62",
      netPriceAmount: Number(item.unitPrice ?? 0).toFixed(2),
      vat,
    }))

  return {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: formatDateForApi(invoice.issuedAt),
    dueDate: formatDateForApi(invoice.dueDate),
    note: normalizeOptionalText(invoice.notes),
    buyerReference: normalizeOptionalText(invoice.customer.contactPerson) ?? invoice.invoiceNumber,
    purchaseOrderReference: normalizeOptionalText(invoice.poNumber),
    buyer: {
      vatNumber: invoice.customer.vatNumber,
      name: invoice.customer.name,
      street: buyerAddress.street,
      street2: buyerAddress.street2,
      city: invoice.customer.city,
      postalZone: invoice.customer.zipCode,
      country: normalizeCountryCode(invoice.customer.country),
    },
    paymentMeans: [
      {
        paymentMethod: "credit_transfer",
        reference: invoice.paymentReference || invoice.invoiceNumber,
        iban: extractIban(settings.business_iban || user.businessBankDetails),
      },
    ],
    paymentTerms: invoice.paymentTerms ? { note: invoice.paymentTerms } : undefined,
    lines,
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
  }
}
