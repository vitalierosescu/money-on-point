import { InvoiceImportForm } from "@/components/invoices/invoice-import-form"
import { PageShell } from "@/components/ui/page-shell"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Import invoices",
  description: "Bulk import historical sent invoices from a CSV export",
}

export default function InvoiceImportPage() {
  return (
    <PageShell>
      <InvoiceImportForm />
    </PageShell>
  )
}
