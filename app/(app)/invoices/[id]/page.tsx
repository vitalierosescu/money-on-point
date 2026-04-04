import { InvoiceActions } from "@/components/invoices/invoice-actions"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import { getCurrentUser } from "@/lib/auth"
import { getInvoiceById } from "@/models/invoices"
import { Metadata } from "next"
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
  const invoice = await getInvoiceById(id, user.id)

  if (!invoice) notFound()

  const invoiceFull = invoice as Prisma.InvoiceGetPayload<{
    include: { customer: true; payments: true; transaction: true }
  }>

  const payments = invoiceFull.payments || []

  return (
    <div className="flex flex-col lg:flex-row gap-8 max-w-5xl">
      {/* Left: PDF or placeholder */}
      <div className="flex-1">
        <div className="border rounded-lg p-8 text-center text-muted-foreground min-h-[600px] flex items-center justify-center">
          <div>
            <p className="text-lg font-medium">Invoice {invoice.invoiceNumber}</p>
            <p className="text-sm mt-2">PDF preview coming soon</p>
          </div>
        </div>
      </div>

      {/* Right: Details & Actions */}
      <div className="w-full lg:w-80 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">{invoice.invoiceNumber}</h2>
          <InvoiceStatusBadge status={invoice.status} />
        </div>

        {/* Customer */}
        <div className="space-y-1 text-sm">
          <p className="font-medium">{invoiceFull.customer?.name}</p>
          {invoiceFull.customer?.email && (
            <p className="text-muted-foreground">{invoiceFull.customer.email}</p>
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
        </div>

        {/* Actions */}
        <div className="border-t pt-4">
          <InvoiceActions invoice={invoiceFull} />
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
      </div>
    </div>
  )
}
