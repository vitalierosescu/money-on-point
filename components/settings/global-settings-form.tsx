"use client"

import { saveSettingsAction } from "@/app/(app)/settings/actions"
import { FormError } from "@/components/forms/error"
import { FormSelectCategory } from "@/components/forms/select-category"
import { FormSelectCurrency } from "@/components/forms/select-currency"
import { FormSelectType } from "@/components/forms/select-type"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Category, Currency } from "@/prisma/client"
import { CircleCheckBig } from "lucide-react"
import { useActionState } from "react"

export default function GlobalSettingsForm({
  settings,
  currencies,
  categories,
}: {
  settings: Record<string, string>
  currencies: Currency[]
  categories: Category[]
}) {
  const [saveState, saveAction, pending] = useActionState(saveSettingsAction, null)

  return (
    <form action={saveAction} className="space-y-4">
      <FormSelectCurrency
        title="Default Currency"
        name="default_currency"
        defaultValue={settings.default_currency}
        currencies={currencies}
      />

      <FormSelectType title="Default Transaction Type" name="default_type" defaultValue={settings.default_type} />

      <FormSelectCategory
        title="Default Transaction Category"
        name="default_category"
        defaultValue={settings.default_category}
        categories={categories}
      />

      <div className="space-y-1">
        <Label htmlFor="invoice_starting_number">Invoice Starting Number</Label>
        <p className="text-xs text-muted-foreground">Starting number for auto-increment invoice numbering (for the current year)</p>
        <Input
          id="invoice_starting_number"
          name="invoice_starting_number"
          type="number"
          min="1"
          defaultValue={settings.invoice_starting_number || "1"}
          className="w-40"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="invoice_default_payment_terms">Default Payment Terms</Label>
        <p className="text-xs text-muted-foreground">Default payment terms text for new invoices</p>
        <textarea
          id="invoice_default_payment_terms"
          name="invoice_default_payment_terms"
          rows={3}
          defaultValue={settings.invoice_default_payment_terms || ""}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      </div>

      <div className="flex flex-row items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save Settings"}
        </Button>
        {saveState?.success && (
          <p className="text-green-500 flex flex-row items-center gap-2">
            <CircleCheckBig />
            Saved!
          </p>
        )}
      </div>

      {saveState?.error && <FormError>{saveState.error}</FormError>}
    </form>
  )
}
