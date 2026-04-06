import { CustomerDetail } from "@/components/customers/customer-detail"
import { PageShell } from "@/components/ui/page-shell"
import { getCurrentUser } from "@/lib/auth"
import { getCustomerById, getInvoicesByCustomer } from "@/models/customers"
import { Metadata } from "next"
import { notFound } from "next/navigation"

export const metadata: Metadata = { title: "Customer" }
export const dynamic = "force-dynamic"

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  const customer = await getCustomerById(id, user.id)
  if (!customer) notFound()

  const invoices = await getInvoicesByCustomer(id, user.id)

  return (
    <PageShell>
      <CustomerDetail customer={customer} invoices={invoices} />
    </PageShell>
  )
}
