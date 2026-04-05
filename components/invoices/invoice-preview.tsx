import { isAuthorRightsMode } from "@/lib/author-rights"
import { buildAuthorRightsData, getInvoiceTaxAmount, getInvoiceTotalAmount } from "@/lib/invoice-totals"
import { InvoiceFormData } from "@/lib/invoice-pdf/types"
import { formatCurrency } from "@/lib/utils"

function isPresent(val: string | null | undefined): boolean {
  return !!val && val !== "null" && val !== "undefined"
}

type InvoicePreviewProps = {
  templateData: InvoiceFormData
  className?: string
}

export function InvoicePreview({ templateData: d, className }: InvoicePreviewProps) {
  const subtotal = d.items.reduce((s, i) => s + i.subtotal, 0)
  const taxTotal = getInvoiceTaxAmount(d)
  const total = getInvoiceTotalAmount(d)
  const isAuthorRightsInvoice = isAuthorRightsMode(d.invoiceMode)
  const authorRightsData = buildAuthorRightsData(d)

  return (
    <div className={`bg-white text-sm font-sans p-8 ${className ?? ""}`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          {isPresent(d.businessLogo) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.businessLogo!} alt="Logo" className="h-12 mb-2 object-contain" />
          )}
          {isPresent(d.companyDetails) && (
            <div className="text-xs text-gray-500 whitespace-pre-line">{d.companyDetails}</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-800">{d.title || "Factuur"}</div>
          <div className="text-gray-500 text-xs mt-1">{d.invoiceNumber}</div>
        </div>
      </div>

      {/* Bill to + dates */}
      <div className="flex justify-between mb-8">
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase mb-1">{d.billToLabel || "Aan"}</div>
          <div className="text-xs whitespace-pre-line">{isPresent(d.billTo) ? d.billTo : "\u2014"}</div>
        </div>
        <div className="text-right text-xs space-y-1">
          <div>
            <span className="text-gray-400">{d.issueDateLabel || "Datum"}: </span>
            <span>{d.date}</span>
          </div>
          <div>
            <span className="text-gray-400">{d.dueDateLabel || "Vervaldatum"}: </span>
            <span>{d.dueDate}</span>
          </div>
        </div>
      </div>

      {/* Items table */}
      <table className="w-full text-xs mb-4">
        <thead>
          <tr className="border-b border-gray-200 text-gray-400 uppercase">
            <th className="text-left pb-2">{d.itemLabel || "Omschrijving"}</th>
            <th className="text-right pb-2 w-16">{d.quantityLabel || "Aantal"}</th>
            <th className="text-right pb-2 w-24">{d.unitPriceLabel || "Eenheidsprijs"}</th>
            <th className="text-right pb-2 w-24">{d.subtotalLabel || "Subtotaal"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {d.items.map((item, i) => (
            <tr key={i} className="py-2">
              <td className="py-2">
                <div className="font-medium">{item.name}</div>
                {item.showSubtitle && item.subtitle && (
                  <div className="text-gray-400 text-xs">{item.subtitle}</div>
                )}
              </td>
              <td className="text-right py-2">{item.quantity}</td>
              <td className="text-right py-2">{formatCurrency(item.unitPrice * 100, d.currency)}</td>
              <td className="text-right py-2">{formatCurrency(item.subtotal * 100, d.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-48 space-y-1 text-xs">
          <div className="flex justify-between text-gray-500">
            <span>{d.summarySubtotalLabel || "Subtotaal"}</span>
            <span>{formatCurrency(subtotal * 100, d.currency)}</span>
          </div>
          {isAuthorRightsInvoice && authorRightsData ? (
            <>
              <div className="flex justify-between text-gray-500">
                <span>Beroepsvergoeding</span>
                <span>{formatCurrency(authorRightsData.professionalGrossCents, d.currency)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Auteursrechten</span>
                <span>{formatCurrency(authorRightsData.authorRightsGrossCents, d.currency)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Btw totaal</span>
                <span>{formatCurrency(authorRightsData.totalVatAmountCents, d.currency)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Roerende voorheffing</span>
                <span>-{formatCurrency(authorRightsData.withholdingAmountCents, d.currency)}</span>
              </div>
            </>
          ) : (
            d.additionalTaxes.map((tax, i) => (
              <div key={i} className="flex justify-between text-gray-500">
                <span>{tax.name} ({tax.rate}%)</span>
                <span>{formatCurrency(tax.amount * 100, d.currency)}</span>
              </div>
            ))
          )}
          {d.additionalFees.map((fee, i) => (
            <div key={i} className="flex justify-between text-gray-500">
              <span>{fee.name}</span>
              <span>{formatCurrency(fee.amount * 100, d.currency)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold border-t pt-1">
            <span>{isAuthorRightsInvoice ? "Netto te betalen" : d.summaryTotalLabel || "Totaal"}</span>
            <span>{formatCurrency(total * 100, d.currency)}</span>
          </div>
          {isAuthorRightsInvoice && (
            <div className="flex justify-between text-gray-500">
              <span>Btw bruto</span>
              <span>{formatCurrency(Math.round(taxTotal * 100), d.currency)}</span>
            </div>
          )}
        </div>
      </div>

      {isAuthorRightsInvoice && authorRightsData && (
        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-xs text-gray-600">
          <div className="font-semibold text-gray-800">Auteursrechten</div>
          <div className="mt-2 flex justify-between gap-4">
            <span>Contractreferentie</span>
            <span>{d.authorRightsContractReference || "\u2014"}</span>
          </div>
          <div className="mt-1 flex justify-between gap-4">
            <span>Datum overeenkomst</span>
            <span>{d.authorRightsAgreementDate || "\u2014"}</span>
          </div>
          {isPresent(d.authorRightsSpecialConditions) && (
            <p className="mt-2 whitespace-pre-line">{d.authorRightsSpecialConditions}</p>
          )}
        </div>
      )}

      {/* Notes + bank details */}
      {(isPresent(d.notes) || isPresent(d.bankDetails)) && (
        <div className="mt-8 pt-4 border-t text-xs text-gray-500 space-y-2">
          {isPresent(d.notes) && <p className="whitespace-pre-line">{d.notes}</p>}
          {isPresent(d.bankDetails) && <p className="whitespace-pre-line">{d.bankDetails}</p>}
        </div>
      )}
    </div>
  )
}
