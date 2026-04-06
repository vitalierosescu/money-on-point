import type { SettingsMap } from "@/models/settings"
import {
  getActiveRecommandEnvironment,
  getRecommandEnvironmentLabel,
  hasConfiguredRecommandCredentials,
} from "@/lib/recommand-settings"

export const CUSTOMER_INVOICE_DELIVERY_METHODS = [
  "peppol",
  "email_pdf",
  "manual_choice",
] as const

export const INVOICE_DELIVERY_METHODS = ["peppol", "email_pdf"] as const
export const INVOICE_DELIVERY_STATUSES = ["not_sent", "verified", "sent", "failed"] as const

export type CustomerInvoiceDeliveryMethod = (typeof CUSTOMER_INVOICE_DELIVERY_METHODS)[number]
export type InvoiceDeliveryMethod = (typeof INVOICE_DELIVERY_METHODS)[number]
export type InvoiceDeliveryStatus = (typeof INVOICE_DELIVERY_STATUSES)[number]

type DeliveryCustomerLike = {
  name?: string | null
  peppolId?: string | null
  invoiceDeliveryMethod?: string | null
  email?: string | null
  billingEmails?: unknown
  street?: string | null
  zipCode?: string | null
  city?: string | null
  country?: string | null
  vatNumber?: string | null
}

type DeliveryInvoiceLike = {
  deliveryMethod?: string | null
  customer?: DeliveryCustomerLike | null
}

type DeliveryUserLike = {
  businessName?: string | null
  businessBankDetails?: string | null
}

function isBlank(value: string | null | undefined) {
  return !value || value.trim().length === 0
}

export function normalizeCustomerInvoiceDeliveryMethod(
  value?: string | null
): CustomerInvoiceDeliveryMethod {
  if (value === "peppol" || value === "email_pdf" || value === "manual_choice") {
    return value
  }
  return "manual_choice"
}

export function normalizeInvoiceDeliveryMethod(value?: string | null): InvoiceDeliveryMethod | null {
  if (value === "peppol" || value === "email_pdf") {
    return value
  }
  return null
}

export function normalizeInvoiceDeliveryStatus(value?: string | null): InvoiceDeliveryStatus {
  if (value === "verified" || value === "sent" || value === "failed" || value === "not_sent") {
    return value
  }
  return "not_sent"
}

export function getCustomerBillingEmails(customer?: DeliveryCustomerLike | null): string[] {
  const billingEmails = Array.isArray(customer?.billingEmails)
    ? customer.billingEmails.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : []

  if (customer?.email && customer.email.trim().length > 0) {
    return Array.from(new Set([customer.email.trim(), ...billingEmails]))
  }

  return billingEmails
}

export function getDefaultInvoiceDeliveryMethod(customer?: DeliveryCustomerLike | null): InvoiceDeliveryMethod {
  const preference = normalizeCustomerInvoiceDeliveryMethod(customer?.invoiceDeliveryMethod)

  if (preference === "peppol" || preference === "email_pdf") {
    return preference
  }

  return isBlank(customer?.peppolId) ? "email_pdf" : "peppol"
}

export function getInvoiceDeliveryMethod(invoice?: DeliveryInvoiceLike | null): InvoiceDeliveryMethod {
  return normalizeInvoiceDeliveryMethod(invoice?.deliveryMethod) ?? getDefaultInvoiceDeliveryMethod(invoice?.customer)
}

export function getInvoiceDeliveryMethodLabel(method: InvoiceDeliveryMethod): string {
  return method === "peppol" ? "PEPPOL" : "Email + PDF"
}

export function getCustomerInvoiceDeliveryMethodLabel(method: CustomerInvoiceDeliveryMethod): string {
  if (method === "peppol") return "PEPPOL by default"
  if (method === "email_pdf") return "Email/PDF by default"
  return "Choose automatically"
}

export function getInvoiceDeliveryStatusLabel(status: InvoiceDeliveryStatus): string {
  if (status === "verified") return "Verified"
  if (status === "sent") return "Sent"
  if (status === "failed") return "Failed"
  return "Not sent"
}

export function hasCustomerPostalAddress(customer?: DeliveryCustomerLike | null): boolean {
  return !isBlank(customer?.street) && !isBlank(customer?.zipCode) && !isBlank(customer?.city) && !isBlank(customer?.country)
}

export function isEmailDeliveryReady(customer?: DeliveryCustomerLike | null): boolean {
  return getCustomerBillingEmails(customer).length > 0
}

export function isPeppolDeliveryReadyForCustomer(customer?: DeliveryCustomerLike | null): boolean {
  return !isBlank(customer?.peppolId) && !isBlank(customer?.name as string | null | undefined) && hasCustomerPostalAddress(customer)
}

export function getInvoiceDeliveryReadiness(invoice?: DeliveryInvoiceLike | null): {
  method: InvoiceDeliveryMethod
  isReady: boolean
  reason: string | null
} {
  const method = getInvoiceDeliveryMethod(invoice)
  const customer = invoice?.customer

  if (method === "email_pdf") {
    return {
      method,
      isReady: isEmailDeliveryReady(customer),
      reason: isEmailDeliveryReady(customer) ? null : "Add a billing email before sending by email.",
    }
  }

  return {
    method,
    isReady: isPeppolDeliveryReadyForCustomer(customer),
    reason: isPeppolDeliveryReadyForCustomer(customer)
      ? null
      : "Add a PEPPOL ID and full postal address before sending via PEPPOL.",
  }
}

export function normalizeCountryCode(country?: string | null): string {
  const value = country?.trim()
  if (!value) return "BE"
  if (value.length === 2) return value.toUpperCase()

  const normalized = value.toLowerCase()
  if (normalized === "belgium" || normalized === "belgie" || normalized === "belgique") return "BE"
  if (
    normalized === "united states" ||
    normalized === "united states of america" ||
    normalized === "usa" ||
    normalized === "us"
  ) {
    return "US"
  }

  return value.slice(0, 2).toUpperCase()
}

export function ensurePeppolAddress(peppolId?: string | null, country?: string | null): string | null {
  if (isBlank(peppolId)) return null
  const trimmed = peppolId!.trim()
  if (trimmed.includes(":")) return trimmed

  const digitsOnly = trimmed.replace(/\s+/g, "")
  if (normalizeCountryCode(country) === "BE") {
    return `0208:${digitsOnly.replace(/^BE/i, "")}`
  }

  return digitsOnly
}

export function getPeppolBusinessReadiness(
  user: DeliveryUserLike,
  settings: SettingsMap
): Record<string, string> {
  const errors: Record<string, string> = {}
  const activeEnvironment = getActiveRecommandEnvironment(settings)

  if (isBlank(user.businessName)) {
    errors.businessName = "Add your legal business name."
  }
  if (isBlank(settings.business_country_code)) {
    errors.business_country_code = "Add your business country code."
  }
  if (isBlank(settings.business_postal_code)) {
    errors.business_postal_code = "Add your business postal code."
  }
  if (isBlank(settings.business_city)) {
    errors.business_city = "Add your business city."
  }
  if (isBlank(settings.business_street_line1)) {
    errors.business_street_line1 = "Add your business street address."
  }
  if (isBlank(settings.business_vat_number) && isBlank(settings.business_enterprise_number)) {
    errors.business_vat_number = "Add your VAT or enterprise number."
  }
  if (isBlank(user.businessBankDetails)) {
    errors.businessBankDetails = "Add your bank details."
  }
  if (isBlank(settings.business_iban)) {
    errors.business_iban = "Add your business IBAN."
  }
  if (!hasConfiguredRecommandCredentials(settings, activeEnvironment)) {
    errors.recommand_environment = `Add Recommand credentials for the active ${getRecommandEnvironmentLabel(activeEnvironment)} environment.`
  }

  return errors
}
