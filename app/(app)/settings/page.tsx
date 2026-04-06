import GlobalSettingsForm from "@/components/settings/global-settings-form"
import { Section } from "@/components/ui/section"
import { getCurrentUser } from "@/lib/auth"
import { getUiLocale } from "@/lib/locale"
import {
  getActiveRecommandEnvironment,
  getRecommandEnvironmentLabel,
  hasConfiguredRecommandCredentials,
} from "@/lib/recommand-settings"
import { getCategories } from "@/models/categories"
import { getCurrencies } from "@/models/currencies"
import { getSettings } from "@/models/settings"
import Link from "next/link"

export default async function SettingsPage() {
  const user = await getCurrentUser()
  const settings = await getSettings(user.id)
  const locale = getUiLocale(settings)
  const activeRecommandEnvironment = getActiveRecommandEnvironment(settings)
  const currencies = await getCurrencies(user.id)
  const categories = await getCategories(user.id)
  const readinessItems = [
    { label: "Business name", href: "/settings/business", ready: Boolean(user.businessName?.trim()) },
    { label: "Business address", href: "/settings/business", ready: Boolean(user.businessAddress?.trim()) },
    { label: "Bank details", href: "/settings/business", ready: Boolean(user.businessBankDetails?.trim()) },
    {
      label: "Structured sender identity",
      href: "/settings/business",
      ready: Boolean(
        settings.business_country_code?.trim() &&
          settings.business_postal_code?.trim() &&
          settings.business_city?.trim() &&
          settings.business_street_line1?.trim() &&
          (settings.business_vat_number?.trim() || settings.business_enterprise_number?.trim())
      ),
    },
    {
      label: `PEPPOL / Recommand (${getRecommandEnvironmentLabel(activeRecommandEnvironment)})`,
      href: "/settings/business",
      ready: !settings.business_iban?.trim() ? !hasConfiguredRecommandCredentials(settings) : hasConfiguredRecommandCredentials(settings),
    },
    { label: "Default currency", href: "/settings", ready: Boolean(settings.default_currency?.trim()) },
    { label: "Invoice starting number", href: "/settings", ready: Boolean(settings.invoice_starting_number?.trim()) },
    { label: "Default payment terms", href: "/settings", ready: Boolean(settings.invoice_default_payment_terms?.trim()) },
  ]
  const missingCount = readinessItems.filter((item) => !item.ready).length

  return (
    <>
      <div className="w-full max-w-2xl space-y-space-6">
        <Section
          title="Invoicing Readiness"
          description="Complete this checklist before sending invoices from TaxHacker."
          actions={
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Missing</div>
              <div className="text-2xl font-semibold tabular-nums">{missingCount}</div>
            </div>
          }
        >
          <div className="rounded-lg border bg-card p-space-4">
            <div className="grid gap-2">
              {readinessItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/20"
                >
                  <span>{item.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.ready ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                    }`}
                  >
                    {item.ready ? "Ready" : "Needs setup"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </Section>

        <Section title="General settings">
          <GlobalSettingsForm settings={settings} currencies={currencies} categories={categories} locale={locale} />
        </Section>
      </div>
    </>
  )
}
