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
export const EMAIL_COPY_STATUSES = ["not_sent", "sent", "failed"] as const
export const DELIVERY_EXCEPTION_CODES = ["customer_not_peppol_ready"] as const

export type CustomerInvoiceDeliveryMethod = (typeof CUSTOMER_INVOICE_DELIVERY_METHODS)[number]
export type InvoiceDeliveryMethod = (typeof INVOICE_DELIVERY_METHODS)[number]
export type InvoiceDeliveryStatus = (typeof INVOICE_DELIVERY_STATUSES)[number]
export type EmailCopyStatus = (typeof EMAIL_COPY_STATUSES)[number]
export type DeliveryExceptionCode = (typeof DELIVERY_EXCEPTION_CODES)[number]
export type InvoiceDeliveryComplianceReasonCode =
  | "seller_not_belgian"
  | "foreign_customer"
  | "missing_customer_country"
  | "missing_customer_vat_number"
  | "belgian_domestic_b2b"
  | "customer_not_peppol_ready"
  | "author_rights_peppol_unsupported"

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
  deliveryStatus?: string | null
  deliveryExceptionCode?: string | null
  invoiceMode?: string | null
  customer?: DeliveryCustomerLike | null
}

type DeliveryUserLike = {
  businessName?: string | null
  businessBankDetails?: string | null
}

type DeliveryReadinessContext = {
  hasRecommandCredentials?: boolean
  environmentLabel?: string
  sellerCountryCode?: string | null
}

export type InvoiceDeliveryComplianceResult = {
  sellerCountryCode: string
  customerCountryCode: string | null
  scopeKnown: boolean
  requiresStructuredInvoice: boolean
  defaultMethod: InvoiceDeliveryMethod
  allowEmailFallback: boolean
  reasonCode: InvoiceDeliveryComplianceReasonCode
  message: string | null
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

export function normalizeEmailCopyStatus(value?: string | null): EmailCopyStatus {
  if (value === "sent" || value === "failed" || value === "not_sent") {
    return value
  }
  return "not_sent"
}

export function normalizeDeliveryExceptionCode(value?: string | null): DeliveryExceptionCode | null {
  if (value === "customer_not_peppol_ready") {
    return value
  }
  return null
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

export function parseEmailRecipients(value: string | string[] | null | undefined): string[] {
  const rawValues = Array.isArray(value) ? value : [value ?? ""]

  return Array.from(
    new Set(
      rawValues
        .flatMap((entry) => String(entry).split(/[\n,;]+/))
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  )
}

export function getDefaultInvoiceDeliveryMethod(customer?: DeliveryCustomerLike | null): InvoiceDeliveryMethod {
  const preference = normalizeCustomerInvoiceDeliveryMethod(customer?.invoiceDeliveryMethod)

  if (preference === "peppol" || preference === "email_pdf") {
    return preference
  }

  return isBlank(customer?.peppolId) ? "email_pdf" : "peppol"
}

export function classifyInvoiceDeliveryRequirement(input: {
  sellerCountry?: string | null
  customerCountry?: string | null
  customerVatNumber?: string | null
  customerPeppolId?: string | null
  customerDeliveryPreference?: string | null
  invoiceMode?: string | null
  peppolVerificationPassed?: boolean | null
}): InvoiceDeliveryComplianceResult {
  const sellerCountryCode = normalizeCountryCode(input.sellerCountry)
  const customerCountryCode = input.customerCountry ? normalizeCountryCode(input.customerCountry) : null
  const defaultMethod = getDefaultInvoiceDeliveryMethod({
    peppolId: input.customerPeppolId,
    invoiceDeliveryMethod: input.customerDeliveryPreference,
  })

  if (sellerCountryCode !== "BE") {
    return {
      sellerCountryCode,
      customerCountryCode,
      scopeKnown: true,
      requiresStructuredInvoice: false,
      defaultMethod,
      allowEmailFallback: true,
      reasonCode: "seller_not_belgian",
      message: null,
    }
  }

  if (!customerCountryCode) {
    return {
      sellerCountryCode,
      customerCountryCode,
      scopeKnown: false,
      requiresStructuredInvoice: false,
      defaultMethod: "email_pdf",
      allowEmailFallback: false,
      reasonCode: "missing_customer_country",
      message: "Add the customer's country before sending this invoice.",
    }
  }

  if (customerCountryCode !== "BE") {
    return {
      sellerCountryCode,
      customerCountryCode,
      scopeKnown: true,
      requiresStructuredInvoice: false,
      defaultMethod: "email_pdf",
      allowEmailFallback: true,
      reasonCode: "foreign_customer",
      message: null,
    }
  }

  if (isBlank(input.customerVatNumber)) {
    return {
      sellerCountryCode,
      customerCountryCode,
      scopeKnown: false,
      requiresStructuredInvoice: false,
      defaultMethod: "email_pdf",
      allowEmailFallback: false,
      reasonCode: "missing_customer_vat_number",
      message: "Add the customer's VAT number before sending this Belgian invoice.",
    }
  }

  if (input.peppolVerificationPassed === false) {
    return {
      sellerCountryCode,
      customerCountryCode,
      scopeKnown: true,
      requiresStructuredInvoice: true,
      defaultMethod: "email_pdf",
      allowEmailFallback: true,
      reasonCode: "customer_not_peppol_ready",
      message: "Recipient is not PEPPOL-ready, so email fallback is allowed for this invoice.",
    }
  }

  if (input.invoiceMode === "author_rights") {
    return {
      sellerCountryCode,
      customerCountryCode,
      scopeKnown: true,
      requiresStructuredInvoice: true,
      defaultMethod: "email_pdf",
      allowEmailFallback: false,
      reasonCode: "author_rights_peppol_unsupported",
      message: "Belgian B2B author-rights invoices cannot be sent yet because PEPPOL support for that invoice mode is not implemented.",
    }
  }

  return {
    sellerCountryCode,
    customerCountryCode,
    scopeKnown: true,
    requiresStructuredInvoice: true,
    defaultMethod: "peppol",
    allowEmailFallback: false,
    reasonCode: "belgian_domestic_b2b",
    message: "Belgian domestic B2B invoices must be issued via PEPPOL.",
  }
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

export function getInvoiceDeliveryReadiness(
  invoice?: DeliveryInvoiceLike | null,
  context?: DeliveryReadinessContext
): {
  method: InvoiceDeliveryMethod
  isReady: boolean
  reason: string | null
} {
  const method = getInvoiceDeliveryMethod(invoice)
  const customer = invoice?.customer
  const peppolVerificationPassed =
    normalizeDeliveryExceptionCode(invoice?.deliveryExceptionCode) === "customer_not_peppol_ready"
      ? false
      : normalizeInvoiceDeliveryStatus(invoice?.deliveryStatus) === "verified" ||
          (method === "peppol" && normalizeInvoiceDeliveryStatus(invoice?.deliveryStatus) === "sent")
        ? true
        : null
  const compliance = classifyInvoiceDeliveryRequirement({
    sellerCountry: context?.sellerCountryCode,
    customerCountry: customer?.country,
    customerVatNumber: customer?.vatNumber,
    customerPeppolId: customer?.peppolId,
    customerDeliveryPreference: customer?.invoiceDeliveryMethod,
    invoiceMode: invoice?.invoiceMode,
    peppolVerificationPassed,
  })

  if (!compliance.scopeKnown) {
    return {
      method,
      isReady: false,
      reason: compliance.message,
    }
  }

  if (method === "email_pdf") {
    const emailReady = isEmailDeliveryReady(customer)

    if (!emailReady) {
      return {
        method,
        isReady: false,
        reason: "Add a billing email before sending by email.",
      }
    }

    if (compliance.requiresStructuredInvoice && !compliance.allowEmailFallback) {
      return {
        method,
        isReady: false,
        reason: compliance.message,
      }
    }

    return {
      method,
      isReady: true,
      reason: null,
    }
  }

  if (compliance.allowEmailFallback && compliance.reasonCode === "customer_not_peppol_ready") {
    return {
      method,
      isReady: false,
      reason: compliance.message,
    }
  }

  const hasRecommand = context?.hasRecommandCredentials ?? true
  if (!hasRecommand) {
    const environmentText = context?.environmentLabel ? `${context.environmentLabel} environment` : "environment"
    return {
      method,
      isReady: false,
      reason: `Add Recommand credentials for the active ${environmentText}.`,
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
