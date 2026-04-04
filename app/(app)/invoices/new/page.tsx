import { InvoiceForm } from "@/components/invoices/invoice-form"
import { getCurrentUser } from "@/lib/auth"
import { getCustomers } from "@/models/customers"
import { getCurrencies } from "@/models/currencies"
import { getNextInvoiceNumber } from "@/models/invoices"
import { getSettings } from "@/models/settings"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "New Invoice",
  description: "Create a new invoice",
}

export default async function NewInvoicePage() {
  const user = await getCurrentUser()
  const [customers, currencies, nextNumber, settings] = await Promise.all([
    getCustomers(user.id),
    getCurrencies(user.id),
    getNextInvoiceNumber(user.id),
    getSettings(user.id),
  ])

  return (
    <div className="max-w-4xl">
      <header className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight">New Invoice</h2>
      </header>
      <InvoiceForm
        customers={customers}
        currencies={currencies}
        nextInvoiceNumber={nextNumber}
        settings={settings}
        user={user}
      />
    </div>
  )
}
