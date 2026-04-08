import { UploadButton } from "@/components/files/upload-button"
import { Button } from "@/components/ui/button"
import { SectionLabel } from "@/components/ui/section-label"
import { getRecommandEnvironmentLabel, type RecommandEnvironment } from "@/lib/recommand-settings"
import { ArrowRight, Receipt, Upload } from "lucide-react"
import Link from "next/link"

type HomeHeroWidgetProps = {
  userName: string
  unsortedCount: number
  blockedInvoices: number
  overdueInvoices: number
  expensesToPay: number
  activePeppolEnvironment: RecommandEnvironment
  activePeppolReady: boolean
  productionPeppolReady: boolean
}

export function HomeHeroWidget({
  userName,
  unsortedCount,
  blockedInvoices,
  overdueInvoices,
  expensesToPay,
  activePeppolEnvironment,
  activePeppolReady,
  productionPeppolReady,
}: HomeHeroWidgetProps) {
  const firstName = userName.trim().split(/\s+/)[0] || "there"
  const environmentLabel = getRecommandEnvironmentLabel(activePeppolEnvironment)

  const peppolMessage = !activePeppolReady
    ? `PEPPOL · ${environmentLabel} profile incomplete`
    : activePeppolEnvironment === "playground"
      ? productionPeppolReady
        ? "PEPPOL · Playground active, switch to Production before live sends"
        : "PEPPOL · Playground active, add Production credentials to go live"
      : "PEPPOL · Production ready for live sending"

  const peppolTone =
    !activePeppolReady || activePeppolEnvironment === "playground"
      ? "border-warning/40 text-warning"
      : "border-success/40 text-success"

  const deskStats = [
    { label: "Unsorted", value: unsortedCount, href: "/unsorted" },
    { label: "Blocked invoices", value: blockedInvoices, href: "/invoices" },
    { label: "Overdue", value: overdueInvoices, href: "/invoices" },
    { label: "To pay", value: expensesToPay, href: "/expenses" },
  ]

  const nextMove =
    unsortedCount > 0
      ? { copy: "Review new uploads first.", href: "/unsorted" }
      : blockedInvoices > 0
        ? { copy: "Fix blocked invoices so they can go out.", href: "/invoices" }
        : overdueInvoices > 0
          ? { copy: "Follow up on overdue invoices.", href: "/invoices" }
          : expensesToPay > 0
            ? { copy: "Record or pay outstanding expenses.", href: "/expenses" }
            : { copy: "Desk is clear — a good moment for reports.", href: "/reports" }

  return (
    <section className="rounded-card border border-border bg-background bg-recommand-texture p-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px] xl:items-start">
        <div>
          <SectionLabel>Today&apos;s desk</SectionLabel>
          <h1 className="mt-2 text-3xl font-semibold font-heading tracking-[-0.02em] text-balance">
            Keep bookkeeping moving, {firstName}.
          </h1>

          <div className="mt-4 flex flex-wrap gap-2">
            <UploadButton className="h-10 px-4">
              <Upload className="mr-2 h-4 w-4" />
              Upload documents
            </UploadButton>
            <Link href="/invoices/new">
              <Button variant="secondary" className="h-10 px-4">
                <Receipt className="mr-2 h-4 w-4" />
                New invoice
              </Button>
            </Link>
          </div>

          <div className={`mt-4 inline-flex items-center rounded-card border px-3 py-1.5 text-caption font-medium ${peppolTone}`}>
            {peppolMessage}
          </div>
        </div>

        <div className="rounded-card border border-border bg-background p-4">
          <SectionLabel>What needs attention</SectionLabel>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {deskStats.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-card border border-border px-3 py-2 transition-colors hover:border-primary"
              >
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</div>
                <div className="mt-1 text-2xl font-semibold font-heading tabular-nums">{item.value}</div>
              </Link>
            ))}
          </div>

          <Link
            href={nextMove.href}
            className="group mt-3 flex items-center justify-between gap-2 rounded-card border border-border px-3 py-2 text-body transition-colors hover:border-primary"
          >
            <span className="text-foreground">{nextMove.copy}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  )
}
