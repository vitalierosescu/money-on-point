import { LookupSelect } from "@/components/forms/lookup-select"
import type { UiLocale } from "@/lib/locale"

const DEFAULT_TYPE_OPTIONS = [
  { code: "expense", name: "Expense" },
  { code: "income", name: "Income" },
  { code: "pending", name: "Pending" },
  { code: "other", name: "Other" },
]

export const FormSelectType = ({
  title,
  name,
  value,
  defaultValue,
  placeholder,
  isRequired = false,
  onValueChange,
  options,
  locale,
}: {
  title?: React.ReactNode
  name?: string
  value?: string
  defaultValue?: string
  placeholder?: string
  isRequired?: boolean
  onValueChange?: (value: string) => void
  options?: Array<{ code: string; name: string }>
  locale?: UiLocale | string
}) => {
  const items = options ?? DEFAULT_TYPE_OPTIONS

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
