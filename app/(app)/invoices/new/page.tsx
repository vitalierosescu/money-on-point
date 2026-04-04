import { InvoiceGenerator } from "@/app/(app)/apps/invoices/components/invoice-generator"
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
    <div className="w-full">
      <InvoiceGenerator
        customers={customers}
        currencies={currencies}
        nextInvoiceNumber={nextNumber}
        settings={settings}
        user={user}
        mode="create"
      />
    </div>
  )
}
