import type { AuthorRightsSplitPreset, InvoiceMode } from "@/lib/author-rights"

export interface InvoiceItem {
  name: string
  subtitle: string
  showSubtitle: boolean
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface AdditionalTax {
  name: string
  rate: number
  amount: number
}

export interface AdditionalFee {
  name: string
  amount: number
}

export interface InvoiceFormData {
  invoiceMode: InvoiceMode
  title: string
  businessLogo: string | null
  invoiceNumber: string
  date: string
  dueDate: string
  currency: string
  companyDetails: string
  companyDetailsLabel: string
  billTo: string
  billToLabel: string
  items: InvoiceItem[]
  taxIncluded: boolean
  additionalTaxes: AdditionalTax[]
  additionalFees: AdditionalFee[]
  notes: string
  bankDetails: string
  authorRightsSplitPreset: AuthorRightsSplitPreset
  authorRightsRuleYear: number
  authorRightsContractReference: string
  authorRightsAgreementDate: string
  authorRightsSpecialConditions: string
  authorRightsEligibilityAcknowledged: boolean
  authorRightsProfessionalSharePct: number
  authorRightsSharePct: number
  authorRightsServiceVatRate: number
  authorRightsRightsVatRate: number
  authorRightsWithholdingRate: number
  issueDateLabel: string
  dueDateLabel: string
  itemLabel: string
  quantityLabel: string
  unitPriceLabel: string
  subtotalLabel: string
  summarySubtotalLabel: string
  summaryTotalLabel: string
}
