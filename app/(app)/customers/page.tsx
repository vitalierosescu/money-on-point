import { CustomerEditPanel } from "@/components/customers/customer-edit-panel"
import { CustomerList } from "@/components/customers/customer-list"
import { CustomerSummaryCards } from "@/components/customers/customer-summary-cards"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { PageShell } from "@/components/ui/page-shell"
import { getCurrentUser } from "@/lib/auth"
import { getSettings } from "@/models/settings"
import { getCustomersWithInvoiceStats, getCustomerStats } from "@/models/customers"
import { Plus } from "lucide-react"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Customers",
  description: "Manage your customers",
}

export default async function CustomersPage() {
  const user = await getCurrentUser()
  const [customers, stats, settings] = await Promise.all([
    getCustomersWithInvoiceStats(user.id, { includeArchived: true }),
    getCustomerStats(user.id),
    getSettings(user.id),
  ])

  return (
    <PageShell>
      <PageHeader
        title="Customers"
        className="mb-space-6"
        actions={<CustomerEditPanel trigger={<Button><Plus /> Add Customer</Button>} />}
      />
      <CustomerSummaryCards stats={stats} />
      <CustomerList
        customers={customers}
        initialColumnOrder={settings.customers_list_column_order}
        initialColumnWidths={settings.customers_list_column_widths}
      />
    </PageShell>
  )
}
