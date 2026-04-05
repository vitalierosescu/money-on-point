import { SettingsMap } from "@/models/settings"
import { User } from "@/prisma/client"
import { addDays, format } from "date-fns"
import { InvoiceFormData } from "./types"

export interface InvoiceTemplate {
  id?: string
  name: string
  formData: InvoiceFormData
}

function nullToEmpty(val: string | null | undefined): string {
  return val == null || val === "null" ? "" : val
}

export default function defaultTemplates(user: User, settings: SettingsMap): InvoiceTemplate[] {
  const beTemplate: InvoiceFormData = {
    invoiceMode: "standard",
    title: "FACTUUR",
    businessLogo: nullToEmpty(user.businessLogo) || null,
    invoiceNumber: "",
    date: format(new Date(), "yyyy-MM-dd"),
    dueDate: format(addDays(new Date(), 30), "yyyy-MM-dd"),
    currency: settings.default_currency || "EUR",
    companyDetails: [nullToEmpty(user.businessName), nullToEmpty(user.businessAddress)].filter(Boolean).join("\n"),
    companyDetailsLabel: "Van",
    billTo: "",
    billToLabel: "Aan",
    items: [{ name: "", subtitle: "", showSubtitle: false, quantity: 1, unitPrice: 0, subtotal: 0 }],
    taxIncluded: false,
    additionalTaxes: [{ name: "BTW", rate: 21, amount: 0 }],
    additionalFees: [],
    notes: "",
    bankDetails: nullToEmpty(user.businessBankDetails),
    authorRightsSplitPreset: "creative_70_30",
    authorRightsRuleYear: new Date().getFullYear(),
    authorRightsContractReference: "",
    authorRightsAgreementDate: format(new Date(), "yyyy-MM-dd"),
    authorRightsSpecialConditions: "",
    authorRightsEligibilityAcknowledged: false,
    authorRightsProfessionalSharePct: 70,
    authorRightsSharePct: 30,
    authorRightsServiceVatRate: 21,
    authorRightsRightsVatRate: 6,
    authorRightsWithholdingRate: 15,
    issueDateLabel: "Factuurdatum",
    dueDateLabel: "Vervaldatum",
    itemLabel: "Omschrijving",
    quantityLabel: "Aantal",
    unitPriceLabel: "Eenheidsprijs",
    subtotalLabel: "Subtotaal",
    summarySubtotalLabel: "Subtotaal:",
    summaryTotalLabel: "Totaal:",
  }

  const enTemplate: InvoiceFormData = {
    invoiceMode: "standard",
    title: "INVOICE",
    businessLogo: nullToEmpty(user.businessLogo) || null,
    invoiceNumber: "",
    date: format(new Date(), "yyyy-MM-dd"),
    dueDate: format(addDays(new Date(), 30), "yyyy-MM-dd"),
    currency: settings.default_currency || "EUR",
    companyDetails: [nullToEmpty(user.businessName), nullToEmpty(user.businessAddress)].filter(Boolean).join("\n"),
    companyDetailsLabel: "Bill From",
    billTo: "",
    billToLabel: "Bill To",
    items: [{ name: "", subtitle: "", showSubtitle: false, quantity: 1, unitPrice: 0, subtotal: 0 }],
    taxIncluded: false,
    additionalTaxes: [{ name: "VAT", rate: 21, amount: 0 }],
    additionalFees: [],
    notes: "",
    bankDetails: nullToEmpty(user.businessBankDetails),
    authorRightsSplitPreset: "creative_70_30",
    authorRightsRuleYear: new Date().getFullYear(),
    authorRightsContractReference: "",
    authorRightsAgreementDate: format(new Date(), "yyyy-MM-dd"),
    authorRightsSpecialConditions: "",
    authorRightsEligibilityAcknowledged: false,
    authorRightsProfessionalSharePct: 70,
    authorRightsSharePct: 30,
    authorRightsServiceVatRate: 21,
    authorRightsRightsVatRate: 6,
    authorRightsWithholdingRate: 15,
    issueDateLabel: "Issue Date",
    dueDateLabel: "Due Date",
    itemLabel: "Item",
    quantityLabel: "Quantity",
    unitPriceLabel: "Unit Price",
    subtotalLabel: "Subtotal",
    summarySubtotalLabel: "Subtotal:",
    summaryTotalLabel: "Total:",
  }

  return [
    { name: "BE", formData: beTemplate },
    { name: "EN", formData: enTemplate },
  ]
}
