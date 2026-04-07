import { UploadButton } from "@/components/files/upload-button"
import { Button } from "@/components/ui/button"
import { SectionLabel } from "@/components/ui/section-label"
import { getRecommandEnvironmentLabel, type RecommandEnvironment } from "@/lib/recommand-settings"
import { ArrowRight, FileStack, Receipt, Rocket, Settings2, Upload } from "lucide-react"
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
    ? `PEPPOL is currently pointed at ${environmentLabel}, but that profile is still incomplete.`
    : activePeppolEnvironment === "playground"
      ? productionPeppolReady
        ? "PEPPOL is active in Playground. Switch to Production before your first real live send."
        : "PEPPOL is active in Playground. Add Production credentials before you go live."
      : "PEPPOL is active in Production and ready for real live sending."

  const peppolTone = !activePeppolReady || activePeppolEnvironment === "playground"
    ? "border-warning/40"
    : "border-success/40"

  const peppolAccent = !activePeppolReady || activePeppolEnvironment === "playground"
    ? "text-warning"
    : "text-success"

  const deskStats = [
    { label: "Unsorted", value: unsortedCount, href: "/unsorted" },
    { label: "Blocked invoices", value: blockedInvoices, href: "/invoices" },
    { label: "Overdue", value: overdueInvoices, href: "/invoices" },
    { label: "To pay", value: expensesToPay, href: "/expenses" },
  ]

  return (
    <section className="rounded-card border border-border bg-background bg-recommand-texture p-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px] xl:items-start">
        <div>
          <SectionLabel>Today&apos;s desk</SectionLabel>
          <h1 className="mt-3 text-display font-semibold font-heading tracking-[-0.02em] text-balance">
            Keep bookkeeping moving, {firstName}.
          </h1>
          <p className="mt-3 max-w-2xl text-body text-muted-foreground">
            Start with uploads and open items first, then move into invoices, files, and reports. This page is your
            shortest path through the day instead of a passive dashboard.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <UploadButton className="h-11 px-5">
              <Upload className="mr-2 h-4 w-4" />
              Upload documents
            </UploadButton>
            <Link href="/invoices/new">
              <Button variant="secondary" className="h-11 px-5">
                <Receipt className="mr-2 h-4 w-4" />
                New invoice
              </Button>
            </Link>
            <Link href="/files">
              <Button variant="secondary" className="h-11 px-5">
                <FileStack className="mr-2 h-4 w-4" />
                Open files
              </Button>
            </Link>
            <Link href="/settings/business">
              <Button variant="secondary" className="h-11 px-5">
                <Settings2 className="mr-2 h-4 w-4" />
                Business settings
              </Button>
            </Link>
          </div>

          <div className={`mt-5 rounded-card border px-4 py-3 text-body ${peppolTone}`}>
            <div className={`font-medium ${peppolAccent}`}>PEPPOL status</div>
            <div className="mt-1 text-foreground">{peppolMessage}</div>
            <div className="mt-2 text-caption text-muted-foreground">
              Inbound PEPPOL sync is still not built. TaxHacker currently supports outbound sending only.
            </div>
          </div>
        </div>

        <div className="rounded-card border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <SectionLabel>Desk status</SectionLabel>
              <h2 className="mt-1 text-subtitle font-semibold font-heading tracking-[-0.02em]">
                What needs attention
              </h2>
            </div>
            <Rocket className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            {deskStats.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-card border border-border px-4 py-3 transition-colors hover:border-primary"
              >
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold font-heading tabular-nums">{item.value}</div>
              </Link>
            ))}
          </div>

          <div className="mt-4 rounded-card border border-border p-4 text-body text-muted-foreground">
            <div className="font-medium text-foreground">Suggested next move</div>
            <div className="mt-1">
              {unsortedCount > 0
                ? "Review new uploads first so receipts and invoices do not pile up."
                : blockedInvoices > 0
                  ? "Fix blocked invoices next so they can actually go out."
                  : overdueInvoices > 0
                    ? "Follow up on overdue invoices before moving into reports."
                    : expensesToPay > 0
                      ? "Record or pay outstanding expenses to keep the books current."
                      : "The desk is clear. This is a good moment to create invoices or review reports."}
            </div>
            <Link
              href={
                unsortedCount > 0
                  ? "/unsorted"
                  : blockedInvoices > 0 || overdueInvoices > 0
                    ? "/invoices"
                    : expensesToPay > 0
                      ? "/expenses"
                      : "/reports"
              }
              className="group mt-3 inline-flex items-center gap-1 font-medium text-foreground transition-colors hover:text-primary"
            >
              Open it now
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
