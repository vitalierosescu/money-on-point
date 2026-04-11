import { InvoiceGenerator } from "@/components/invoices/invoice-generator"
import { InvoiceFormData } from "@/lib/invoice-pdf/types"
import { PageHeader } from "@/components/ui/page-header"
import { PageShell } from "@/components/ui/page-shell"
import { getCurrentUser } from "@/lib/auth"
import { getUiLocale } from "@/lib/locale"
import { t } from "@/lib/i18n"
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
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ wasSent?: string }>
}) {
  const [{ id }, { wasSent }] = await Promise.all([params, searchParams])
  const user = await getCurrentUser()

  const [invoice, customers, currencies, settings] = await Promise.all([
    getInvoiceById(id, user.id),
    getCustomers(user.id, undefined, { includeArchived: true }),
    getCurrencies(user.id),
    getSettings(user.id),
  ])
  const locale = getUiLocale(settings)

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
      <PageHeader
        title={t(locale, "invoices.editInvoice")}
        description={t(locale, "invoices.editDescription", { invoiceNumber: invoice.invoiceNumber })}
        className="mb-space-6"
      />
      <InvoiceGenerator
        customers={customers}
        currencies={currencies}
        locale={locale}
        settings={settings}
        user={user}
        mode="edit"
        invoiceId={id}
        initialCustomer={invoiceFull.customer}
        initialDeliveryMethod={invoice.deliveryMethod}
        initialFormData={initialFormData}
        importMode={wasSent === "1"}
        importModeBannerText={t(locale, "invoices.importExistingDescription")}
      />
    </PageShell>
  )
}
