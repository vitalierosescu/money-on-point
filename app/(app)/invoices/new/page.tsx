import { NewInvoiceClient } from "@/components/invoices/new-invoice-client"
import { PageShell } from "@/components/ui/page-shell"
import { getCurrentUser } from "@/lib/auth"
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

  return (
    <PageShell>
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold">New Invoice</h2>
        <span className="text-muted-foreground">{nextNumber}</span>
      </div>
      <NewInvoiceClient
        appData={appData as InvoiceAppData | null}
        customers={customers}
        currencies={currencies}
        nextInvoiceNumber={nextNumber}
        settings={settings}
        user={user}
      />
    </PageShell>
  )
}
