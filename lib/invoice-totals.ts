import type { AuthorRightsData, InvoiceMode } from "@/lib/author-rights"
import { calculateBelgianAuthorRightsAmounts, isAuthorRightsMode } from "@/lib/author-rights"
import type { AdditionalTax, InvoiceFormData } from "@/lib/invoice-pdf/types"

function getSubtotalAmount(formData: InvoiceFormData): number {
  return formData.items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
}

function getFeeAmount(formData: InvoiceFormData): number {
  return formData.additionalFees.reduce((sum, fee) => sum + Number(fee.amount || 0), 0)
}

function getStandardTaxAmount(formData: InvoiceFormData): number {
  return formData.additionalTaxes.reduce((sum, tax) => sum + Number(tax.amount || 0), 0)
}

export function getInvoiceMode(formData: Partial<InvoiceFormData>): InvoiceMode {
  return isAuthorRightsMode(formData.invoiceMode) ? "author_rights" : "standard"
}

export function buildAuthorRightsData(formData: InvoiceFormData): AuthorRightsData | null {
  if (!isAuthorRightsMode(formData.invoiceMode)) {
    return null
  }

  const subtotalCents = Math.round(getSubtotalAmount(formData) * 100)
  const computed = calculateBelgianAuthorRightsAmounts({
    subtotalCents,
    professionalSharePct: Number(formData.authorRightsProfessionalSharePct ?? 70),
    authorRightsSharePct: Number(formData.authorRightsSharePct ?? 30),
    serviceVatRate: Number(formData.authorRightsServiceVatRate ?? 21),
    rightsVatRate: Number(formData.authorRightsRightsVatRate ?? 6),
    withholdingRate: Number(formData.authorRightsWithholdingRate ?? 15),
  })

  return {
    regimeCountry: "BE",
    sourceRuleYear: Number(formData.authorRightsRuleYear || new Date(formData.date || Date.now()).getFullYear()),
    splitMode: formData.authorRightsSplitPreset ?? "manual",
    contractReference: formData.authorRightsContractReference?.trim() ?? "",
    agreementDate: formData.authorRightsAgreementDate?.trim() || null,
    specialConditions: formData.authorRightsSpecialConditions?.trim() ?? "",
    eligibilityAcknowledged: Boolean(formData.authorRightsEligibilityAcknowledged),
    ...computed,
  }
}

export function getInvoiceTaxAmount(formData: InvoiceFormData): number {
  if (!isAuthorRightsMode(formData.invoiceMode)) {
    return getStandardTaxAmount(formData)
  }

  return (buildAuthorRightsData(formData)?.totalVatAmountCents ?? 0) / 100
}

export function getInvoiceTotalAmount(formData: InvoiceFormData): number {
  const subtotal = getSubtotalAmount(formData)
  const fees = getFeeAmount(formData)
  const taxes = getInvoiceTaxAmount(formData)
  return (formData.taxIncluded ? subtotal : subtotal + taxes) + fees
}

export function getPersistedTaxes(formData: InvoiceFormData): AdditionalTax[] {
  if (!isAuthorRightsMode(formData.invoiceMode)) {
    return formData.additionalTaxes
  }

  const authorRightsData = buildAuthorRightsData(formData)
  if (!authorRightsData) {
    return []
  }

  return [
    {
      name: "Beroepsvergoeding btw",
      rate: authorRightsData.serviceVatRate,
      amount: authorRightsData.serviceVatAmountCents / 100,
    },
    {
      name: "Auteursrechten btw",
      rate: authorRightsData.rightsVatRate,
      amount: authorRightsData.rightsVatAmountCents / 100,
    },
  ]
}
