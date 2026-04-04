import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getCustomerById } from "@/models/customers"
import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

export const metadata: Metadata = { title: "Customer" }

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  const customer = await getCustomerById(id, user.id)
  if (!customer) notFound()

  const invoices = await prisma.invoice.findMany({
    where: { customerId: id, userId: user.id },
    orderBy: { issuedAt: "desc" },
    take: 50,
  })

  return (
    <div className="max-w-4xl">
      <header className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight">{customer.name}</h2>
        {customer.email && <p className="text-muted-foreground">{customer.email}</p>}
      </header>

      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Invoices</h3>
        {invoices.length === 0 ? (
          <p className="text-muted-foreground">No invoices yet.</p>
        ) : (
          <div className="border rounded-lg divide-y">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-4">
                <div>
                  <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                    {inv.invoiceNumber}
                  </Link>
                  {inv.subject && <p className="text-sm text-muted-foreground">{inv.subject}</p>}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm">{inv.currency} {(inv.total / 100).toFixed(2)}</span>
                  <InvoiceStatusBadge status={inv.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
