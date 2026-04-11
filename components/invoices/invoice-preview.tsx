import { isAuthorRightsMode } from "@/lib/author-rights"
import { t } from "@/lib/i18n"
import { DEFAULT_UI_LOCALE, type UiLocale } from "@/lib/locale"
import { buildAuthorRightsData, getInvoiceTaxAmount, getInvoiceTotalAmount } from "@/lib/invoice-totals"
import { InvoiceFormData } from "@/lib/invoice-pdf/types"
import { formatCurrency } from "@/lib/utils"

function isPresent(val: string | null | undefined): boolean {
  return !!val && val !== "null" && val !== "undefined"
}

type InvoicePreviewProps = {
  templateData: InvoiceFormData
  className?: string
  locale?: UiLocale
}

export function InvoicePreview({ templateData: d, className, locale = DEFAULT_UI_LOCALE }: InvoicePreviewProps) {
  const subtotal = d.items.reduce((s, i) => s + i.subtotal, 0)
  const taxTotal = getInvoiceTaxAmount(d)
  const total = getInvoiceTotalAmount(d)
  const isAuthorRightsInvoice = isAuthorRightsMode(d.invoiceMode)
  const authorRightsData = buildAuthorRightsData(d)

  return (
    <div className={`bg-card text-body font-sans p-8 [zoom:0.65] ${className ?? ""}`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          {isPresent(d.businessLogo) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.businessLogo!} alt="Logo" className="mb-2 h-8 object-contain" />
          )}
          {isPresent(d.companyDetails) && (
            <div className="text-caption text-muted-foreground whitespace-pre-line">{d.companyDetails}</div>
          )}
        </div>
        <div className="text-right">
          <div className="font-heading text-xl font-semibold tracking-[-0.02em] text-foreground">
            {d.title || t(locale, "invoices.preview.invoiceTitle")}
          </div>
          <div className="mt-1 text-caption text-muted-foreground">
            {t(locale, "invoices.preview.invoiceNumber")}: <span className="font-mono">{d.invoiceNumber || "\u2014"}</span>
          </div>
        </div>
      </div>

      {/* Bill to + dates */}
      <div className="flex justify-between mb-8">
        <div>
          <div className="text-caption font-semibold text-muted-foreground uppercase mb-1">{d.billToLabel || t(locale, "invoices.preview.billTo")}</div>
          <div className="text-caption whitespace-pre-line">{isPresent(d.billTo) ? d.billTo : "\u2014"}</div>
        </div>
        <div className="text-right text-caption space-y-1">
          <div>
            <span className="text-muted-foreground">{d.issueDateLabel || t(locale, "invoices.preview.date")}: </span>
            <span>{d.date}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{d.dueDateLabel || t(locale, "invoices.preview.dueDate")}: </span>
            <span>{d.dueDate}</span>
          </div>
        </div>
      </div>

      {/* Items table */}
      <table className="w-full text-caption mb-4">
        <thead>
          <tr className="border-b border-border text-muted-foreground uppercase">
            <th className="text-left pb-2">{d.itemLabel || t(locale, "invoices.preview.description")}</th>
            <th className="text-right pb-2 w-16">{d.quantityLabel || t(locale, "invoices.preview.quantity")}</th>
            <th className="text-right pb-2 w-24">{d.unitPriceLabel || t(locale, "invoices.preview.unitPrice")}</th>
            <th className="text-right pb-2 w-24">{d.subtotalLabel || t(locale, "invoices.preview.subtotal")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {d.items.map((item, i) => (
            <tr key={i} className="py-2">
              <td className="py-2">
                <div className="font-medium">{item.name}</div>
                {item.showSubtitle && item.subtitle && (
                  <div className="text-muted-foreground text-caption">{item.subtitle}</div>
                )}
              </td>
              <td className="text-right py-2">{item.quantity}</td>
              <td className="text-right py-2">{formatCurrency(item.unitPrice * 100, d.currency, locale)}</td>
              <td className="text-right py-2">{formatCurrency(item.subtotal * 100, d.currency, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-48 space-y-1 text-caption">
          <div className="flex justify-between text-muted-foreground">
            <span>{d.summarySubtotalLabel || t(locale, "invoices.preview.subtotal")}</span>
            <span>{formatCurrency(subtotal * 100, d.currency, locale)}</span>
          </div>
          {isAuthorRightsInvoice && authorRightsData ? (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>{t(locale, "invoices.preview.professionalCompensation")}</span>
                <span>{formatCurrency(authorRightsData.professionalGrossCents, d.currency, locale)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t(locale, "invoices.preview.authorRights")}</span>
                <span>{formatCurrency(authorRightsData.authorRightsGrossCents, d.currency, locale)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t(locale, "invoices.preview.totalVat")}</span>
                <span>{formatCurrency(authorRightsData.totalVatAmountCents, d.currency, locale)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t(locale, "invoices.preview.withholdingTax")}</span>
                <span>-{formatCurrency(authorRightsData.withholdingAmountCents, d.currency, locale)}</span>
              </div>
            </>
          ) : (
            d.additionalTaxes.map((tax, i) => (
              <div key={i} className="flex justify-between text-muted-foreground">
                <span>{tax.name} ({tax.rate}%)</span>
                <span>{formatCurrency(tax.amount * 100, d.currency, locale)}</span>
              </div>
            ))
          )}
          {d.additionalFees.map((fee, i) => (
            <div key={i} className="flex justify-between text-muted-foreground">
              <span>{fee.name}</span>
              <span>{formatCurrency(fee.amount * 100, d.currency, locale)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold border-t pt-1">
            <span>{isAuthorRightsInvoice ? t(locale, "invoices.preview.netPayable") : d.summaryTotalLabel || t(locale, "invoices.preview.total")}</span>
            <span>{formatCurrency(total * 100, d.currency, locale)}</span>
          </div>
          {isAuthorRightsInvoice && (
            <div className="flex justify-between text-muted-foreground">
              <span>{t(locale, "invoices.preview.grossVat")}</span>
              <span>{formatCurrency(Math.round(taxTotal * 100), d.currency, locale)}</span>
            </div>
          )}
        </div>
      </div>

      {isAuthorRightsInvoice && authorRightsData && (
        <div className="mt-6 rounded-md border border-warning/30 bg-warning/10 p-4 text-caption text-muted-foreground">
          <div className="font-semibold text-foreground">{t(locale, "invoices.preview.authorRightsSection")}</div>
          <div className="mt-2 flex justify-between gap-4">
            <span>{t(locale, "invoices.preview.contractReference")}</span>
            <span>{d.authorRightsContractReference || "\u2014"}</span>
          </div>
          <div className="mt-1 flex justify-between gap-4">
            <span>{t(locale, "invoices.preview.agreementDate")}</span>
            <span>{d.authorRightsAgreementDate || "\u2014"}</span>
          </div>
          {isPresent(d.authorRightsSpecialConditions) && (
            <p className="mt-2 whitespace-pre-line">{d.authorRightsSpecialConditions}</p>
          )}
        </div>
      )}

      {/* Notes + bank details */}
      {(isPresent(d.notes) || isPresent(d.bankDetails)) && (
        <div className="mt-8 pt-4 border-t text-caption text-muted-foreground space-y-2">
          {isPresent(d.notes) && <p className="whitespace-pre-line">{d.notes}</p>}
          {isPresent(d.bankDetails) && <p className="whitespace-pre-line">{d.bankDetails}</p>}
        </div>
      )}
    </div>
  )
}
