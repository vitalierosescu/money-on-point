import { InvoiceActions } from "@/components/invoices/invoice-actions"
import { InvoiceDocumentsPanel } from "@/components/invoices/invoice-documents-panel"
import { InvoicePreview } from "@/components/invoices/invoice-preview"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import { PageShell } from "@/components/ui/page-shell"
import {
  getInvoiceDeliveryMethod,
  getInvoiceDeliveryMethodLabel,
  normalizeInvoiceDeliveryStatus,
} from "@/lib/invoice-delivery"
import { isAuthorRightsMode, type AuthorRightsData } from "@/lib/author-rights"
import { getInvoiceDeliveryPresentation } from "@/lib/invoice-state-presentation"
import { InvoiceFormData } from "@/lib/invoice-pdf/types"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"
import { getInvoiceById } from "@/models/invoices"
import { getFilesByTransactionId } from "@/models/files"
import { getSettings } from "@/models/settings"
import { formatCurrency } from "@/lib/utils"
import { Pencil } from "lucide-react"
import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Prisma } from "@/prisma/client"

export const metadata: Metadata = {
  title: "Invoice Details",
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  const [invoice, settings] = await Promise.all([getInvoiceById(id, user.id), getSettings(user.id)])

  if (!invoice) notFound()

  const invoiceFull = invoice as Prisma.InvoiceGetPayload<{
    include: { customer: true; payments: true; transaction: true }
  }>

  const payments = invoiceFull.payments || []
  const templateData = invoice.templateData
    ? (invoice.templateData as unknown as InvoiceFormData)
    : null
  const attachedFiles = invoiceFull.transactionId
    ? await getFilesByTransactionId(invoiceFull.transactionId, user.id)
    : []
  const deliveryMethod = getInvoiceDeliveryMethod(invoiceFull)
  const deliveryStatus = normalizeInvoiceDeliveryStatus(invoiceFull.deliveryStatus)
  const deliveryPresentation = getInvoiceDeliveryPresentation(deliveryStatus)
  const authorRightsData = invoice.authorRightsData
    ? (invoice.authorRightsData as AuthorRightsData)
    : null
  const isAuthorRightsInvoice = isAuthorRightsMode(invoice.invoiceMode)

  return (
    <PageShell>
    <div className="flex flex-col lg:flex-row gap-8 max-w-5xl">
      {/* Left: Invoice preview */}
      <div className="flex-1 border rounded-lg overflow-hidden">
        {templateData ? (
          <InvoicePreview templateData={templateData} />
        ) : (
          <div className="min-h-[600px] flex items-center justify-center text-muted-foreground flex-col gap-4">
            <p className="text-lg font-medium">Invoice {invoice.invoiceNumber}</p>
            {invoice.status === "draft" && (
              <Link href={`/invoices/${id}/edit`}>
                <Button variant="outline">
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit &amp; Preview PDF
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Right: Details & Actions */}
      <div className="w-full lg:w-80 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{invoice.invoiceNumber}</h2>
          <div className="flex items-center gap-2">
            <InvoiceStatusBadge status={invoice.status} />
            {invoice.status === "draft" && (
              <Link href={`/invoices/${id}/edit`}>
                <Button variant="ghost" size="icon">
                  <Pencil className="h-4 w-4" />
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Customer */}
        <div className="space-y-1 text-sm">
          <p className="font-medium">{invoiceFull.customer?.name}</p>
          {invoiceFull.customer?.email && (
            <p className="text-muted-foreground">{invoiceFull.customer.email}</p>
          )}
          {invoiceFull.customer?.vatNumber && (
            <p className="text-muted-foreground">VAT: {invoiceFull.customer.vatNumber}</p>
          )}
          {invoiceFull.customer?.peppolId && (
            <p className="text-muted-foreground">PEPPOL: {invoiceFull.customer.peppolId}</p>
          )}
        </div>

        {/* Details */}
        <div className="space-y-2 text-sm border-t pt-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <span>{new Date(invoice.issuedAt).toLocaleDateString("nl-BE")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Due Date</span>
            <span>{new Date(invoice.dueDate).toLocaleDateString("nl-BE")}</span>
          </div>
          <div className="flex justify-between font-medium border-t pt-2">
            <span>Total</span>
            <span>{invoice.currency} {(invoice.total / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{invoice.currency} {(invoice.subtotal / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>VAT</span>
            <span>{invoice.currency} {(invoice.taxTotal / 100).toFixed(2)}</span>
          </div>
          {invoice.isVatReversed && (
            <div className="flex justify-between text-muted-foreground">
              <span>VAT mode</span>
              <span>Reverse charge</span>
            </div>
          )}
          {invoice.paidAmount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Paid</span>
              <span>{invoice.currency} {(invoice.paidAmount / 100).toFixed(2)}</span>
            </div>
          )}
          {invoice.paidAmount > 0 && invoice.paidAmount < invoice.total && (
            <div className="flex justify-between text-muted-foreground">
              <span>Remaining</span>
              <span>{invoice.currency} {((invoice.total - invoice.paidAmount) / 100).toFixed(2)}</span>
            </div>
          )}
          {invoice.paymentReference && (
            <div className="flex justify-between text-muted-foreground">
              <span>Reference</span>
              <span className="max-w-[55%] truncate text-right">{invoice.paymentReference}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>Delivery</span>
            <span>{getInvoiceDeliveryMethodLabel(deliveryMethod)}</span>
          </div>
          {isAuthorRightsInvoice && (
            <div className="flex justify-between text-muted-foreground">
              <span>Invoice mode</span>
              <span>Author rights</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>Delivery status</span>
            <span className={deliveryPresentation.textClassName}>{deliveryPresentation.label}</span>
          </div>
          {invoice.providerReferenceId && (
            <div className="flex justify-between text-muted-foreground">
              <span>Provider ref</span>
              <span className="max-w-[55%] truncate text-right">{invoice.providerReferenceId}</span>
            </div>
          )}
          {invoice.emailCopySentAt && (
            <div className="flex justify-between text-muted-foreground">
              <span>Courtesy copy</span>
              <span>{new Date(invoice.emailCopySentAt).toLocaleDateString("nl-BE")}</span>
            </div>
          )}
          {invoice.deliveryExceptionNote && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {invoice.deliveryExceptionNote}
            </div>
          )}
          {invoice.providerError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {invoice.providerError}
            </div>
          )}
        </div>

        {authorRightsData && (
          <div className="space-y-2 text-sm border-t pt-4">
            <h3 className="font-medium">Author rights</h3>
            <div className="flex justify-between text-muted-foreground">
              <span>Contract ref</span>
              <span className="max-w-[55%] truncate text-right">{authorRightsData.contractReference || "—"}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Agreement date</span>
              <span>{authorRightsData.agreementDate || "—"}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Professional compensation</span>
              <span>{formatCurrency(authorRightsData.professionalGrossCents, invoice.currency)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Author rights compensation</span>
              <span>{formatCurrency(authorRightsData.authorRightsGrossCents, invoice.currency)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Withholding</span>
              <span>{formatCurrency(authorRightsData.withholdingAmountCents, invoice.currency)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Net payable</span>
              <span>{formatCurrency(authorRightsData.netPayableCents, invoice.currency)}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="border-t pt-4">
          <InvoiceActions invoice={invoiceFull} sellerCountryCode={settings.business_country_code} />
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="border-t pt-4">
            <h3 className="font-medium mb-3">Payment History</h3>
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {new Date(p.paidAt).toLocaleDateString("nl-BE")}
                  </span>
                  <span>{invoice.currency} {(p.amount / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <InvoiceDocumentsPanel invoiceId={invoice.id} files={attachedFiles} />
      </div>
    </div>
    </PageShell>
  )
}
