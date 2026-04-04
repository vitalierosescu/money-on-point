import { CustomerEditPanel } from "@/components/customers/customer-edit-panel"
import { CustomerList } from "@/components/customers/customer-list"
import { CustomerSummaryCards } from "@/components/customers/customer-summary-cards"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"
import { getCustomers, getCustomerStats } from "@/models/customers"
import { Plus } from "lucide-react"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Customers",
  description: "Manage your customers",
}

export default async function CustomersPage() {
  const user = await getCurrentUser()
  const customers = await getCustomers(user.id)
  const stats = await getCustomerStats(user.id)

  return (
    <>
      <header className="flex items-center justify-between gap-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Customers</h2>
        <CustomerEditPanel trigger={<Button><Plus /> Add Customer</Button>} />
      </header>
      <CustomerSummaryCards stats={stats} />
      <CustomerList customers={customers} />
    </>
  )
}
