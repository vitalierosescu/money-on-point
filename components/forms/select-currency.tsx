import { LookupSelect } from "@/components/forms/lookup-select"
import type { UiLocale } from "@/lib/locale"
import { useMemo } from "react"

export const FormSelectCurrency = ({
  title,
  currencies,
  name,
  value,
  defaultValue,
  placeholder,
  isRequired = false,
  onValueChange,
  locale,
}: {
  title?: React.ReactNode
  currencies: { code: string; name: string }[]
  name?: string
  value?: string
  defaultValue?: string
  placeholder?: string
  isRequired?: boolean
  onValueChange?: (value: string) => void
  locale?: UiLocale | string
}) => {
  const items = useMemo(
    () => currencies.map((c) => ({ code: c.code, name: c.code })),
    [currencies]
  )

  return (
    <LookupSelect
      title={title}
      name={name}
      value={value}
      defaultValue={defaultValue}
      items={items}
      onValueChange={onValueChange}
      placeholder={placeholder}
      isRequired={isRequired}
      locale={locale}
    />
  )
}
