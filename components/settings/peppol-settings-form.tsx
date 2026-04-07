"use client"

import { saveSettingsAction, syncRecommandCompanyProfileAction } from "@/app/(app)/settings/actions"
import { FormError } from "@/components/forms/error"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import {
  getActiveRecommandEnvironment,
  getRecommandEnvironmentLabel,
  hasLegacyRecommandCredentials,
} from "@/lib/recommand-settings"
import { normalizeCountryCode } from "@/lib/invoice-delivery"
import { User } from "@/prisma/client"
import { CircleCheckBig } from "lucide-react"
import { useActionState } from "react"

function formatCountryLabel(value?: string | null) {
  const countryCode = normalizeCountryCode(value)
  if (!value?.trim()) return countryCode
  return countryCode === value.trim().toUpperCase() ? countryCode : `${countryCode} (${value.trim()})`
}

function buildPeppolSenderPreview(user: User, settings: Record<string, string>) {
  const legalName = user.businessName?.trim() || user.name?.trim() || "—"
  const streetLine1 = settings.business_street_line1?.trim() || "—"
  const streetLine2 = settings.business_street_line2?.trim() || ""
  const postalCode = settings.business_postal_code?.trim() || "—"
  const city = settings.business_city?.trim() || "—"
  const country = formatCountryLabel(settings.business_country_code || "BE")
  const vatNumber = settings.business_vat_number?.trim() || "—"
  const enterpriseNumber = settings.business_enterprise_number?.trim() || "—"
  const iban = settings.business_iban?.trim() || "—"

  return {
    legalName,
    streetLine1,
    streetLine2,
    postalCode,
    city,
    country,
    vatNumber,
    enterpriseNumber,
    iban,
  }
}

export default function PeppolSettingsForm({
  user,
  settings,
}: {
  user: User
  settings: Record<string, string>
}) {
  const [saveState, saveAction, pending] = useActionState(saveSettingsAction, null)
  const [syncState, syncAction, syncPending] = useActionState(syncRecommandCompanyProfileAction, null)
  const activeEnvironment = getActiveRecommandEnvironment(settings)
  const showLegacyNotice = hasLegacyRecommandCredentials(settings)
  const activeEnvironmentLabel = getRecommandEnvironmentLabel(activeEnvironment)
  const senderPreview = buildPeppolSenderPreview(user, settings)
  const hasPlaygroundCredentials = Boolean(
    settings.recommand_playground_company_id?.trim() &&
      settings.recommand_playground_api_key?.trim() &&
      settings.recommand_playground_api_secret?.trim()
  )
  const hasProductionCredentials = Boolean(
    settings.recommand_production_company_id?.trim() &&
      settings.recommand_production_api_key?.trim() &&
      settings.recommand_production_api_secret?.trim()
  )

  return (
    <form action={saveAction} className="space-y-space-4 rounded-lg border bg-card p-space-5">
      <div>
        <h2 className="text-lg font-semibold">PEPPOL Sender Setup</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These fields are only required for PEPPOL delivery. Email + PDF invoices keep working without them.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="recommand_environment">Active PEPPOL environment</Label>
            <NativeSelect
              id="recommand_environment"
              name="recommand_environment"
              defaultValue={activeEnvironment}
            >
              <option value="playground">Playground</option>
              <option value="production">Production</option>
            </NativeSelect>
          </div>
          <div className="text-sm text-muted-foreground">
            Live PEPPOL verification and sending will use the currently active environment. Current active profile: {activeEnvironmentLabel}.
          </div>
        </div>
      </div>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-medium">Sender profile to mirror in Recommand</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              TaxHacker should stay your working source of truth, but Recommand still keeps the sender company profile used by the PEPPOL environment. Keep the active {activeEnvironmentLabel} company profile aligned with the values below.
            </p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${activeEnvironment === "production" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
            Active: {activeEnvironmentLabel}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ProfileField label="Legal sender name" value={senderPreview.legalName} />
          <ProfileField label="VAT number" value={senderPreview.vatNumber} />
          <ProfileField label="Street line 1" value={senderPreview.streetLine1} />
          <ProfileField label="Enterprise number" value={senderPreview.enterpriseNumber} />
          <ProfileField label="Street line 2" value={senderPreview.streetLine2 || "—"} />
          <ProfileField label="IBAN" value={senderPreview.iban} />
          <ProfileField label="Postal code" value={senderPreview.postalCode} />
          <ProfileField label="City" value={senderPreview.city} />
          <ProfileField label="Country" value={senderPreview.country} />
        </div>

        <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          If the Recommand preview still shows a different sender name or address after you update TaxHacker, update the Recommand company page for the active {activeEnvironmentLabel} environment too. The provider profile can override what you expect to see in the rendered PEPPOL preview.
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form action={syncAction}>
            <Button type="submit" variant="secondary" disabled={syncPending}>
              {syncPending ? "Syncing..." : `Sync Active ${activeEnvironmentLabel} Company`}
            </Button>
          </form>
          {syncState?.success && syncState.data?.summary && (
            <p className="text-sm text-success">{syncState.data.summary}</p>
          )}
        </div>
        {syncState?.error && <FormError className="mt-3 w-full">{syncState.error}</FormError>}
      </section>

      {showLegacyNotice && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          Legacy single-environment Recommand credentials are still stored and remain usable as a fallback. Save the matching Playground or Production profile below to fully separate the two environments.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="business_enterprise_number">Enterprise number</Label>
          <Input id="business_enterprise_number" name="business_enterprise_number" defaultValue={settings.business_enterprise_number || ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="business_vat_number">VAT number</Label>
          <Input id="business_vat_number" name="business_vat_number" defaultValue={settings.business_vat_number || ""} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="business_country_code">Country code</Label>
          <Input id="business_country_code" name="business_country_code" defaultValue={settings.business_country_code || "BE"} maxLength={2} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="business_postal_code">Postal code</Label>
          <Input id="business_postal_code" name="business_postal_code" defaultValue={settings.business_postal_code || ""} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="business_city">City</Label>
          <Input id="business_city" name="business_city" defaultValue={settings.business_city || ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="business_iban">IBAN</Label>
          <Input id="business_iban" name="business_iban" defaultValue={settings.business_iban || ""} placeholder="BE68539007547034" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="business_street_line1">Street line 1</Label>
        <Input id="business_street_line1" name="business_street_line1" defaultValue={settings.business_street_line1 || ""} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="business_street_line2">Street line 2</Label>
        <Input id="business_street_line2" name="business_street_line2" defaultValue={settings.business_street_line2 || ""} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <EnvironmentCredentialsCard
          environment="playground"
          title="Playground credentials"
          description="Use these for safe PEPPOL testing with Recommand Playground."
          settings={settings}
          isActive={activeEnvironment === "playground"}
          isConfigured={hasPlaygroundCredentials}
        />
        <EnvironmentCredentialsCard
          environment="production"
          title="Production credentials"
          description="Use these for real PEPPOL sending to actual recipients."
          settings={settings}
          isActive={activeEnvironment === "production"}
          isConfigured={hasProductionCredentials}
        />
      </div>

      <div className="flex flex-row items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save PEPPOL Settings"}
        </Button>
        {saveState?.success && (
          <p className="flex flex-row items-center gap-2 text-success">
            <CircleCheckBig />
            Saved!
          </p>
        )}
      </div>

      {saveState?.error && <FormError>{saveState.error}</FormError>}
    </form>
  )
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium break-words">{value}</div>
    </div>
  )
}

function EnvironmentCredentialsCard({
  environment,
  title,
  description,
  settings,
  isActive,
  isConfigured,
}: {
  environment: "playground" | "production"
  title: string
  description: string
  settings: Record<string, string>
  isActive: boolean
  isConfigured: boolean
}) {
  const prefix = `recommand_${environment}`

  return (
    <section className={`rounded-lg border p-4 ${isActive ? "border-foreground/20 bg-muted/20" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-col items-end gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${isConfigured ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
            {isConfigured ? "Configured" : "Empty"}
          </span>
          {isActive && (
            <span className="rounded-full bg-foreground px-2 py-0.5 font-medium text-background">
              Active
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}_team_id`}>Recommand team ID</Label>
          <Input id={`${prefix}_team_id`} name={`${prefix}_team_id`} defaultValue={settings[`${prefix}_team_id`] || ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}_company_id`}>Recommand company ID</Label>
          <Input id={`${prefix}_company_id`} name={`${prefix}_company_id`} defaultValue={settings[`${prefix}_company_id`] || ""} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}_api_key`}>Recommand API key</Label>
          <Input id={`${prefix}_api_key`} name={`${prefix}_api_key`} defaultValue={settings[`${prefix}_api_key`] || ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}_api_secret`}>Recommand API secret</Label>
          <Input
            id={`${prefix}_api_secret`}
            name={`${prefix}_api_secret`}
            type="password"
            defaultValue={settings[`${prefix}_api_secret`] || ""}
          />
        </div>
      </div>
    </section>
  )
}
