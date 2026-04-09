import { InvoiceList } from "@/components/invoices/invoice-list"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { getCurrentUser } from "@/lib/auth"
import { t } from "@/lib/i18n"
import { getUiLocale } from "@/lib/locale"
import { getInvoices, InvoiceFilters } from "@/models/invoices"
import { getSettings } from "@/models/settings"
import {
  getActiveRecommandEnvironment,
  getRecommandEnvironmentLabel,
  hasConfiguredRecommandCredentials,
} from "@/lib/recommand-settings"
import { Plus, Upload } from "lucide-react"
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
  const locale = getUiLocale(settings)
  const activeRecommandEnvironment = getActiveRecommandEnvironment(settings)
  const hasRecommandCredentials = hasConfiguredRecommandCredentials(settings, activeRecommandEnvironment)
  const recommandEnvironmentLabel = getRecommandEnvironmentLabel(activeRecommandEnvironment)

  return (
    <>
      <PageHeader
        title={t(locale, "invoices.title")}
        count={invoices.length}
        className="mb-space-6"
        actions={
          <div className="flex gap-2">
            <Link href="/invoices/import">
              <Button variant="outline">
                <Upload /> Import
              </Button>
            </Link>
            <Link href="/invoices/new">
              <Button>
                <Plus /> {t(locale, "invoices.newInvoice")}
              </Button>
            </Link>
          </div>
        }
      />

      <InvoiceList
        invoices={invoices}
        locale={locale}
        hasRecommandCredentials={hasRecommandCredentials}
        recommandEnvironmentLabel={recommandEnvironmentLabel}
        sellerCountryCode={settings.business_country_code}
      />
    </>
  )
}
