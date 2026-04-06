import { addCurrencyAction, deleteCurrencyAction, editCurrencyAction } from "@/app/(app)/settings/actions"
import { CrudTable } from "@/components/settings/crud"
import { PageHeader } from "@/components/ui/page-header"
import { getCurrentUser } from "@/lib/auth"
import { getCurrencies } from "@/models/currencies"

export default async function CurrenciesSettingsPage() {
  const user = await getCurrentUser()
  const currencies = await getCurrencies(user.id)
  const currenciesWithActions = currencies.map((currency) => ({
    ...currency,
    isEditable: true,
    isDeletable: true,
  }))

  return (
    <div className="container space-y-space-6">
      <PageHeader
        title="Currencies"
        description="Custom currencies would not be automatically converted but you still can have them."
        size="md"
      />
      <CrudTable
        items={currenciesWithActions}
        columns={[
          { key: "code", label: "Code", editable: true },
          { key: "name", label: "Name", editable: true },
        ]}
        onDelete={async (code) => {
          "use server"
          return await deleteCurrencyAction(user.id, code)
        }}
        onAdd={async (data) => {
          "use server"
          return await addCurrencyAction(user.id, data as { code: string; name: string })
        }}
        onEdit={async (code, data) => {
          "use server"
          return await editCurrencyAction(user.id, code, data as { name: string })
        }}
      />
    </div>
  )
}
