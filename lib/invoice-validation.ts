import type { InvoiceFormData } from "@/lib/invoice-pdf/types"
import {
  ensurePeppolAddress,
  getPeppolBusinessReadiness,
  hasCustomerPostalAddress,
  normalizeCountryCode,
} from "@/lib/invoice-delivery"
import { isAuthorRightsMode } from "@/lib/author-rights"
import type { SettingsMap } from "@/models/settings"

export type InvoiceFieldErrors = Record<string, string>

type InvoiceValidationInput = {
  businessName?: string | null
  businessAddress?: string | null
  businessBankDetails?: string | null
  customer?: {
    id?: string | null
    name?: string | null
    email?: string | null
    peppolId?: string | null
    street?: string | null
    zipCode?: string | null
    city?: string | null
    country?: string | null
    vatNumber?: string | null
  } | null
  invoiceNumber?: string | null
  issuedAt?: Date | string | null
  dueDate?: Date | string | null
  currency?: string | null
  items?: unknown
  templateData?: InvoiceFormData | null
  recipientEmail?: string | null
}

type PeppolValidationInput = InvoiceValidationInput & {
  settings: SettingsMap
}

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0
}

function isValidDate(value: Date | string | null | undefined): boolean {
  if (!value) return false
  const date = value instanceof Date ? value : new Date(value)
  return !Number.isNaN(date.getTime())
}

function getNormalizedItems(items: unknown, templateData?: InvoiceFormData | null) {
  const rawItems = Array.isArray(items)
    ? items
    : Array.isArray(templateData?.items)
      ? templateData.items
      : []

  return rawItems.filter((item): item is { name?: string; quantity?: number; unitPrice?: number; subtotal?: number } => {
    return typeof item === "object" && item !== null
  })
}

export function validateInvoiceForSending(input: InvoiceValidationInput): {
  fieldErrors: InvoiceFieldErrors
  message: string | null
} {
  const fieldErrors: InvoiceFieldErrors = {}

  if (isBlank(input.businessName)) {
    fieldErrors.businessName = "Add your business name before sending invoices."
  }
  if (isBlank(input.businessAddress)) {
    fieldErrors.businessAddress = "Add your business address before sending invoices."
  }
  if (isBlank(input.businessBankDetails)) {
    fieldErrors.businessBankDetails = "Add your bank details before sending invoices."
  }

  if (!input.customer?.id || isBlank(input.customer.name)) {
    fieldErrors.customer = "Select a customer before sending."
  }

  if (isBlank(input.invoiceNumber)) {
    fieldErrors.invoiceNumber = "Invoice number is required."
  }

  if (!isValidDate(input.issuedAt)) {
    fieldErrors.issuedAt = "Invoice date is required."
  }

  if (!isValidDate(input.dueDate)) {
    fieldErrors.dueDate = "Due date is required."
  }

  if (isValidDate(input.issuedAt) && isValidDate(input.dueDate)) {
    const issuedAt = new Date(input.issuedAt as Date | string)
    const dueDate = new Date(input.dueDate as Date | string)
    if (dueDate < issuedAt) {
      fieldErrors.dueDate = "Due date cannot be earlier than the invoice date."
    }
  }

  if (isBlank(input.currency)) {
    fieldErrors.currency = "Currency is required."
  }

  const items = getNormalizedItems(input.items, input.templateData)
  const hasValidItem = items.some((item) => {
    const name = typeof item.name === "string" ? item.name.trim() : ""
    const quantity = Number(item.quantity ?? 0)
    const subtotal = Number(item.subtotal ?? 0)
    const unitPrice = Number(item.unitPrice ?? 0)
    return name.length > 0 && quantity > 0 && (subtotal > 0 || unitPrice > 0)
  })

  if (!hasValidItem) {
    fieldErrors.items = "Add at least one valid invoice line item."
  }

  if (input.recipientEmail !== undefined) {
    if (isBlank(input.recipientEmail)) {
      fieldErrors.recipientEmail = "Recipient email is required."
    } else if (!String(input.recipientEmail).includes("@")) {
      fieldErrors.recipientEmail = "Recipient email looks invalid."
    }
  }

  if (isAuthorRightsMode(input.templateData?.invoiceMode)) {
    if (!input.templateData?.authorRightsContractReference?.trim()) {
      fieldErrors.authorRightsContractReference = "Author-rights invoices require a contract reference."
    }

    if (!isValidDate(input.templateData?.authorRightsAgreementDate)) {
      fieldErrors.authorRightsAgreementDate = "Add the agreement date for this author-rights invoice."
    }

    if (!input.templateData?.authorRightsEligibilityAcknowledged) {
      fieldErrors.authorRightsEligibilityAcknowledged =
        "Confirm the author-rights eligibility acknowledgement before sending."
    }

    const rightsShare = Number(input.templateData?.authorRightsSharePct ?? 0)
    const professionalShare = Number(input.templateData?.authorRightsProfessionalSharePct ?? 0)

    if (rightsShare <= 0 || professionalShare <= 0 || Math.round((rightsShare + professionalShare) * 100) !== 10000) {
      fieldErrors.authorRightsSplit = "Professional and author-rights shares must both be positive and add up to 100%."
    }
  }

  return {
    fieldErrors,
    message: Object.values(fieldErrors).length > 0 ? Object.values(fieldErrors).join(" ") : null,
  }
}

export function validateInvoiceForPeppolDelivery(input: PeppolValidationInput): {
  fieldErrors: InvoiceFieldErrors
  message: string | null
  normalizedPeppolAddress: string | null
} {
  const baseValidation = validateInvoiceForSending(input)
  const fieldErrors: InvoiceFieldErrors = { ...baseValidation.fieldErrors }

  if (isAuthorRightsMode(input.templateData?.invoiceMode)) {
    fieldErrors.deliveryMethod = "Author-rights invoices are currently supported with Email + PDF only."
  }

  for (const [field, message] of Object.entries(
    getPeppolBusinessReadiness(
      {
        businessName: input.businessName,
        businessBankDetails: input.businessBankDetails,
      },
      input.settings
    )
  )) {
    fieldErrors[field] = message
  }

  if (!input.customer?.id || !input.customer.name?.trim()) {
    fieldErrors.customer = "Select a customer before sending via PEPPOL."
  }

  if (!input.customer?.peppolId?.trim()) {
    fieldErrors.peppolId = "Add the customer's PEPPOL ID before sending."
  }

  if (!input.customer?.vatNumber?.trim()) {
    fieldErrors.customerVatNumber = "Add the customer's VAT number before sending via PEPPOL."
  }

  if (!hasCustomerPostalAddress(input.customer)) {
    fieldErrors.customerAddress = "Add the customer's full postal address before sending via PEPPOL."
  }

  const countryCode = normalizeCountryCode(input.customer?.country)
  const normalizedPeppolAddress = ensurePeppolAddress(input.customer?.peppolId, countryCode)

  if (!normalizedPeppolAddress) {
    fieldErrors.peppolId = "Customer PEPPOL ID is invalid."
  }

  return {
    fieldErrors,
    normalizedPeppolAddress,
    message: Object.values(fieldErrors).length > 0 ? Object.values(fieldErrors).join(" ") : null,
  }
}
