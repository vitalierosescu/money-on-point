import { LookupSelect } from "@/components/forms/lookup-select"
import type { UiLocale } from "@/lib/locale"
import { Project } from "@/prisma/client"
import { useMemo } from "react"

export const FormSelectProject = ({
  title,
  projects,
  name,
  value,
  defaultValue,
  placeholder,
  isRequired = false,
  onValueChange,
  locale,
}: {
  title?: React.ReactNode
  projects: Project[]
  name?: string
  value?: string
  defaultValue?: string
  placeholder?: string
  isRequired?: boolean
  onValueChange?: (value: string) => void
  locale?: UiLocale | string
}) => {
  const items = useMemo(
    () => projects.map((p) => ({ code: p.code, name: p.name, color: p.color ?? undefined })),
    [projects]
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
