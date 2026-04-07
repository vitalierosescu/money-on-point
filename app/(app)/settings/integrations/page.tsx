import IntegrationsSettingsForm from "@/components/settings/integrations-settings-form"
import { Section } from "@/components/ui/section"
import { getCurrentUser } from "@/lib/auth"
import { getSettings } from "@/models/settings"

export default async function IntegrationsSettingsPage() {
  const user = await getCurrentUser()
  const settings = await getSettings(user.id)

  return (
    <div className="w-full max-w-3xl space-y-space-6">
      <Section
        title="Integrations"
        description="Connect external systems like Archie to sync invoices into TaxHacker."
      >
        <IntegrationsSettingsForm settings={settings} />
      </Section>
    </div>
  )
}
