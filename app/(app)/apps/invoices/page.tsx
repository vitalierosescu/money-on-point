import { getCurrentUser } from "@/lib/auth"
import { getAppData } from "@/models/apps"
import { getCurrencies } from "@/models/currencies"
import { getSettings } from "@/models/settings"
import { InvoiceGenerator } from "./components/invoice-generator"
import { InvoiceTemplate } from "./default-templates"
import { manifest } from "./manifest"
import { PageHeader } from "@/components/ui/page-header"

export type InvoiceAppData = {
  templates: InvoiceTemplate[]
}

export default async function InvoicesApp() {
  const user = await getCurrentUser()
  const settings = await getSettings(user.id)
  const currencies = await getCurrencies(user.id)
  const appData = (await getAppData(user, "invoices")) as InvoiceAppData | null

  return (
    <div>
      <PageHeader title={<span>{manifest.icon} {manifest.name}</span>} className="mb-space-6" />
      <InvoiceGenerator user={user} settings={settings} currencies={currencies} appData={appData} />
    </div>
  )
}
