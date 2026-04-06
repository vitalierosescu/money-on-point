"use client"

import { saveSettingsAction } from "@/app/(app)/settings/actions"
import { FormError } from "@/components/forms/error"
import { FormSelectCategory } from "@/components/forms/select-category"
import { FormSelectCurrency } from "@/components/forms/select-currency"
import { FormSelectType } from "@/components/forms/select-type"
import { FormSelect } from "@/components/forms/simple"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { t } from "@/lib/i18n"
import type { UiLocale } from "@/lib/locale"
import { Category, Currency } from "@/prisma/client"
import { CircleCheckBig } from "lucide-react"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef } from "react"

export default function GlobalSettingsForm({
  settings,
  currencies,
  categories,
  locale,
}: {
  settings: Record<string, string>
  currencies: Currency[]
  categories: Category[]
  locale: UiLocale
}) {
  const router = useRouter()
  const [saveState, saveAction, pending] = useActionState(saveSettingsAction, null)
  const previousSuccessRef = useRef(false)

  useEffect(() => {
    if (saveState?.success && !previousSuccessRef.current) {
      router.refresh()
    }

    previousSuccessRef.current = Boolean(saveState?.success)
  }, [router, saveState?.success])

  return (
    <form action={saveAction} className="space-y-4">
      <div className="space-y-1">
        <FormSelect
          title={t(locale, "settings.uiLocaleLabel")}
          name="ui_locale"
          defaultValue={settings.ui_locale || "en"}
          items={[
            { code: "en", name: t(locale, "common.english") },
            { code: "nl", name: t(locale, "common.dutch") },
          ]}
        />
        <p className="text-xs text-muted-foreground">{t(locale, "settings.uiLocaleDescription")}</p>
      </div>

      <FormSelectCurrency
        title={t(locale, "settings.defaultCurrencyLabel")}
        name="default_currency"
        defaultValue={settings.default_currency}
        currencies={currencies}
      />

      <FormSelectType
        title={t(locale, "settings.defaultTypeLabel")}
        name="default_type"
        defaultValue={settings.default_type}
      />

      <FormSelectCategory
        title={t(locale, "settings.defaultCategoryLabel")}
        name="default_category"
        defaultValue={settings.default_category}
        categories={categories}
      />

      <div className="space-y-1">
        <Label htmlFor="invoice_starting_number">{t(locale, "settings.invoiceStartingNumberLabel")}</Label>
        <p className="text-xs text-muted-foreground">{t(locale, "settings.invoiceStartingNumberDescription")}</p>
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
        <Label htmlFor="invoice_default_payment_terms">{t(locale, "settings.invoicePaymentTermsLabel")}</Label>
        <p className="text-xs text-muted-foreground">{t(locale, "settings.invoicePaymentTermsDescription")}</p>
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
          {pending ? t(locale, "common.saving") : t(locale, "settings.saveSettings")}
        </Button>
        {saveState?.success && (
          <p className="text-success flex flex-row items-center gap-2">
            <CircleCheckBig />
            {t(locale, "settings.settingsSaved")}
          </p>
        )}
      </div>

      {saveState?.error && <FormError>{saveState.error}</FormError>}
    </form>
  )
}
