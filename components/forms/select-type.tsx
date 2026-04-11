import { SelectProps } from "@radix-ui/react-select"
import { FormSelect } from "./simple"

export const FormSelectType = ({
  title,
  emptyValue,
  placeholder,
  hideIfEmpty = false,
  isRequired = false,
  options,
  ...props
}: {
  title: React.ReactNode
  emptyValue?: string
  placeholder?: string
  hideIfEmpty?: boolean
  isRequired?: boolean
  options?: Array<{ code: string; name: string; badge?: string }>
} & SelectProps) => {
  const items = options ?? [
    { code: "expense", name: "Expense", badge: "↓" },
    { code: "income", name: "Income", badge: "↑" },
    { code: "pending", name: "Pending", badge: "⏲︎" },
    { code: "other", name: "Other", badge: "?" },
  ]

  return (
    <FormSelect
      title={title}
      items={items}
      emptyValue={emptyValue}
      placeholder={placeholder}
      hideIfEmpty={hideIfEmpty}
      isRequired={isRequired}
      {...props}
    />
  )
}
