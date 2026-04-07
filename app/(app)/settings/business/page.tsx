import BusinessSettingsForm from "@/components/settings/business-settings-form"
import PeppolSettingsForm from "@/components/settings/peppol-settings-form"
import { getCurrentUser } from "@/lib/auth"
import { getSettings } from "@/models/settings"

export default async function BusinessSettingsPage() {
  const user = await getCurrentUser()
  const settings = await getSettings(user.id)

  return (
    <>
      <div className="w-full max-w-3xl space-y-space-6">
        <BusinessSettingsForm user={user} />
        <PeppolSettingsForm user={user} settings={settings} />
      </div>
    </>
  )
}
