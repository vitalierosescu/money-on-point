import { InvoiceGenerator } from "@/components/invoices/invoice-generator"
import { InvoiceFormData } from "@/lib/invoice-pdf/types"
import { PageShell } from "@/components/ui/page-shell"
import { getCurrentUser } from "@/lib/auth"
import { getCustomers } from "@/models/customers"
import { getCurrencies } from "@/models/currencies"
import { getInvoiceById } from "@/models/invoices"
import { getSettings } from "@/models/settings"
import { Prisma } from "@/prisma/client"
import { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Edit Invoice",
}

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()

  const [invoice, customers, currencies, settings] = await Promise.all([
    getInvoiceById(id, user.id),
    getCustomers(user.id, undefined, { includeArchived: true }),
    getCurrencies(user.id),
    getSettings(user.id),
  ])

  if (!invoice) notFound()
  if (invoice.status !== "draft") {
    redirect(`/invoices/${id}`)
  }

  const invoiceFull = invoice as Prisma.InvoiceGetPayload<{
    include: { customer: true }
  }>

  const initialFormData = invoice.templateData
    ? (invoice.templateData as unknown as InvoiceFormData)
    : undefined

  return (
    <PageShell>
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold">Edit Invoice</h2>
        <span className="text-muted-foreground">{invoice.invoiceNumber}</span>
      </div>
      <InvoiceGenerator
        customers={customers}
        currencies={currencies}
        settings={settings}
        user={user}
        mode="edit"
        invoiceId={id}
        initialCustomer={invoiceFull.customer}
        initialDeliveryMethod={invoice.deliveryMethod}
        initialFormData={initialFormData}
      />
    </PageShell>
  )
}
