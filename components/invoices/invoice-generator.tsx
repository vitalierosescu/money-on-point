"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CustomerPicker } from "@/components/customers/customer-picker"
import { FormError } from "@/components/forms/error"
import {
  getCustomerBillingEmails,
  getDefaultInvoiceDeliveryMethod,
  getInvoiceDeliveryMethodLabel,
  normalizeInvoiceDeliveryMethod,
} from "@/lib/invoice-delivery"
import { getBelgianAuthorRightsRule, isAuthorRightsMode } from "@/lib/author-rights"
import {
  getActiveRecommandEnvironment,
  getRecommandEnvironmentLabel,
  hasConfiguredRecommandCredentials,
} from "@/lib/recommand-settings"
import { buildAuthorRightsData, getInvoiceTaxAmount, getInvoiceTotalAmount, getPersistedTaxes } from "@/lib/invoice-totals"
import { fetchAsBase64 } from "@/lib/utils"
import { generateInvoicePDF } from "@/lib/invoice-pdf/generate"
import defaultTemplates, { InvoiceTemplate } from "@/lib/invoice-pdf/templates"
import { InvoiceFormData } from "@/lib/invoice-pdf/types"
import { SettingsMap } from "@/models/settings"
import { Currency, Customer, User } from "@/prisma/client"
import {
  addNewTemplateAction,
  createInvoiceAction,
  deleteTemplateAction,
  sendInvoiceEmailAction,
  sendInvoicePeppolAction,
  updateInvoiceAction,
} from "@/app/(app)/invoices/actions"
import { ChevronDown, CircleHelp, FileDown, Loader2, Mail, Save, Send, TextSelect, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import { InvoicePage } from "./invoice-page"
import { InvoicePreview } from "./invoice-preview"

type InvoiceAppData = {
  templates: InvoiceTemplate[]
}

function hydrateFormData(base: InvoiceFormData, candidate?: InvoiceFormData): InvoiceFormData {
  if (!candidate) return base
  return {
    ...base,
    ...candidate,
    items: candidate.items?.length ? candidate.items : base.items,
    additionalTaxes: candidate.additionalTaxes ?? base.additionalTaxes,
    additionalFees: candidate.additionalFees ?? base.additionalFees,
  }
}

function recalculateTaxAmounts(state: InvoiceFormData): InvoiceFormData {
  const subtotal = state.items.reduce((sum, item) => sum + item.subtotal, 0)
  return {
    ...state,
    additionalTaxes: state.additionalTaxes.map((tax) => ({
      ...tax,
      amount: (subtotal * tax.rate) / 100,
    })),
  }
}

type InvoiceFormAction = {
  type: string
  payload?: InvoiceFormData
  field?: string
  value?: string | number | boolean | null
  index?: number
}

function invoiceFormReducer(state: InvoiceFormData, action: InvoiceFormAction): InvoiceFormData {
  switch (action.type) {
    case "SET_FORM":
      return action.payload ?? state
    case "UPDATE_FIELD":
      return action.field ? { ...state, [action.field]: action.value } : state
    case "ADD_ITEM":
      return recalculateTaxAmounts({
        ...state,
        items: [
          ...state.items,
          { name: "", subtitle: "", showSubtitle: false, quantity: 1, unitPrice: 0, subtotal: 0 },
        ],
      })
    case "UPDATE_ITEM": {
      const items = [...state.items]
      if (action.index === undefined || !action.field) return state
      items[action.index] = { ...items[action.index], [action.field]: action.value }
      if (action.field === "quantity" || action.field === "unitPrice") {
        items[action.index].subtotal = Number(items[action.index].quantity) * Number(items[action.index].unitPrice)
      }
      return recalculateTaxAmounts({ ...state, items })
    }
    case "REMOVE_ITEM":
      return recalculateTaxAmounts({ ...state, items: state.items.filter((_, i) => i !== action.index) })
    case "ADD_TAX":
      return { ...state, additionalTaxes: [...state.additionalTaxes, { name: "", rate: 0, amount: 0 }] }
    case "UPDATE_TAX": {
      const taxes = [...state.additionalTaxes]
      if (action.index === undefined || !action.field) return state
      taxes[action.index] = { ...taxes[action.index], [action.field]: action.value }
      if (action.field === "rate") {
        return recalculateTaxAmounts({ ...state, additionalTaxes: taxes })
      }
      return { ...state, additionalTaxes: taxes }
    }
    case "REMOVE_TAX":
      return { ...state, additionalTaxes: state.additionalTaxes.filter((_, i) => i !== action.index) }
    case "ADD_FEE":
      return { ...state, additionalFees: [...state.additionalFees, { name: "", amount: 0 }] }
    case "UPDATE_FEE": {
      const fees = [...state.additionalFees]
      if (action.index === undefined || !action.field) return state
      fees[action.index] = { ...fees[action.index], [action.field]: action.value }
      return { ...state, additionalFees: fees }
    }
    case "REMOVE_FEE":
      return { ...state, additionalFees: state.additionalFees.filter((_, i) => i !== action.index) }
    default:
      return state
  }
}

function isValidDateString(value: string) {
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

function hasCompletePostalAddress(customer: Customer | null) {
  return Boolean(customer?.street && customer?.zipCode && customer?.city && customer?.country)
}

function hasValidInvoiceItem(formData: InvoiceFormData) {
  return formData.items.some((item) => item.name.trim().length > 0 && item.quantity > 0 && item.unitPrice > 0)
}

function sanitizeLine(value: string | null | undefined): string {
  return value?.trim() || ""
}

function buildCustomerDetails(customer: Customer | null): string {
  if (!customer) return ""

  const lines = [
    sanitizeLine(customer.name),
    [sanitizeLine(customer.street), sanitizeLine(customer.houseNumber), sanitizeLine(customer.bus)]
      .filter(Boolean)
      .join(" "),
    [sanitizeLine(customer.zipCode), sanitizeLine(customer.city)].filter(Boolean).join(" "),
    sanitizeLine(customer.country),
    sanitizeLine(customer.vatNumber) ? `VAT: ${sanitizeLine(customer.vatNumber)}` : "",
  ]

  return lines.filter(Boolean).join("\n")
}

function buildCompanyDetails(user: User, settings: SettingsMap): string {
  const structuredAddress = [
    sanitizeLine(settings.business_street_line1),
    sanitizeLine(settings.business_street_line2),
    [sanitizeLine(settings.business_postal_code), sanitizeLine(settings.business_city)].filter(Boolean).join(" "),
    sanitizeLine(settings.business_country_code),
  ].filter(Boolean)
  const fallbackAddress = sanitizeLine(user.businessAddress)
  const taxId = sanitizeLine(settings.business_vat_number) || sanitizeLine(settings.business_enterprise_number)

  return [
    sanitizeLine(user.businessName) || sanitizeLine(user.name),
    ...(structuredAddress.length > 0 ? structuredAddress : fallbackAddress ? [fallbackAddress] : []),
    taxId ? `VAT: ${taxId}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function InlineHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Meer info"
        >
          <CircleHelp className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  )
}

export function InvoiceGenerator({
  user,
  settings,
  currencies,
  appData,
  customers,
  nextInvoiceNumber,
  mode,
  invoiceId,
  initialCustomer,
  initialDeliveryMethod,
  initialFormData: initialFormDataProp,
}: {
  user: User
  settings: SettingsMap
  currencies: Currency[]
  appData?: InvoiceAppData | null
  customers?: Customer[]
  nextInvoiceNumber?: string
  mode?: "create" | "edit"
  invoiceId?: string
  initialCustomer?: Customer | null
  initialDeliveryMethod?: string | null
  initialFormData?: InvoiceFormData
}) {
  const templates: InvoiceTemplate[] = useMemo(
    () => [...defaultTemplates(user, settings), ...(appData?.templates || [])],
    [appData, user, settings]
  )

  const initialFormData = useMemo(() => {
    const base = templates[0].formData
    if (initialFormDataProp) return hydrateFormData(base, initialFormDataProp)
    if (nextInvoiceNumber) {
      return { ...base, invoiceNumber: nextInvoiceNumber }
    }
    return base
  }, [initialFormDataProp, nextInvoiceNumber, templates])

  const [selectedTemplate, setSelectedTemplate] = useState<string>(templates[0].name)
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState("")
  const [templateError, setTemplateError] = useState("")
  const [formData, dispatch] = useReducer(invoiceFormReducer, initialFormData)
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const [isSavingInvoice, setIsSavingInvoice] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(initialCustomer ?? null)
  const [isCompanyDetailsAutofill, setIsCompanyDetailsAutofill] = useState(mode !== "edit")
  const [isBillToAutofill, setIsBillToAutofill] = useState(mode !== "edit")
  const [deliveryMethod, setDeliveryMethod] = useState(
    normalizeInvoiceDeliveryMethod(initialDeliveryMethod) ??
      getDefaultInvoiceDeliveryMethod(initialCustomer ?? undefined)
  )
  const [saveError, setSaveError] = useState("")

  const router = useRouter()
  const billingEmails = useMemo(() => getCustomerBillingEmails(selectedCustomer), [selectedCustomer])
  const subtotal = useMemo(() => formData.items.reduce((sum, item) => sum + item.subtotal, 0), [formData.items])
  const taxTotal = useMemo(() => getInvoiceTaxAmount(formData), [formData])
  const autoCompanyDetails = useMemo(() => buildCompanyDetails(user, settings), [settings, user])
  const autoBillTo = useMemo(() => buildCustomerDetails(selectedCustomer), [selectedCustomer])
  const total = useMemo(() => getInvoiceTotalAmount(formData), [formData])
  const isPeppol = deliveryMethod === "peppol"
  const isAuthorRightsInvoice = isAuthorRightsMode(formData.invoiceMode)
  const authorRightsRule = useMemo(
    () => (isAuthorRightsInvoice ? getBelgianAuthorRightsRule(formData.authorRightsRuleYear) : null),
    [formData.authorRightsRuleYear, isAuthorRightsInvoice]
  )

  useEffect(() => {
    if (!isCompanyDetailsAutofill) return
    if (formData.companyDetails === autoCompanyDetails) return
    dispatch({ type: "UPDATE_FIELD", field: "companyDetails", value: autoCompanyDetails })
  }, [autoCompanyDetails, formData.companyDetails, isCompanyDetailsAutofill])

  useEffect(() => {
    if (!isBillToAutofill) return
    if (formData.billTo === autoBillTo) return
    dispatch({ type: "UPDATE_FIELD", field: "billTo", value: autoBillTo })
  }, [autoBillTo, formData.billTo, isBillToAutofill])

  useEffect(() => {
    if (isAuthorRightsInvoice && deliveryMethod !== "email_pdf") {
      setDeliveryMethod("email_pdf")
    }
  }, [deliveryMethod, isAuthorRightsInvoice])

  const readinessBlockers = useMemo(() => {
    const blockers: string[] = []

    if (!selectedCustomer) {
      blockers.push("Selecteer eerst een klant.")
    }
    if (!formData.invoiceNumber.trim()) {
      blockers.push("Voeg een factuurnummer toe.")
    }
    if (!isValidDateString(formData.date)) {
      blockers.push("Voeg een geldige factuurdatum toe.")
    }
    if (!isValidDateString(formData.dueDate)) {
      blockers.push("Voeg een geldige vervaldatum toe.")
    }
    if (isValidDateString(formData.date) && isValidDateString(formData.dueDate)) {
      if (new Date(formData.dueDate) < new Date(formData.date)) {
        blockers.push("De vervaldatum mag niet voor de factuurdatum liggen.")
      }
    }
    if (!hasValidInvoiceItem(formData)) {
      blockers.push("Voeg minstens een factuurlijn toe met aantal en prijs.")
    }
    if (!formData.companyDetails.trim()) {
      blockers.push("Vul je bedrijfsgegevens aan.")
    }
    if (!formData.bankDetails.trim()) {
      blockers.push("Vul je betaalgegevens aan.")
    }
    if (isAuthorRightsInvoice) {
      if (!formData.authorRightsContractReference.trim()) {
        blockers.push("Voeg een contractreferentie toe voor auteursrechten.")
      }
      if (!isValidDateString(formData.authorRightsAgreementDate)) {
        blockers.push("Voeg een geldige datum van overeenkomst toe.")
      }
      if (!formData.authorRightsEligibilityAcknowledged) {
        blockers.push("Bevestig eerst de auteursrechten-voorwaarden.")
      }
      if (!authorRightsRule) {
        blockers.push(`Belgische auteursrechtenregels voor ${formData.authorRightsRuleYear} ontbreken nog in TaxHacker.`)
      }
    }

    if (isAuthorRightsInvoice && isPeppol) {
      blockers.push("Auteursrechtenfacturen kunnen momenteel enkel via e-mail + PDF verzonden worden.")
    } else if (isPeppol) {
      if (!selectedCustomer?.peppolId?.trim()) {
        blockers.push("Voeg een PEPPOL-ID toe voor deze klant.")
      }
      if (!selectedCustomer?.vatNumber?.trim()) {
        blockers.push("Voeg het btw-nummer van deze klant toe voor PEPPOL.")
      }
      if (!hasCompletePostalAddress(selectedCustomer)) {
        blockers.push("Vul het volledige adres van deze klant in voor PEPPOL.")
      }
      if (!settings.business_iban?.trim()) {
        blockers.push("Voeg eerst je IBAN toe in Instellingen voordat je via PEPPOL verzendt.")
      }
      if (
        !settings.business_street_line1?.trim() ||
        !settings.business_city?.trim() ||
        !settings.business_postal_code?.trim()
      ) {
        blockers.push("Vul eerst je afzendergegevens aan in Instellingen voordat je via PEPPOL verzendt.")
      }
      if (!hasConfiguredRecommandCredentials(settings)) {
        const environment = getRecommandEnvironmentLabel(getActiveRecommandEnvironment(settings))
        blockers.push(`Vul eerst je Recommand-gegevens aan voor de actieve ${environment}-omgeving.`)
      }
    } else if (billingEmails.length === 0) {
      blockers.push("Voeg eerst een facturatie-e-mailadres toe voor deze klant.")
    }

    return blockers
  }, [authorRightsRule, billingEmails.length, formData, isAuthorRightsInvoice, isPeppol, selectedCustomer, settings])
  const primaryActionLabel = isPeppol ? "Factuur verzenden via PEPPOL" : "Factuur verzenden via e-mail"

  const handleTemplateSelect = (templateName: string) => {
    const template = templates.find((t) => t.name === templateName)
    if (template) {
      setSelectedTemplate(templateName)
      dispatch({ type: "SET_FORM", payload: hydrateFormData(templates[0].formData, template.formData) })
    }
  }

  const handleGeneratePDF = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsPdfLoading(true)

    try {
      const data = formData.businessLogo
        ? { ...formData, businessLogo: await fetchAsBase64(formData.businessLogo) }
        : formData

      const pdfBuffer = await generateInvoicePDF(data)

      const blob = new Blob([pdfBuffer], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `invoice-${formData.invoiceNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error generating PDF:", error)
      setSaveError("PDF genereren mislukt. Probeer opnieuw.")
    } finally {
      setIsPdfLoading(false)
    }
  }

  const handleSaveTemplate = async () => {
    setTemplateError("")
    if (!newTemplateName.trim()) {
      setTemplateError("Voer een templatenaam in.")
      return
    }

    if (templates.some((t) => t.name === newTemplateName)) {
      setTemplateError("Er bestaat al een template met deze naam.")
      return
    }

    try {
      const result = await addNewTemplateAction(user, {
        id: `tmpl_${Math.random().toString(36).substring(2, 15)}`,
        name: newTemplateName,
        formData: formData,
      })

      if (result.success) {
        setIsTemplateDialogOpen(false)
        setNewTemplateName("")
        setTemplateError("")
        router.refresh()
      } else {
        setTemplateError("Template opslaan mislukt. Probeer opnieuw.")
      }
    } catch (error) {
      console.error("Error saving template:", error)
      setTemplateError("Template opslaan mislukt. Probeer opnieuw.")
    }
  }

  const handleDeleteTemplate = async (templateId: string | undefined, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!templateId) return

    try {
      const result = await deleteTemplateAction(user, templateId)
      if (result.success) {
        router.refresh()
      }
    } catch (error) {
      console.error("Error deleting template:", error)
      alert("Failed to delete template. Please try again.")
    }
  }

  const handleCustomerSelect = (customer: Customer | null) => {
    setSelectedCustomer(customer)
    setIsBillToAutofill(true)
    setDeliveryMethod(getDefaultInvoiceDeliveryMethod(customer))
  }

  const persistInvoice = async (status: "draft" | "sent") => {
    if (!selectedCustomer) {
      setSaveError("Selecteer eerst een klant voordat je de factuur opslaat.")
      return null
    }

    setSaveError("")
    setIsSavingInvoice(true)
    try {
      const payload = {
        customerId: selectedCustomer.id,
        invoiceNumber: formData.invoiceNumber,
        status,
        issuedAt: new Date(formData.date),
        dueDate: new Date(formData.dueDate),
        currency: formData.currency,
        subtotal: Math.round(subtotal * 100),
        taxTotal: Math.round(taxTotal * 100),
        total: Math.round(total * 100),
        invoiceMode: formData.invoiceMode,
        authorRightsData: buildAuthorRightsData(formData),
        items: formData.items,
        taxes: getPersistedTaxes(formData),
        fees: formData.additionalFees,
        notes: formData.notes || null,
        deliveryMethod,
        templateData: formData,
      }

      const result =
        mode === "edit" && invoiceId
          ? await updateInvoiceAction(invoiceId, payload)
          : await createInvoiceAction(payload)

      if (!result.success) {
        setSaveError(result.error || "Opslaan mislukt. Probeer opnieuw.")
        return null
      }

      const persistedInvoiceId = result.data?.id ?? invoiceId ?? null
      if (!persistedInvoiceId) {
        setSaveError("Opslaan mislukt. Probeer opnieuw.")
        return null
      }

      return persistedInvoiceId
    } catch (error) {
      console.error("Error saving invoice:", error)
      setSaveError("Opslaan mislukt. Probeer opnieuw.")
      return null
    } finally {
      setIsSavingInvoice(false)
    }
  }

  const handleSaveDraft = async () => {
    const persistedInvoiceId = await persistInvoice("draft")
    if (persistedInvoiceId) {
      window.location.href = `/invoices/${persistedInvoiceId}`
    }
  }

  const handleSendInvoice = async () => {
    if (readinessBlockers.length > 0) {
      setSaveError(readinessBlockers[0])
      return
    }

    const persistedInvoiceId = await persistInvoice("sent")
    if (!persistedInvoiceId) return

    const sendResult = isPeppol
      ? await sendInvoicePeppolAction(persistedInvoiceId)
      : await sendInvoiceEmailAction(persistedInvoiceId, billingEmails[0] ?? "")

    if (!sendResult.success) {
      alert(
        `De factuur werd opgeslagen, maar verzenden mislukte: ${sendResult.error || "Onbekende fout"}. Je kunt opnieuw proberen vanaf de factuurpagina.`
      )
      window.location.href = `/invoices/${persistedInvoiceId}`
      return
    }

    window.location.href = `/invoices/${persistedInvoiceId}`
  }

  const saveDraftRef = useRef(handleSaveDraft)
  const sendInvoiceRef = useRef(handleSendInvoice)
  saveDraftRef.current = handleSaveDraft
  sendInvoiceRef.current = handleSendInvoice

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === "s") {
        e.preventDefault()
        saveDraftRef.current()
      } else if (e.key === "Enter") {
        e.preventDefault()
        sendInvoiceRef.current()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_480px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-6 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:pr-2">
            {(mode === "create" || mode === "edit") && customers && (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <section className="rounded-xl border bg-card p-5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">Klant</h2>
                    <InlineHint text="Kies een bestaande klant of maak meteen een nieuwe. De ontvangergegevens worden automatisch ingevuld." />
                  </div>
                  <div className="mt-3">
                    <CustomerPicker
                      customers={customers}
                      selectedCustomer={selectedCustomer}
                      onSelect={handleCustomerSelect}
                    />
                  </div>
                </section>

                <section className="rounded-xl border bg-card p-5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">Verzendmethode</h2>
                    <InlineHint text="Kies de aflevermethode. De hoofdactie gebruikt deze keuze meteen voor verzending." />
                  </div>
                  <select
                    value={deliveryMethod}
                    onChange={(e) => setDeliveryMethod(normalizeInvoiceDeliveryMethod(e.target.value) ?? "email_pdf")}
                    className="mt-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    disabled={isAuthorRightsInvoice}
                  >
                    <option value="email_pdf">{getInvoiceDeliveryMethodLabel("email_pdf")}</option>
                    {!isAuthorRightsInvoice && <option value="peppol">{getInvoiceDeliveryMethodLabel("peppol")}</option>}
                  </select>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {isAuthorRightsInvoice
                      ? "Auteursrechtenmodus gebruikt enkel e-mail met PDF."
                      : isPeppol
                        ? "PEPPOL-validatie actief"
                        : "E-mail met PDF-bijlage"}
                  </div>
                </section>
              </div>
            )}

            <details className="group/details rounded-xl border bg-card">
              <summary className="cursor-pointer list-none px-5 py-3">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-sm font-semibold">Templates en opties</h2>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open/details:rotate-180" />
                </div>
              </summary>
              <div className="border-t px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  {templates.map((template) => (
                    <div key={template.name} className="group relative">
                      <Button
                        variant={selectedTemplate === template.name ? "default" : "outline"}
                        className="whitespace-nowrap"
                        onClick={() => handleTemplateSelect(template.name)}
                      >
                        {template.name}
                      </Button>
                      {template.id && (
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-5 w-5 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={(e) => handleDeleteTemplate(template.id, e)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button variant="outline" onClick={handleGeneratePDF} disabled={isPdfLoading}>
                    {isPdfLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        PDF voorbereiden...
                      </>
                    ) : (
                      <>
                        <FileDown className="mr-2 h-4 w-4" />
                        PDF downloaden
                      </>
                    )}
                  </Button>
                  <Button variant="secondary" onClick={() => setIsTemplateDialogOpen(true)}>
                    <TextSelect className="mr-2 h-4 w-4" />
                    Als template bewaren
                  </Button>
                </div>
              </div>
            </details>

            <InvoicePage
              invoiceData={formData}
              dispatch={dispatch}
              currencies={currencies}
              isCompanyDetailsAutofill={isCompanyDetailsAutofill}
              isBillToAutofill={isBillToAutofill}
              setCompanyDetailsAutofill={setIsCompanyDetailsAutofill}
              setBillToAutofill={setIsBillToAutofill}
            />

            <section className="rounded-xl border bg-card p-5">
              {readinessBlockers.length > 0 ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <ul className="space-y-1 text-sm text-amber-900">
                    {readinessBlockers.map((blocker) => (
                      <li key={blocker}>&bull; {blocker}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  Klaar om te verzenden.
                </div>
              )}

              {saveError && (
                <div className="mb-4">
                  <FormError>{saveError}</FormError>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <Button variant="outline" className="sm:flex-1" onClick={handleSaveDraft} disabled={isSavingInvoice}>
                  {isSavingInvoice ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Opslaan als concept
                </Button>
                <Button
                  className="sm:flex-1"
                  onClick={handleSendInvoice}
                  disabled={isSavingInvoice || readinessBlockers.length > 0}
                >
                  {isSavingInvoice ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : isPeppol ? (
                    <Send className="mr-2 h-4 w-4" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  {primaryActionLabel}
                </Button>
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                &#8984;S concept opslaan &middot; &#8984;&#9166; verzenden
              </p>
            </section>
          </div>

          <aside className="hidden lg:sticky lg:top-5 lg:block">
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">Live preview</h2>
                  <InlineHint text="Voorbeeld van de factuur zoals ze eruitziet bij verzending en PDF-export." />
                </div>
                <span className="text-xs text-muted-foreground">Wordt live bijgewerkt</span>
              </div>
              <InvoicePreview
                templateData={formData}
                className="max-h-[calc(100vh-180px)] overflow-y-auto rounded-xl border shadow-sm"
              />
            </div>
          </aside>
        </div>

        <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Template opslaan</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Naam van template"
              />
              {templateError && <p className="text-sm text-destructive">{templateError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>
                Annuleren
              </Button>
              <Button onClick={handleSaveTemplate}>Opslaan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
