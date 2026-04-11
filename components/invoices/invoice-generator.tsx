"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CustomerPicker } from "@/components/customers/customer-picker"
import { FormError } from "@/components/forms/error"
import {
  classifyInvoiceDeliveryRequirement,
  getCustomerBillingEmails,
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
import { t } from "@/lib/i18n"
import { DEFAULT_UI_LOCALE, type UiLocale } from "@/lib/locale"
import { generateInvoicePDF } from "@/lib/invoice-pdf/generate"
import defaultTemplates, { InvoiceTemplate } from "@/lib/invoice-pdf/templates"
import { InvoiceFormData } from "@/lib/invoice-pdf/types"
import { SettingsMap } from "@/models/settings"
import { Currency, Customer, User } from "@/prisma/client"
import {
  addNewTemplateAction,
  createInvoiceAction,
  deleteTemplateAction,
  saveImportedInvoiceAction,
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

function hydrateFormData(base: InvoiceFormData, candidate?: Partial<InvoiceFormData>): InvoiceFormData {
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
          aria-label="More info"
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
  locale = DEFAULT_UI_LOCALE,
  appData,
  customers,
  nextInvoiceNumber,
  mode,
  invoiceId,
  initialCustomer,
  initialNewCustomer,
  initialDeliveryMethod,
  initialFormData: initialFormDataProp,
  importMode = false,
  importModeBannerText,
  uploadedFileId = null,
  uploadedFilePath = null,
  uploadedPreviewImages = [],
}: {
  user: User
  settings: SettingsMap
  currencies: Currency[]
  locale?: UiLocale
  appData?: InvoiceAppData | null
  customers?: Customer[]
  nextInvoiceNumber?: string
  mode?: "create" | "edit"
  invoiceId?: string
  initialCustomer?: Customer | null
  initialNewCustomer?: { name?: string; country?: string; vatNumber?: string; street?: string; zipCode?: string; city?: string; email?: string }
  initialDeliveryMethod?: string | null
  initialFormData?: Partial<InvoiceFormData>
  /** When true, the form is displaying data extracted from an uploaded
   *  PDF. The save UI switches to "Save as draft" / "Save as sent"
   *  (both bypass Peppol readiness validation), the "Ready to send"
   *  banner and Send button are hidden, and the live preview pane shows
   *  the uploaded PDF pages instead of the reconstructed HTML preview. */
  importMode?: boolean
  /** Override the banner text shown when importMode is true. */
  importModeBannerText?: string
  uploadedFileId?: string | null
  uploadedFilePath?: string | null
  uploadedPreviewImages?: string[]
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
      classifyInvoiceDeliveryRequirement({
        sellerCountry: settings.business_country_code,
        customerCountry: initialCustomer?.country,
        customerVatNumber: initialCustomer?.vatNumber,
        customerPeppolId: initialCustomer?.peppolId,
        customerDeliveryPreference: initialCustomer?.invoiceDeliveryMethod,
        invoiceMode: initialFormData.invoiceMode,
      }).defaultMethod
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
  const activePeppolEnvironment = getActiveRecommandEnvironment(settings)
  const activePeppolEnvironmentLabel = getRecommandEnvironmentLabel(activePeppolEnvironment)
  const peppolEnvironmentTone =
    activePeppolEnvironment === "production"
      ? "border-success/30 bg-success/10 text-success"
      : "border-warning/30 bg-warning/10 text-warning"
  const deliveryCompliance = useMemo(
    () =>
      classifyInvoiceDeliveryRequirement({
        sellerCountry: settings.business_country_code,
        customerCountry: selectedCustomer?.country,
        customerVatNumber: selectedCustomer?.vatNumber,
        customerPeppolId: selectedCustomer?.peppolId,
        customerDeliveryPreference: selectedCustomer?.invoiceDeliveryMethod,
        invoiceMode: formData.invoiceMode,
      }),
    [formData.invoiceMode, selectedCustomer, settings.business_country_code]
  )
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
    if (isAuthorRightsInvoice && deliveryMethod !== deliveryCompliance.defaultMethod) {
      setDeliveryMethod(deliveryCompliance.defaultMethod)
    }
  }, [deliveryCompliance.defaultMethod, deliveryMethod, isAuthorRightsInvoice])

  const readinessBlockers = useMemo(() => {
    const blockers: string[] = []

    if (!selectedCustomer) {
      blockers.push(t(locale, "invoices.editor.blockerSelectCustomer"))
    }
    if (selectedCustomer && !deliveryCompliance.scopeKnown) {
      blockers.push(deliveryCompliance.message ?? t(locale, "invoices.editor.blockerCompliance"))
    }
    if (!formData.invoiceNumber.trim()) {
      blockers.push(t(locale, "invoices.editor.blockerInvoiceNumber"))
    }
    if (!isValidDateString(formData.date)) {
      blockers.push(t(locale, "invoices.editor.blockerIssueDate"))
    }
    if (!isValidDateString(formData.dueDate)) {
      blockers.push(t(locale, "invoices.editor.blockerDueDate"))
    }
    if (isValidDateString(formData.date) && isValidDateString(formData.dueDate)) {
      if (new Date(formData.dueDate) < new Date(formData.date)) {
        blockers.push(t(locale, "invoices.editor.blockerDueBeforeIssue"))
      }
    }
    if (!hasValidInvoiceItem(formData)) {
      blockers.push(t(locale, "invoices.editor.blockerItems"))
    }
    if (!formData.companyDetails.trim()) {
      blockers.push(t(locale, "invoices.editor.blockerCompanyDetails"))
    }
    if (!formData.bankDetails.trim()) {
      blockers.push(t(locale, "invoices.editor.blockerBankDetails"))
    }
    if (isAuthorRightsInvoice) {
      if (!formData.authorRightsContractReference.trim()) {
        blockers.push(t(locale, "invoices.editor.blockerAuthorRightsContract"))
      }
      if (!isValidDateString(formData.authorRightsAgreementDate)) {
        blockers.push(t(locale, "invoices.editor.blockerAuthorRightsAgreementDate"))
      }
      if (!formData.authorRightsEligibilityAcknowledged) {
        blockers.push(t(locale, "invoices.editor.blockerAuthorRightsEligibility"))
      }
      if (!authorRightsRule) {
        blockers.push(t(locale, "invoices.editor.blockerAuthorRightsRuleMissing", { year: formData.authorRightsRuleYear }))
      }
    }

    if (isAuthorRightsInvoice && deliveryCompliance.requiresStructuredInvoice && !deliveryCompliance.allowEmailFallback) {
      blockers.push(t(locale, "invoices.editor.blockerAuthorRightsPeppol"))
    } else if (isAuthorRightsInvoice && isPeppol) {
      blockers.push(t(locale, "invoices.editor.blockerAuthorRightsEmailOnly"))
    } else if (isPeppol) {
      if (deliveryCompliance.allowEmailFallback) {
        blockers.push(deliveryCompliance.message ?? t(locale, "invoices.editor.blockerPeppolFallback"))
      }
      if (!selectedCustomer?.peppolId?.trim()) {
        blockers.push(t(locale, "invoices.editor.blockerPeppolId"))
      }
      if (!selectedCustomer?.vatNumber?.trim()) {
        blockers.push(t(locale, "invoices.editor.blockerCustomerVat"))
      }
      if (!hasCompletePostalAddress(selectedCustomer)) {
        blockers.push(t(locale, "invoices.editor.blockerCustomerAddress"))
      }
      if (!settings.business_iban?.trim()) {
        blockers.push(t(locale, "invoices.editor.blockerIban"))
      }
      if (
        !settings.business_street_line1?.trim() ||
        !settings.business_city?.trim() ||
        !settings.business_postal_code?.trim()
      ) {
        blockers.push(t(locale, "invoices.editor.blockerSenderDetails"))
      }
      if (!hasConfiguredRecommandCredentials(settings)) {
        const environment = getRecommandEnvironmentLabel(getActiveRecommandEnvironment(settings))
        blockers.push(t(locale, "invoices.editor.blockerRecommand", { environment }))
      }
    } else {
      if (deliveryCompliance.requiresStructuredInvoice && !deliveryCompliance.allowEmailFallback) {
        blockers.push(deliveryCompliance.message ?? t(locale, "invoices.editor.blockerMustUsePeppol"))
      }
      if (billingEmails.length === 0) {
        blockers.push(t(locale, "invoices.editor.blockerBillingEmail"))
      }
    }

    return blockers
  }, [authorRightsRule, billingEmails.length, deliveryCompliance, formData, isAuthorRightsInvoice, isPeppol, locale, selectedCustomer, settings])
  const primaryActionLabel = isPeppol
    ? t(locale, "invoices.editor.sendPeppol")
    : t(locale, "invoices.editor.sendEmail")

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
      setSaveError(t(locale, "invoices.editor.generatePdfFailed"))
    } finally {
      setIsPdfLoading(false)
    }
  }

  const handleSaveTemplate = async () => {
    setTemplateError("")
    if (!newTemplateName.trim()) {
      setTemplateError(t(locale, "invoices.editor.templateNameRequired"))
      return
    }

    if (templates.some((t) => t.name === newTemplateName)) {
      setTemplateError(t(locale, "invoices.editor.templateNameExists"))
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
        setTemplateError(t(locale, "invoices.editor.templateSaveFailed"))
      }
    } catch (error) {
      console.error("Error saving template:", error)
      setTemplateError(t(locale, "invoices.editor.templateSaveFailed"))
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
      alert(t(locale, "invoices.editor.templateDeleteFailed"))
    }
  }

  const handleCustomerSelect = (customer: Customer | null) => {
    setSelectedCustomer(customer)
    setIsBillToAutofill(true)
    setDeliveryMethod(
      classifyInvoiceDeliveryRequirement({
        sellerCountry: settings.business_country_code,
        customerCountry: customer?.country,
        customerVatNumber: customer?.vatNumber,
        customerPeppolId: customer?.peppolId,
        customerDeliveryPreference: customer?.invoiceDeliveryMethod,
        invoiceMode: formData.invoiceMode,
      }).defaultMethod
    )
  }

  const persistInvoice = async (status: "draft" | "sent") => {
    if (!selectedCustomer) {
      setSaveError(t(locale, "invoices.editor.saveRequiresCustomer"))
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

      // In import mode we route through a dedicated action that bypasses
      // Peppol readiness validation (imported invoices were sent via
      // another system originally) and attaches the uploaded PDF as the
      // invoice's permanent pdfPath. Draft and sent both go through the
      // same action — it branches on status for transaction creation.
      const result = importMode
        ? await saveImportedInvoiceAction(payload, {
            uploadedFileId,
            uploadedFilePath,
          })
        : mode === "edit" && invoiceId
          ? await updateInvoiceAction(invoiceId, payload)
          : await createInvoiceAction(payload)

      if (!result.success) {
        setSaveError(result.error || t(locale, "invoices.editor.saveFailed"))
        return null
      }

      const persistedInvoiceId = result.data?.id ?? invoiceId ?? null
      if (!persistedInvoiceId) {
        setSaveError(t(locale, "invoices.editor.saveFailed"))
        return null
      }

      return persistedInvoiceId
    } catch (error) {
      console.error("Error saving invoice:", error)
      setSaveError(t(locale, "invoices.editor.saveFailed"))
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

  const handleSaveAsSent = async () => {
    const persistedInvoiceId = await persistInvoice("sent")
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
      : await sendInvoiceEmailAction(persistedInvoiceId, billingEmails)

    if (!sendResult.success) {
      alert(
        t(locale, "invoices.editor.sendFailedAfterSave", {
          error: sendResult.error || t(locale, "invoices.editor.unknownError"),
        })
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
      {/* Density scope: the invoice form's default Input primitive is
          h-10 / text-base which reads oversized when you're filling in
          20+ fields at once. Arbitrary child variants shrink every
          descendant text-ish input, textarea, and native select to a
          tighter h-9 / text-sm without touching the rest of the app.
          Checkboxes, radios, and file inputs are excluded so they keep
          their intrinsic sizes. The already-compact item/tax/fee row
          inputs (h-8) harmlessly round up to h-9 here, which is still
          smaller than the old h-10 baseline. */}
      <div className="flex flex-col gap-6 [&_input:not([type=checkbox]):not([type=radio]):not([type=file])]:h-9 [&_input:not([type=checkbox]):not([type=radio]):not([type=file])]:text-sm [&_textarea]:text-sm [&_select]:h-9 [&_select]:text-sm">
        {/* Preview splits off to the side only at xl (1280px+). Below
            that it stacks below the form so the form column gets the
            full content width \u2014 enough for the nested Klant/Verzendmethode,
            Van/Aan, and Btw/summary sub-grids to breathe without
            crashing into each other. */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
          <div className="flex min-w-0 flex-col gap-6 xl:max-h-[calc(100vh-180px)] xl:overflow-y-auto xl:pr-2">
            {(mode === "create" || mode === "edit") && customers && (
              // Klant + Verzendmethode share the row equally. The old
              // layout fixed Verzendmethode at 280px which stole space
              // from the customer picker, truncating tabs ("Existing
              // Custom...") and customer names ("R...", "I...") on
              // typical laptop widths.
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border bg-card p-5 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">Klant</h2>
                    <InlineHint text={t(locale, "invoices.editor.customerHint")} />
                  </div>
                  <div className="mt-3">
                    <CustomerPicker
                      customers={customers}
                      selectedCustomer={selectedCustomer}
                      onSelect={handleCustomerSelect}
                      initialNewCustomer={initialNewCustomer}
                    />
                  </div>
                </section>

                <section className="rounded-xl border bg-card p-5 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">Verzendmethode</h2>
                    <InlineHint text={t(locale, "invoices.editor.deliveryHint")} />
                  </div>
                  {/* Side-by-side selectable options instead of a dropdown.
                      Flex-wrap so they stack on narrow cards. Author-rights
                      mode hides the Peppol option because that flow is
                      email-only. */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!isAuthorRightsInvoice && (
                      <button
                        type="button"
                        onClick={() => setDeliveryMethod("peppol")}
                        className={`flex-1 min-w-[120px] rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                          deliveryMethod === "peppol"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:border-primary hover:bg-secondary/40"
                        }`}
                        aria-pressed={deliveryMethod === "peppol"}
                    >
                      {t(locale, "invoices.editor.deliveryPeppol")}
                    </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod("email_pdf")}
                      disabled={isAuthorRightsInvoice}
                      className={`flex-1 min-w-[120px] rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        deliveryMethod === "email_pdf"
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:border-primary hover:bg-secondary/40"
                      } disabled:pointer-events-none disabled:opacity-50`}
                      aria-pressed={deliveryMethod === "email_pdf"}
                    >
                      {t(locale, "invoices.editor.deliveryEmailPdf")}
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {isAuthorRightsInvoice
                      ? t(locale, "invoices.editor.deliveryAuthorRightsOnly")
                      : isPeppol
                        ? t(locale, "invoices.editor.deliveryPeppolActive")
                        : t(locale, "invoices.editor.deliveryEmailActive")}
                  </div>
                  {isPeppol && (
                    <div className={`mt-3 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${peppolEnvironmentTone}`}>
                      {activePeppolEnvironmentLabel}
                    </div>
                  )}
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
                        {t(locale, "invoices.editor.preparingPdf")}
                      </>
                    ) : (
                      <>
                        <FileDown className="mr-2 h-4 w-4" />
                        {t(locale, "invoices.editor.downloadPdf")}
                      </>
                    )}
                  </Button>
                  <Button variant="secondary" onClick={() => setIsTemplateDialogOpen(true)}>
                    <TextSelect className="mr-2 h-4 w-4" />
                    {t(locale, "invoices.editor.saveAsTemplate")}
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
              locale={locale}
            />

            <section className="rounded-xl border bg-card p-5">
              {/* In import mode we skip the Peppol readiness banner: the
                  invoice has already been sent via another system, so the
                  readiness rules are irrelevant. */}
              {!importMode &&
                (readinessBlockers.length > 0 ? (
                  <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3">
                    <ul className="space-y-1 text-sm text-warning">
                      {readinessBlockers.map((blocker) => (
                        <li key={blocker}>&bull; {blocker}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="mb-4 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
                    {t(locale, "invoices.editor.readyToSend")}
                  </div>
                ))}

              {importMode && (
                <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
                  {importModeBannerText ?? t(locale, "invoices.importBannerDefault")}
                </div>
              )}

              {saveError && (
                <div className="mb-4">
                  <FormError>{saveError}</FormError>
                </div>
              )}

              {importMode ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                  <Button
                    variant="outline"
                    className="sm:flex-1"
                    onClick={handleSaveDraft}
                    disabled={isSavingInvoice}
                  >
                    {isSavingInvoice ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {t(locale, "invoices.editor.saveAsDraft")}
                  </Button>
                  <Button
                    className="sm:flex-1"
                    onClick={handleSaveAsSent}
                    disabled={isSavingInvoice}
                  >
                    {isSavingInvoice ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {t(locale, "invoices.editor.saveAsSent")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                  <Button variant="outline" className="sm:flex-1" onClick={handleSaveDraft} disabled={isSavingInvoice}>
                    {isSavingInvoice ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {t(locale, "invoices.editor.saveAsConcept")}
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
              )}

              {isPeppol && !importMode && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  {t(locale, "invoices.editor.activePeppolEnvironment")}{" "}
                  <span className="font-medium">{activePeppolEnvironmentLabel}</span>
                </p>
              )}
              {!importMode && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  {t(locale, "invoices.editor.shortcuts")}
                </p>
              )}
            </section>
          </div>

          <aside className="hidden xl:sticky xl:top-5 xl:block">
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">
                    {importMode && uploadedPreviewImages.length > 0
                      ? t(locale, "invoices.editor.importedPdf")
                      : t(locale, "invoices.editor.livePreview")}
                  </h2>
                  <InlineHint
                    text={
                      importMode && uploadedPreviewImages.length > 0
                        ? t(locale, "invoices.editor.importedPdfHint")
                        : t(locale, "invoices.editor.livePreviewHint")
                    }
                  />
                </div>
                {!importMode && (
                  <span className="text-xs text-muted-foreground">{t(locale, "invoices.editor.livePreviewUpdates")}</span>
                )}
              </div>
              {importMode && uploadedPreviewImages.length > 0 ? (
                <div className="max-h-[calc(100vh-180px)] space-y-2 overflow-y-auto rounded-xl border bg-card p-2 shadow-sm">
                  {uploadedPreviewImages.map((src, idx) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={idx}
                      src={src}
                      alt={t(locale, "invoices.editor.importedPdfPageAlt", { count: idx + 1 })}
                      className="w-full rounded-md border"
                    />
                  ))}
                </div>
              ) : (
                <InvoicePreview
                  locale={locale}
                  templateData={formData}
                  className="max-h-[calc(100vh-180px)] overflow-y-auto rounded-xl border shadow-sm"
                />
              )}
            </div>
          </aside>
        </div>

        <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t(locale, "invoices.editor.saveTemplateTitle")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 py-4">
                <Input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder={t(locale, "invoices.editor.templateNamePlaceholder")}
                />
                {templateError && <p className="text-sm text-destructive">{templateError}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>
                  {t(locale, "common.cancel")}
                </Button>
                <Button onClick={handleSaveTemplate}>{t(locale, "common.save")}</Button>
              </DialogFooter>
            </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
