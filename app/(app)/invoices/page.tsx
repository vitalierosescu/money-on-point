import { InvoiceList } from "@/components/invoices/invoice-list"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"
import { getInvoices, InvoiceFilters } from "@/models/invoices"
import { Plus } from "lucide-react"
import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Invoices",
  description: "Manage your invoices",
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<InvoiceFilters>
}) {
  const filters = await searchParams
  const user = await getCurrentUser()
  const invoices = await getInvoices(user.id, filters)

  return (
    <>
      <header className="flex items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">Invoices</span>
          <span className="text-3xl tracking-tight opacity-20">
            {invoices.length}
          </span>
        </h2>
        <Link href="/invoices/new">
          <Button>
            <Plus /> New Invoice
          </Button>
        </Link>
      </header>

      <InvoiceList invoices={invoices} />
    </>
  )
}
