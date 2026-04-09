import { InvoiceImportForm } from "@/components/invoices/invoice-import-form"
import { PageShell } from "@/components/ui/page-shell"
import { ArrowRight, Sparkles } from "lucide-react"
import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Import invoices",
  description: "Bulk import historical sent invoices from a CSV export",
}

export default function InvoiceImportPage() {
  return (
    <PageShell>
      {/* Cross-link to the single-PDF AI flow which lives on /invoices/new.
          CSV import is for bulk historical migration; a single PDF goes
          through the New Invoice form with LLM pre-fill. Keeping the two
          flows on separate pages (by design) but surfacing the PDF path
          here so users who land on "Import" expecting any file type don't
          get stuck looking for it. */}
      <Link
        href="/invoices/new"
        className="group mb-6 flex items-center justify-between gap-4 rounded-lg border border-dashed border-border bg-secondary/20 p-4 transition-colors hover:border-primary hover:bg-secondary/40"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium text-sm">Have a single invoice as a PDF?</p>
            <p className="text-xs text-muted-foreground">
              Drop it on the New Invoice page and AI will pre-fill the form for you.
            </p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </Link>

      <InvoiceImportForm />
    </PageShell>
  )
}
