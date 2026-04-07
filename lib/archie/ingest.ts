import { addDays, format } from "date-fns"
import { prisma } from "@/lib/db"
import defaultTemplates from "@/lib/invoice-pdf/templates"
import type { AdditionalFee, AdditionalTax, InvoiceFormData, InvoiceItem } from "@/lib/invoice-pdf/types"
import { sendInvoiceViaPeppolForUser } from "@/lib/peppol-send"
import { listGroupInvoices, type ArchieInvoiceRest } from "@/lib/archie/client"
import { createCustomer, updateCustomer } from "@/models/customers"
import { createInvoice, updateInvoice } from "@/models/invoices"
import { createTransaction } from "@/models/transactions"
import { getSettings } from "@/models/settings"
import { getUserById } from "@/models/users"

const DEFAULT_DUE_DAYS = 30

type ArchieTaxNumber = { name?: string; value?: string }
type ArchieTaxDetail = { name?: string; number?: string; percentage?: number; amount?: number }
type ArchieLine = {
  item_description?: string
  description?: string
  quantity?: number
  unit_price?: number
  unit_price_with_discount?: number
  price?: number
  price_with_discount?: number
}

type ArchieInvoice = {
  uuid?: string
  reference?: string
  state?: string
  invoice_date?: string
  due_date?: string
  note?: string
  recipients?: string[]
  space_currency?: string
  billed_entity_name?: string
  billed_entity_street_address?: string
  billed_entity_postal_code?: string
  billed_entity_city?: string
  billed_entity_country?: string
  billed_entity_tax_numbers?: ArchieTaxNumber[]
  price?: number
  price_with_discount?: number
  price_with_discount_taxes?: number
  price_with_discount_with_taxes?: number
  price_with_discount_taxes_details?: ArchieTaxDetail[]
  lines?: ArchieLine[]
}

type SyncStats = { ingested: number; sent: number; skipped: number; failed: number }

function parseList(value?: string | null): string[] {
  if (!value) return []
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function toCents(value: unknown): number {
  return Math.round(toNumber(value) * 100)
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getDefaultDueDate(issuedAt: Date): Date {
  return addDays(issuedAt, DEFAULT_DUE_DAYS)
}

function extractTaxNumbers(taxNumbers?: ArchieTaxNumber[] | null) {
  const result: { vatNumber?: string; peppolId?: string } = {}

  if (!Array.isArray(taxNumbers)) return result

  for (const tax of taxNumbers) {
    const name = (tax.name || "").toUpperCase()
    const value = tax.value?.trim()
    if (!value) continue

    if (!result.peppolId && name.includes("PEPPOL")) {
      result.peppolId = value
      continue
    }

    if (!result.vatNumber && (name.includes("VAT") || name.includes("TVA") || name.includes("BTW") || name.includes("TAX"))) {
      result.vatNumber = value
    }
  }

  if (!result.vatNumber) {
    const fallback = taxNumbers.find((item) => item.value && !item.name)
    if (fallback?.value) result.vatNumber = fallback.value
  }

  return result
}

function buildBillingEmails(recipients?: unknown): string[] {
  if (!Array.isArray(recipients)) return []
  return recipients
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function buildInvoiceItems(lines?: ArchieLine[]): InvoiceItem[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    return [{ name: "Item", subtitle: "", showSubtitle: false, quantity: 1, unitPrice: 0, subtotal: 0 }]
  }

  return lines.map((line, index) => {
    const quantity = toNumber(line.quantity) || 1
    const unitPrice = toNumber(line.unit_price_with_discount ?? line.unit_price ?? 0)
    const subtotal = toNumber(line.price_with_discount ?? line.price ?? unitPrice * quantity)
    const name = (line.item_description || line.description || `Item ${index + 1}`).toString().trim()
    const subtitleRaw = (line.description || "").toString().trim()
    const subtitle = subtitleRaw && subtitleRaw !== name ? subtitleRaw : ""

    return {
      name: name || `Item ${index + 1}`,
      subtitle,
      showSubtitle: subtitle.length > 0,
      quantity,
      unitPrice,
      subtotal,
    }
  })
}

function buildAdditionalTaxes(invoice: ArchieInvoice, subtotal: number, taxTotal: number): AdditionalTax[] {
  if (Array.isArray(invoice.price_with_discount_taxes_details) && invoice.price_with_discount_taxes_details.length > 0) {
    return invoice.price_with_discount_taxes_details.map((detail) => ({
      name: detail.name || detail.number || "Tax",
      rate: toNumber(detail.percentage ?? 0),
      amount: toNumber(detail.amount ?? 0),
    }))
  }

  if (taxTotal > 0) {
    return [
      {
        name: "VAT",
        rate: subtotal > 0 ? Number(((taxTotal / subtotal) * 100).toFixed(2)) : 0,
        amount: taxTotal,
      },
    ]
  }

  return []
}

function buildBillTo(customer: { name: string; street?: string | null; zipCode?: string | null; city?: string | null; country?: string | null; vatNumber?: string | null }) {
  const lines = [
    customer.name,
    customer.street || "",
    [customer.zipCode, customer.city].filter(Boolean).join(" "),
    customer.country || "",
    customer.vatNumber ? `VAT: ${customer.vatNumber}` : "",
  ].filter((line) => line && line.trim().length > 0)

  return lines.join("\n")
}

async function ensureCustomerFromArchie(userId: string, invoice: ArchieInvoice, entityType: string, entityId: string) {
  const mapping = await prisma.archieCustomerMap.findUnique({
    where: {
      userId_archieEntityType_archieEntityId: {
        userId,
        archieEntityType: entityType,
        archieEntityId: entityId,
      },
    },
  })

  const taxInfo = extractTaxNumbers(invoice.billed_entity_tax_numbers)
  const billingEmails = buildBillingEmails(invoice.recipients)
  const customerData = {
    name: invoice.billed_entity_name?.trim() || "Archie customer",
    email: billingEmails[0] || undefined,
    billingEmails,
    street: invoice.billed_entity_street_address?.trim() || undefined,
    zipCode: invoice.billed_entity_postal_code?.trim() || undefined,
    city: invoice.billed_entity_city?.trim() || undefined,
    country: invoice.billed_entity_country?.trim() || undefined,
    vatNumber: taxInfo.vatNumber,
    peppolId: taxInfo.peppolId,
    invoiceDeliveryMethod: taxInfo.peppolId ? "peppol" : "manual_choice",
  }

  if (mapping) {
    const existing = await prisma.customer.findFirst({
      where: { id: mapping.customerId, userId },
    })

    if (existing) {
      const updateData: Record<string, unknown> = {}
      if (!existing.vatNumber && customerData.vatNumber) updateData.vatNumber = customerData.vatNumber
      if (!existing.peppolId && customerData.peppolId) updateData.peppolId = customerData.peppolId
      if (!existing.street && customerData.street) updateData.street = customerData.street
      if (!existing.zipCode && customerData.zipCode) updateData.zipCode = customerData.zipCode
      if (!existing.city && customerData.city) updateData.city = customerData.city
      if (!existing.country && customerData.country) updateData.country = customerData.country
      if ((!existing.billingEmails || (existing.billingEmails as string[]).length === 0) && billingEmails.length > 0) {
        updateData.billingEmails = billingEmails
      }
      if (existing.invoiceDeliveryMethod !== "peppol" && customerData.peppolId) {
        updateData.invoiceDeliveryMethod = "peppol"
      }

      if (Object.keys(updateData).length > 0) {
        await updateCustomer(existing.id, userId, updateData)
      }

      return existing
    }
  }

  const created = await createCustomer(userId, customerData)
  await prisma.archieCustomerMap.create({
    data: {
      userId,
      archieEntityType: entityType,
      archieEntityId: entityId,
      customerId: created.id,
    },
  })

  return created
}

async function ensureInvoiceTransaction(userId: string, invoiceId: string, invoiceNumber: string, total: number, currency: string, issuedAt: Date, customerId: string, transactionId?: string | null) {
  if (transactionId) {
    const existing = await prisma.transaction.findFirst({ where: { id: transactionId, userId } })
    if (existing) return existing.id
  }

  const transaction = await createTransaction(userId, {
    name: invoiceNumber,
    total,
    currencyCode: currency,
    type: "income",
    issuedAt,
    categoryCode: "invoice",
    customerId,
    files: [],
  })

  await prisma.invoice.update({
    where: { id: invoiceId, userId },
    data: { transactionId: transaction.id },
  })

  return transaction.id
}

async function ensureUniqueInvoiceNumber(userId: string, baseNumber: string): Promise<string> {
  let candidate = baseNumber
  let counter = 1

  while (await prisma.invoice.findFirst({ where: { userId, invoiceNumber: candidate } })) {
    candidate = `${baseNumber}-${counter}`
    counter += 1
  }

  return candidate
}

async function upsertArchieInvoice(
  userId: string,
  invoice: ArchieInvoice,
  entityType: string,
  entityId: string
): Promise<{ ingested: boolean; sent: boolean; failed: boolean; skipped: boolean }> {
  if (invoice.state && invoice.state !== "open") {
    return { ingested: false, sent: false, failed: false, skipped: true }
  }

  const archieInvoiceId = invoice.uuid?.trim()
  if (!archieInvoiceId) {
    return { ingested: false, sent: false, failed: false, skipped: true }
  }

  const mapping = await prisma.archieInvoiceMap.findUnique({
    where: { userId_archieInvoiceId: { userId, archieInvoiceId } },
  })

  const existingInvoice = mapping
    ? await prisma.invoice.findFirst({ where: { id: mapping.invoiceId, userId }, include: { customer: true } })
    : null

  if (existingInvoice?.deliveryStatus === "sent") {
    return { ingested: false, sent: false, failed: false, skipped: true }
  }

  const customer = await ensureCustomerFromArchie(userId, invoice, entityType, entityId)

  const issuedAt = parseDate(invoice.invoice_date) || new Date()
  const dueDate = parseDate(invoice.due_date) || getDefaultDueDate(issuedAt)
  const currency = invoice.space_currency || "EUR"

  const items = buildInvoiceItems(invoice.lines)
  const subtotalValue = toNumber(invoice.price_with_discount ?? invoice.price ?? 0)
  const taxTotalValue = toNumber(invoice.price_with_discount_taxes ?? 0)
  const totalValue = toNumber(invoice.price_with_discount_with_taxes ?? subtotalValue + taxTotalValue)

  const subtotal = toCents(subtotalValue)
  const taxTotal = toCents(taxTotalValue)
  const total = toCents(totalValue)

  const additionalTaxes = buildAdditionalTaxes(invoice, subtotalValue, taxTotalValue)
  const additionalFees: AdditionalFee[] = []

  const user = await getUserById(userId)
  if (!user) {
    return { ingested: false, sent: false, failed: true, skipped: false }
  }

  const settings = await getSettings(userId)
  let invoiceId = existingInvoice?.id || null
  let invoiceNumber = existingInvoice?.invoiceNumber || null

  if (!invoiceNumber) {
    const baseNumber = `ARCHIE-${invoice.reference?.trim() || archieInvoiceId}`
    invoiceNumber = await ensureUniqueInvoiceNumber(userId, baseNumber)
  }

  const template = defaultTemplates(user, settings)[0]?.formData
  const templateData: InvoiceFormData = {
    ...(template as InvoiceFormData),
    invoiceNumber,
    date: format(issuedAt, "yyyy-MM-dd"),
    dueDate: format(dueDate, "yyyy-MM-dd"),
    currency,
    billTo: buildBillTo({
      name: customer.name,
      street: customer.street,
      zipCode: customer.zipCode,
      city: customer.city,
      country: customer.country,
      vatNumber: customer.vatNumber,
    }),
    items,
    additionalTaxes,
    additionalFees,
    notes: invoice.note || "",
  }

  if (!invoiceId) {

    const createdInvoice = await createInvoice(userId, {
      customerId: customer.id,
      invoiceNumber,
      status: "sent",
      issuedAt,
      dueDate,
      currency,
      subtotal,
      taxTotal,
      total,
      items,
      taxes: additionalTaxes,
      fees: additionalFees,
      notes: invoice.note ?? null,
      deliveryMethod: "peppol",
      deliveryStatus: "not_sent",
      templateData,
    })

    invoiceId = createdInvoice.id
    await prisma.archieInvoiceMap.create({
      data: { userId, archieInvoiceId, invoiceId },
    })
  } else {
    await updateInvoice(invoiceId, userId, {
      issuedAt,
      dueDate,
      currency,
      subtotal,
      taxTotal,
      total,
      items,
      taxes: additionalTaxes,
      fees: additionalFees,
      notes: invoice.note ?? null,
      deliveryMethod: "peppol",
      deliveryStatus: "not_sent",
      templateData,
    })
  }

  await ensureInvoiceTransaction(
    userId,
    invoiceId,
    invoiceNumber || `ARCHIE-${archieInvoiceId}`,
    total,
    currency,
    issuedAt,
    customer.id,
    existingInvoice?.transactionId
  )

  const sendResult = await sendInvoiceViaPeppolForUser(userId, invoiceId)
  if (!sendResult.success) {
    return { ingested: true, sent: false, failed: true, skipped: false }
  }

  return { ingested: true, sent: true, failed: false, skipped: false }
}

export async function syncArchieInvoicesForUser(userId: string): Promise<SyncStats> {
  const settings = await getSettings(userId)
  const spaceDomain = settings.archie_space_domain?.trim()
  const groupUuids = parseList(settings.archie_group_uuids)

  if (!spaceDomain || groupUuids.length === 0) {
    return { ingested: 0, sent: 0, skipped: 0, failed: 1 }
  }

  const stats: SyncStats = { ingested: 0, sent: 0, skipped: 0, failed: 0 }

  for (const groupUuid of groupUuids) {
    const invoices = await listGroupInvoices(userId, settings, spaceDomain, groupUuid)
    for (const raw of invoices) {
      try {
        const result = await upsertArchieInvoice(userId, raw as ArchieInvoice, "group", groupUuid)
        if (result.ingested) stats.ingested += 1
        if (result.sent) stats.sent += 1
        if (result.failed) stats.failed += 1
        if (result.skipped) stats.skipped += 1
      } catch (error) {
        console.error("Archie sync failed", error)
        stats.failed += 1
      }
    }
  }

  return stats
}

export async function ingestArchieWebhookInvoice(
  userId: string,
  payload: ArchieInvoiceRest,
  options?: { entityType?: string; entityId?: string }
): Promise<void> {
  const invoice = payload as ArchieInvoice
  if (invoice.state && invoice.state !== "open") return

  const entityType = options?.entityType?.trim() || "group"
  const entityId = options?.entityId?.trim()
  if (!entityId) {
    console.warn("Archie webhook invoice missing entity ID; skipping.")
    return
  }

  await upsertArchieInvoice(userId, invoice, entityType, entityId)
}
