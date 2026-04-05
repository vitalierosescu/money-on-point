import { FormSelectCurrency } from "@/components/forms/select-currency"
import { FormAvatar, FormInput, FormTextarea } from "@/components/forms/simple"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getBelgianAuthorRightsRule, isAuthorRightsMode, type AuthorRightsSplitPreset } from "@/lib/author-rights"
import { buildAuthorRightsData, getInvoiceTaxAmount, getInvoiceTotalAmount } from "@/lib/invoice-totals"
import { formatCurrency } from "@/lib/utils"
import { AdditionalFee, AdditionalTax, InvoiceFormData, InvoiceItem } from "@/lib/invoice-pdf/types"
import { Currency } from "@/prisma/client"
import { CircleHelp, PencilLine, RotateCcw, X } from "lucide-react"
import { memo, useCallback, useMemo } from "react"

interface InvoicePageProps {
  invoiceData: InvoiceFormData
  dispatch: React.Dispatch<{
    type: string
    payload?: InvoiceFormData
    field?: string
    value?: string | number | boolean | null
    index?: number
  }>
  currencies: Currency[]
  isCompanyDetailsAutofill: boolean
  isBillToAutofill: boolean
  setCompanyDetailsAutofill: (value: boolean) => void
  setBillToAutofill: (value: boolean) => void
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

const ItemRow = memo(function ItemRow({
  item,
  index,
  onChange,
  onRemove,
  currency,
}: {
  item: InvoiceItem
  index: number
  onChange: (index: number, field: keyof InvoiceItem, value: string | number | boolean) => void
  onRemove: (index: number) => void
  currency: string
}) {
  return (
    <div className="flex flex-col items-start gap-2 bg-white px-3 py-3 sm:grid sm:grid-cols-[1fr_80px_110px_100px_36px] sm:items-center sm:gap-2">
      <div className="w-full">
        <FormInput
          type="text"
          value={item.name}
          onChange={(e) => onChange(index, "name", e.target.value)}
          className="w-full min-w-0"
          placeholder="Itemnaam"
          required
        />
        {!item.showSubtitle ? (
          <button
            type="button"
            className="mt-1 ml-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onChange(index, "showSubtitle", true)}
          >
            + Beschrijving toevoegen
          </button>
        ) : (
          <FormInput
            type="text"
            value={item.subtitle}
            onChange={(e) => onChange(index, "subtitle", e.target.value)}
            className="mt-1 w-full text-xs text-muted-foreground"
            placeholder="Beschrijving (optioneel)"
          />
        )}
      </div>

      <FormInput
        type="number"
        min="1"
        value={item.quantity}
        onChange={(e) => onChange(index, "quantity", Number(e.target.value))}
        className="w-full text-right"
        required
      />
      <FormInput
        type="number"
        step="0.01"
        min="0"
        value={item.unitPrice}
        onChange={(e) => onChange(index, "unitPrice", Number(e.target.value))}
        className="w-full text-right"
        required
      />
      <div className="w-full text-right text-sm font-medium">{formatCurrency(item.subtotal * 100, currency)}</div>
      <div className="w-full sm:w-auto flex justify-end">
        <Button variant="destructive" className="h-7 w-7 rounded-full p-1" onClick={() => onRemove(index)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
})

const TaxRow = memo(function TaxRow({
  tax,
  index,
  onChange,
  onRemove,
  currency,
}: {
  tax: AdditionalTax
  index: number
  onChange: (index: number, field: keyof AdditionalTax, value: string | number) => void
  onRemove: (index: number) => void
  currency: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="destructive" className="h-7 w-7 rounded-full p-1" onClick={() => onRemove(index)}>
        <X className="h-3.5 w-3.5" />
      </Button>
      <FormInput
        type="text"
        value={tax.name}
        onChange={(e) => onChange(index, "name", e.target.value)}
        placeholder="Belastingnaam"
      />
      <FormInput
        type="number"
        max="100"
        value={tax.rate}
        onChange={(e) => onChange(index, "rate", Number(e.target.value))}
        className="w-16 text-right"
      />
      <span className="text-sm text-muted-foreground">%</span>
      <span className="ml-auto text-sm">{formatCurrency(tax.amount * 100, currency)}</span>
    </div>
  )
})

const FeeRow = memo(function FeeRow({
  fee,
  index,
  onChange,
  onRemove,
  currency,
}: {
  fee: AdditionalFee
  index: number
  onChange: (index: number, field: keyof AdditionalFee, value: string | number) => void
  onRemove: (index: number) => void
  currency: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="destructive" className="h-7 w-7 rounded-full p-1" onClick={() => onRemove(index)}>
        <X className="h-3.5 w-3.5" />
      </Button>
      <FormInput
        type="text"
        value={fee.name}
        onChange={(e) => onChange(index, "name", e.target.value)}
        placeholder="Toeslag of korting"
      />
      <FormInput
        type="number"
        step="0.01"
        value={fee.amount}
        onChange={(e) => onChange(index, "amount", Number(e.target.value))}
        className="w-20 text-right"
      />
      <span className="ml-auto text-sm">{formatCurrency(fee.amount * 100, currency)}</span>
    </div>
  )
})

export function InvoicePage({
  invoiceData,
  dispatch,
  currencies,
  isCompanyDetailsAutofill,
  isBillToAutofill,
  setCompanyDetailsAutofill,
  setBillToAutofill,
}: InvoicePageProps) {
  const addItem = useCallback(() => dispatch({ type: "ADD_ITEM" }), [dispatch])
  const removeItem = useCallback((index: number) => dispatch({ type: "REMOVE_ITEM", index }), [dispatch])
  const updateItem = useCallback(
    (index: number, field: keyof InvoiceItem, value: string | number | boolean) =>
      dispatch({ type: "UPDATE_ITEM", index, field, value }),
    [dispatch]
  )

  const addAdditionalTax = useCallback(() => dispatch({ type: "ADD_TAX" }), [dispatch])
  const removeAdditionalTax = useCallback((index: number) => dispatch({ type: "REMOVE_TAX", index }), [dispatch])
  const updateAdditionalTax = useCallback(
    (index: number, field: keyof AdditionalTax, value: string | number) =>
      dispatch({ type: "UPDATE_TAX", index, field, value }),
    [dispatch]
  )

  const addAdditionalFee = useCallback(() => dispatch({ type: "ADD_FEE" }), [dispatch])
  const removeAdditionalFee = useCallback((index: number) => dispatch({ type: "REMOVE_FEE", index }), [dispatch])
  const updateAdditionalFee = useCallback(
    (index: number, field: keyof AdditionalFee, value: string | number) =>
      dispatch({ type: "UPDATE_FEE", index, field, value }),
    [dispatch]
  )

  const subtotal = useMemo(() => invoiceData.items.reduce((sum, item) => sum + item.subtotal, 0), [invoiceData.items])
  const authorRightsData = useMemo(() => buildAuthorRightsData(invoiceData), [invoiceData])
  const isAuthorRightsInvoice = isAuthorRightsMode(invoiceData.invoiceMode)
  const total = useMemo(() => getInvoiceTotalAmount(invoiceData), [invoiceData])
  const calculatedTaxTotal = useMemo(() => getInvoiceTaxAmount(invoiceData), [invoiceData])
  const authorRightsRule = useMemo(
    () => (isAuthorRightsInvoice ? getBelgianAuthorRightsRule(invoiceData.authorRightsRuleYear) : null),
    [invoiceData.authorRightsRuleYear, isAuthorRightsInvoice]
  )

  const setInvoiceMode = useCallback(
    (value: "standard" | "author_rights") => {
      dispatch({ type: "UPDATE_FIELD", field: "invoiceMode", value })
      if (value === "author_rights") {
        dispatch({ type: "UPDATE_FIELD", field: "taxIncluded", value: false })
        dispatch({ type: "UPDATE_FIELD", field: "authorRightsSplitPreset", value: "creative_70_30" })
        dispatch({ type: "UPDATE_FIELD", field: "authorRightsProfessionalSharePct", value: 70 })
        dispatch({ type: "UPDATE_FIELD", field: "authorRightsSharePct", value: 30 })
      }
    },
    [dispatch]
  )

  const applyPreset = useCallback(
    (preset: AuthorRightsSplitPreset) => {
      dispatch({ type: "UPDATE_FIELD", field: "authorRightsSplitPreset", value: preset })
      if (preset === "creative_70_30") {
        dispatch({ type: "UPDATE_FIELD", field: "authorRightsProfessionalSharePct", value: 70 })
        dispatch({ type: "UPDATE_FIELD", field: "authorRightsSharePct", value: 30 })
      }
    },
    [dispatch]
  )

  const updateProfessionalShare = useCallback(
    (value: number) => {
      const next = Math.min(100, Math.max(0, Number(value) || 0))
      dispatch({ type: "UPDATE_FIELD", field: "authorRightsSplitPreset", value: "manual" })
      dispatch({ type: "UPDATE_FIELD", field: "authorRightsProfessionalSharePct", value: next })
      dispatch({ type: "UPDATE_FIELD", field: "authorRightsSharePct", value: 100 - next })
    },
    [dispatch]
  )

  const updateRightsShare = useCallback(
    (value: number) => {
      const next = Math.min(100, Math.max(0, Number(value) || 0))
      dispatch({ type: "UPDATE_FIELD", field: "authorRightsSplitPreset", value: "manual" })
      dispatch({ type: "UPDATE_FIELD", field: "authorRightsSharePct", value: next })
      dispatch({ type: "UPDATE_FIELD", field: "authorRightsProfessionalSharePct", value: 100 - next })
    },
    [dispatch]
  )

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Documentdetails</h3>
          <InlineHint text="Basisgegevens van deze factuur. Deze velden bepalen nummering, data, valuta en koptekst." />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Titel</label>
            <FormInput
              value={invoiceData.title}
              onChange={(e) => dispatch({ type: "UPDATE_FIELD", field: "title", value: e.target.value })}
              placeholder="FACTUUR"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Factuurnummer</label>
            <FormInput
              value={invoiceData.invoiceNumber}
              onChange={(e) => dispatch({ type: "UPDATE_FIELD", field: "invoiceNumber", value: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Factuurdatum</label>
            <FormInput
              type="date"
              value={invoiceData.date}
              onChange={(e) => dispatch({ type: "UPDATE_FIELD", field: "date", value: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Vervaldatum</label>
            <FormInput
              type="date"
              value={invoiceData.dueDate}
              onChange={(e) => dispatch({ type: "UPDATE_FIELD", field: "dueDate", value: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Valuta</label>
            <FormSelectCurrency
              currencies={currencies}
              value={invoiceData.currency}
              onValueChange={(value) => dispatch({ type: "UPDATE_FIELD", field: "currency", value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Logo</label>
            <FormAvatar
              name="businessLogo"
              className="h-[60px] w-[60px]"
              defaultValue={invoiceData.businessLogo || ""}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  const objectUrl = URL.createObjectURL(file)
                  dispatch({ type: "UPDATE_FIELD", field: "businessLogo", value: objectUrl })
                } else {
                  dispatch({ type: "UPDATE_FIELD", field: "businessLogo", value: null })
                }
              }}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Facturatieregime</h3>
          <InlineHint text="Kies standaardfacturatie of de Belgische auteursrechtenflow. Auteursrechten schakelt PEPPOL uit en toont extra compliancevelden." />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Type factuur</label>
            <select
              value={invoiceData.invoiceMode}
              onChange={(e) => setInvoiceMode(e.target.value as "standard" | "author_rights")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="standard">Standaard</option>
              <option value="author_rights">Auteursrechten (België)</option>
            </select>
          </div>
          {isAuthorRightsInvoice && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Inkomstenjaar regels</label>
              <FormInput
                type="number"
                min="2024"
                max="2100"
                value={invoiceData.authorRightsRuleYear}
                onChange={(e) =>
                  dispatch({
                    type: "UPDATE_FIELD",
                    field: "authorRightsRuleYear",
                    value: Number(e.target.value) || new Date().getFullYear(),
                  })
                }
              />
            </div>
          )}
        </div>

        {isAuthorRightsInvoice && (
          <div className="mt-4 space-y-4 rounded-lg border bg-amber-50/50 p-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={invoiceData.authorRightsSplitPreset === "creative_70_30" ? "default" : "outline"}
                onClick={() => applyPreset("creative_70_30")}
              >
                Creatief werk 70 / 30
              </Button>
              <Button
                type="button"
                variant={invoiceData.authorRightsSplitPreset === "manual" ? "default" : "outline"}
                onClick={() => applyPreset("manual")}
              >
                Manuele split
              </Button>
            </div>

            {!authorRightsRule ? (
              <div className="rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-sm text-amber-950">
                Geen Belgische auteursrechtenregels geconfigureerd voor {invoiceData.authorRightsRuleYear}. Opslaan als draft kan,
                maar verzenden hoort pas nadat de regels zijn bijgewerkt.
              </div>
            ) : (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Geconfigureerde drempel {authorRightsRule.incomeYear}:{" "}
                {formatCurrency(authorRightsRule.maxAuthorRightsCompensationCents, invoiceData.currency)} bruto auteursrechten.
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Contractreferentie</label>
                <FormInput
                  value={invoiceData.authorRightsContractReference}
                  onChange={(e) =>
                    dispatch({ type: "UPDATE_FIELD", field: "authorRightsContractReference", value: e.target.value })
                  }
                  placeholder="RAAM-2026-001"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Datum overeenkomst</label>
                <FormInput
                  type="date"
                  value={invoiceData.authorRightsAgreementDate}
                  onChange={(e) =>
                    dispatch({ type: "UPDATE_FIELD", field: "authorRightsAgreementDate", value: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Beroepsvergoeding %</label>
                <FormInput
                  type="number"
                  min="0"
                  max="100"
                  value={invoiceData.authorRightsProfessionalSharePct}
                  onChange={(e) => updateProfessionalShare(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Auteursrechten %</label>
                <FormInput
                  type="number"
                  min="0"
                  max="100"
                  value={invoiceData.authorRightsSharePct}
                  onChange={(e) => updateRightsShare(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Btw beroepsvergoeding %</label>
                <FormInput
                  type="number"
                  min="0"
                  max="100"
                  value={invoiceData.authorRightsServiceVatRate}
                  onChange={(e) =>
                    dispatch({ type: "UPDATE_FIELD", field: "authorRightsServiceVatRate", value: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Btw auteursrechten %</label>
                <FormInput
                  type="number"
                  min="0"
                  max="100"
                  value={invoiceData.authorRightsRightsVatRate}
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_FIELD",
                      field: "authorRightsRightsVatRate",
                      value: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Roerende voorheffing %</label>
                <FormInput
                  type="number"
                  min="0"
                  max="100"
                  value={invoiceData.authorRightsWithholdingRate}
                  onChange={(e) =>
                    dispatch({
                      type: "UPDATE_FIELD",
                      field: "authorRightsWithholdingRate",
                      value: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Bijzondere voorwaarden</label>
              <FormTextarea
                value={invoiceData.authorRightsSpecialConditions}
                onChange={(e) =>
                  dispatch({ type: "UPDATE_FIELD", field: "authorRightsSpecialConditions", value: e.target.value })
                }
                rows={3}
                placeholder="Deze factuur kadert in de raamovereenkomst dd. 05/04/2026."
              />
            </div>

            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={invoiceData.authorRightsEligibilityAcknowledged}
                onChange={(e) =>
                  dispatch({
                    type: "UPDATE_FIELD",
                    field: "authorRightsEligibilityAcknowledged",
                    value: e.target.checked,
                  })
                }
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span>
                Ik bevestig dat deze opdracht in aanmerking komt voor Belgische auteursrechten, dat de toekenning schriftelijk
                is overeengekomen en dat de vergoeding afzonderlijk wordt vermeld.
              </span>
            </label>

            {authorRightsData && (
              <div className="grid gap-2 rounded-md border bg-white p-3 text-sm md:grid-cols-2">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Beroepsvergoeding</span>
                  <span>{formatCurrency(authorRightsData.professionalGrossCents, invoiceData.currency)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Auteursrechten</span>
                  <span>{formatCurrency(authorRightsData.authorRightsGrossCents, invoiceData.currency)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Btw beroepsvergoeding</span>
                  <span>{formatCurrency(authorRightsData.serviceVatAmountCents, invoiceData.currency)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Btw auteursrechten</span>
                  <span>{formatCurrency(authorRightsData.rightsVatAmountCents, invoiceData.currency)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Roerende voorheffing</span>
                  <span>{formatCurrency(authorRightsData.withholdingAmountCents, invoiceData.currency)}</span>
                </div>
                <div className="flex justify-between gap-4 font-medium">
                  <span>Netto te betalen</span>
                  <span>{formatCurrency(authorRightsData.netPayableCents, invoiceData.currency)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Partijen</h3>
          <InlineHint text="Van en Aan worden standaard automatisch ingevuld. Gebruik het potlood voor een eenmalige manuele aanpassing." />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-muted-foreground">{invoiceData.companyDetailsLabel || "Van"}</label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCompanyDetailsAutofill(!isCompanyDetailsAutofill)}
                aria-label={
                  isCompanyDetailsAutofill ? "Bedrijfsgegevens handmatig bewerken" : "Automatisch invullen herstellen"
                }
              >
                {isCompanyDetailsAutofill ? <PencilLine className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              </Button>
            </div>
            <FormTextarea
              value={invoiceData.companyDetails}
              onChange={(e) => dispatch({ type: "UPDATE_FIELD", field: "companyDetails", value: e.target.value })}
              rows={5}
              placeholder="Je bedrijfsgegevens"
              disabled={isCompanyDetailsAutofill}
              className={isCompanyDetailsAutofill ? "bg-muted/20 text-muted-foreground" : ""}
              required
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-muted-foreground">{invoiceData.billToLabel || "Aan"}</label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setBillToAutofill(!isBillToAutofill)}
                aria-label={isBillToAutofill ? "Klantgegevens handmatig bewerken" : "Automatisch invullen herstellen"}
              >
                {isBillToAutofill ? <PencilLine className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              </Button>
            </div>
            <FormTextarea
              value={invoiceData.billTo}
              onChange={(e) => dispatch({ type: "UPDATE_FIELD", field: "billTo", value: e.target.value })}
              rows={5}
              placeholder="Klantgegevens"
              disabled={isBillToAutofill}
              className={isBillToAutofill ? "bg-muted/20 text-muted-foreground" : ""}
              required
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Factuurlijnen</h3>
          <InlineHint text="Voeg hier je artikels of diensten toe. Totaal wordt live herberekend." />
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border">
          <div className="hidden border-b bg-muted/30 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[1fr_80px_110px_100px_36px] sm:px-3 sm:py-2">
            <div>{invoiceData.itemLabel || "Omschrijving"}</div>
            <div className="text-right">{invoiceData.quantityLabel || "Aantal"}</div>
            <div className="text-right">{invoiceData.unitPriceLabel || "Prijs"}</div>
            <div className="text-right">{invoiceData.subtotalLabel || "Subtotaal"}</div>
            <div />
          </div>

          <div className="divide-y divide-border">
            {invoiceData.items.map((item, index) => (
              <ItemRow
                key={index}
                item={item}
                index={index}
                onChange={updateItem}
                onRemove={removeItem}
                currency={invoiceData.currency}
              />
            ))}
          </div>

          <div className="border-t p-3">
            <Button onClick={addItem} className="w-full sm:w-auto">
              + Item toevoegen
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            <div>
              <div className="mb-2 text-xs text-muted-foreground">Btw en toeslagen</div>
              {isAuthorRightsInvoice ? (
                <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                  Btw wordt in auteursrechtenmodus automatisch berekend op basis van de twee vergoedingsdelen hierboven.
                </div>
              ) : (
                <div className="space-y-2">
                  {invoiceData.additionalTaxes.map((tax, index) => (
                    <TaxRow
                      key={index}
                      tax={tax}
                      index={index}
                      onChange={updateAdditionalTax}
                      onRemove={removeAdditionalTax}
                      currency={invoiceData.currency}
                    />
                  ))}
                  <Button onClick={addAdditionalTax} variant="outline" className="w-full sm:w-auto">
                    + Btw toevoegen
                  </Button>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-xs text-muted-foreground">Extra kosten / kortingen</div>
              <div className="space-y-2">
                {invoiceData.additionalFees.map((fee, index) => (
                  <FeeRow
                    key={index}
                    fee={fee}
                    index={index}
                    onChange={updateAdditionalFee}
                    onRemove={removeAdditionalFee}
                    currency={invoiceData.currency}
                  />
                ))}
                <Button onClick={addAdditionalFee} variant="outline" className="w-full sm:w-auto">
                  + Toeslag toevoegen
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{invoiceData.summarySubtotalLabel || "Subtotaal"}</span>
                <span>{formatCurrency(subtotal * 100, invoiceData.currency)}</span>
              </div>
              {isAuthorRightsInvoice && authorRightsData ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Beroepsvergoeding</span>
                    <span>{formatCurrency(authorRightsData.professionalGrossCents, invoiceData.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Auteursrechten</span>
                    <span>{formatCurrency(authorRightsData.authorRightsGrossCents, invoiceData.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Btw totaal</span>
                    <span>{formatCurrency(authorRightsData.totalVatAmountCents, invoiceData.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Roerende voorheffing</span>
                    <span>-{formatCurrency(authorRightsData.withholdingAmountCents, invoiceData.currency)}</span>
                  </div>
                </>
              ) : (
                invoiceData.additionalTaxes.map((tax, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {tax.name} ({tax.rate}%)
                    </span>
                    <span>{formatCurrency(tax.amount * 100, invoiceData.currency)}</span>
                  </div>
                ))
              )}
              {invoiceData.additionalFees.map((fee, index) => (
                <div key={index} className="flex justify-between">
                  <span className="text-muted-foreground">{fee.name}</span>
                  <span>{formatCurrency(fee.amount * 100, invoiceData.currency)}</span>
                </div>
              ))}

              {!isAuthorRightsInvoice && (
                <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={invoiceData.taxIncluded}
                    onChange={(e) => dispatch({ type: "UPDATE_FIELD", field: "taxIncluded", value: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Btw inbegrepen in lijnprijs
                </label>
              )}

              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>{isAuthorRightsInvoice ? "Netto te betalen" : invoiceData.summaryTotalLabel || "Totaal"}</span>
                <span>{formatCurrency(total * 100, invoiceData.currency)}</span>
              </div>
              {isAuthorRightsInvoice && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Bruto btw</span>
                  <span>{formatCurrency(Math.round(calculatedTaxTotal * 100), invoiceData.currency)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Notities / voorwaarden</label>
            <FormTextarea
              value={invoiceData.notes}
              onChange={(e) => dispatch({ type: "UPDATE_FIELD", field: "notes", value: e.target.value })}
              rows={4}
              placeholder="Additional notes or terms"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Betaalgegevens</label>
            <FormTextarea
              value={invoiceData.bankDetails}
              onChange={(e) => dispatch({ type: "UPDATE_FIELD", field: "bankDetails", value: e.target.value })}
              rows={4}
              placeholder="IBAN, BIC, referentie, ..."
              required
            />
          </div>
        </div>
      </section>
    </div>
  )
}
