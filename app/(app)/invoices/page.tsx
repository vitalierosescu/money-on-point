import { InvoiceList } from "@/components/invoices/invoice-list"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { getCurrentUser } from "@/lib/auth"
import { getInvoices, InvoiceFilters } from "@/models/invoices"
import { getSettings } from "@/models/settings"
import {
  getActiveRecommandEnvironment,
  getRecommandEnvironmentLabel,
  hasConfiguredRecommandCredentials,
} from "@/lib/recommand-settings"
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
  const [invoices, settings] = await Promise.all([getInvoices(user.id, filters), getSettings(user.id)])
  const activeRecommandEnvironment = getActiveRecommandEnvironment(settings)
  const hasRecommandCredentials = hasConfiguredRecommandCredentials(settings, activeRecommandEnvironment)
  const recommandEnvironmentLabel = getRecommandEnvironmentLabel(activeRecommandEnvironment)

  return (
    <>
      <PageHeader
        title="Invoices"
        count={invoices.length}
        className="mb-space-6"
        actions={
          <Link href="/invoices/new">
            <Button>
              <Plus /> New Invoice
            </Button>
          </Link>
        }
      />

      <InvoiceList
        invoices={invoices}
        hasRecommandCredentials={hasRecommandCredentials}
        recommandEnvironmentLabel={recommandEnvironmentLabel}
      />
    </>
  )
}
