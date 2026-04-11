import { NewInvoiceClient } from "@/components/invoices/new-invoice-client"
import { PageHeader } from "@/components/ui/page-header"
import { PageShell } from "@/components/ui/page-shell"
import { getCurrentUser } from "@/lib/auth"
import { getUiLocale } from "@/lib/locale"
import { t } from "@/lib/i18n"
import type { InvoiceTemplate } from "@/lib/invoice-pdf/templates"
import { getCustomers } from "@/models/customers"
import { getCurrencies } from "@/models/currencies"
import { getNextInvoiceNumber } from "@/models/invoices"
import { getAppData } from "@/models/apps"
import { getSettings } from "@/models/settings"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "New Invoice",
  description: "Create a new invoice",
}

type InvoiceAppData = {
  templates: InvoiceTemplate[]
}

export default async function NewInvoicePage() {
  const user = await getCurrentUser()
  const [customers, currencies, nextNumber, settings, appData] = await Promise.all([
    getCustomers(user.id),
    getCurrencies(user.id),
    getNextInvoiceNumber(user.id),
    getSettings(user.id),
    getAppData(user, "invoices"),
  ])
  const locale = getUiLocale(settings)

  return (
    <PageShell>
      <PageHeader
        title={t(locale, "invoices.newInvoice")}
        description={t(locale, "invoices.createDescription", { invoiceNumber: nextNumber })}
        className="mb-space-6"
      />
      <NewInvoiceClient
        appData={appData as InvoiceAppData | null}
        customers={customers}
        currencies={currencies}
        locale={locale}
        nextInvoiceNumber={nextNumber}
        settings={settings}
        user={user}
      />
    </PageShell>
  )
}
