import DashboardDropZoneWidget from "@/components/dashboard/drop-zone-widget"
import { HomeHeroWidget } from "@/components/dashboard/home-hero-widget"
import { StatsWidget } from "@/components/dashboard/stats-widget"
import DashboardUnsortedWidget from "@/components/dashboard/unsorted-widget"
import { WelcomeWidget } from "@/components/dashboard/welcome-widget"
import { WorkQueueWidget } from "@/components/dashboard/work-queue-widget"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { PageShell } from "@/components/ui/page-shell"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { getInvoiceDeliveryMethod, getInvoiceDeliveryReadiness, getPeppolBusinessReadiness } from "@/lib/invoice-delivery"
import {
  getActiveRecommandEnvironment,
  getRecommandEnvironmentLabel,
  hasConfiguredRecommandCredentials,
} from "@/lib/recommand-settings"
import { getUnsortedFiles, getUnsortedFilesCount } from "@/models/files"
import { getInvoices } from "@/models/invoices"
import { getSettings } from "@/models/settings"
import { getExpenses } from "@/models/transactions"
import { TransactionFilters } from "@/models/transactions"
import { Metadata } from "next"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Dashboard",
  description: config.app.description,
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<TransactionFilters> }) {
  const filters = await searchParams
  const user = await getCurrentUser()
  const [unsortedFilesCount, settings, invoices, expenses] = await Promise.all([
    getUnsortedFilesCount(user.id),
    getSettings(user.id),
    getInvoices(user.id),
    getExpenses(user.id),
  ])
  const activePeppolEnvironment = getActiveRecommandEnvironment(settings)
  const activePeppolReady = hasConfiguredRecommandCredentials(settings, activePeppolEnvironment)
  const activePeppolLabel = getRecommandEnvironmentLabel(activePeppolEnvironment)
  const peppolSenderMissing = Object.keys(
    getPeppolBusinessReadiness(
      {
        businessName: user.businessName,
        businessBankDetails: user.businessBankDetails,
      },
      settings
    )
  ).length > 0
  const blockedInvoices = invoices.filter((invoice) => {
    if (["paid", "cancelled"].includes(invoice.status)) return false
    const readiness = getInvoiceDeliveryReadiness(invoice, {
      hasRecommandCredentials: activePeppolReady,
      environmentLabel: activePeppolLabel,
    })
    if (!readiness.isReady) return true
    return getInvoiceDeliveryMethod(invoice) === "peppol" && peppolSenderMissing
  }).length
  const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue").length
  const expensesToPay = expenses.filter((expense) => expense.status === "to_pay" || expense.status === "overdue").length
  const productionPeppolReady = hasConfiguredRecommandCredentials(settings, "production")

  return (
    <PageShell padding="lg" gap="lg" maxWidth="wide">
      <HomeHeroWidget
        userName={user.name}
        unsortedCount={unsortedFilesCount}
        blockedInvoices={blockedInvoices}
        overdueInvoices={overdueInvoices}
        expensesToPay={expensesToPay}
        activePeppolEnvironment={activePeppolEnvironment}
        activePeppolReady={activePeppolReady}
        productionPeppolReady={productionPeppolReady}
      />

      <WorkQueueWidget
        unsortedCount={unsortedFilesCount}
        expensesToPay={expensesToPay}
        overdueInvoices={overdueInvoices}
        blockedInvoices={blockedInvoices}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_380px] xl:items-stretch">
        <DashboardDropZoneWidget />
        <Suspense fallback={<DashboardUnsortedFallback />}>
          <DashboardUnsortedSection userId={user.id} />
        </Suspense>
      </div>

      {settings.is_welcome_message_hidden !== "true" && <WelcomeWidget />}

      <Separator />

      <Suspense fallback={<DashboardStatsFallback />}>
        <StatsWidget filters={filters} />
      </Suspense>
    </PageShell>
  )
}

async function DashboardUnsortedSection({ userId }: { userId: string }) {
  const files = await getUnsortedFiles(userId)
  return <DashboardUnsortedWidget files={files} />
}

function DashboardUnsortedFallback() {
  return <Skeleton className="h-[260px] w-full rounded-xl" />
}

function DashboardStatsFallback() {
  return <Skeleton className="h-[520px] w-full rounded-xl" />
}
