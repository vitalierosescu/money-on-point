import { CustomerEditPanel } from "@/components/customers/customer-edit-panel"
import { CustomerList } from "@/components/customers/customer-list"
import { CustomerSummaryCards } from "@/components/customers/customer-summary-cards"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { PageShell } from "@/components/ui/page-shell"
import { getCurrentUser } from "@/lib/auth"
import { getCustomersWithInvoiceStats, getCustomerStats } from "@/models/customers"
import { Plus } from "lucide-react"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Customers",
  description: "Manage your customers",
}

export default async function CustomersPage() {
  const user = await getCurrentUser()
  const customers = await getCustomersWithInvoiceStats(user.id)
  const stats = await getCustomerStats(user.id)

  return (
    <PageShell>
      <PageHeader
        title="Customers"
        className="mb-space-6"
        actions={<CustomerEditPanel trigger={<Button><Plus /> Add Customer</Button>} />}
      />
      <CustomerSummaryCards stats={stats} />
      <CustomerList customers={customers} />
    </PageShell>
  )
}
