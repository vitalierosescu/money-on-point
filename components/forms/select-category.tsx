"use client"

import { LookupSelect } from "@/components/forms/lookup-select"
import type { UiLocale } from "@/lib/locale"
import { Category } from "@/prisma/client"
import { useMemo } from "react"

export const FormSelectCategory = ({
  title,
  categories,
  name,
  value,
  defaultValue,
  placeholder,
  isRequired = false,
  onValueChange,
  locale,
}: {
  title?: React.ReactNode
  categories: Category[]
  name?: string
  value?: string
  defaultValue?: string
  placeholder?: string
  isRequired?: boolean
  onValueChange?: (value: string) => void
  locale?: UiLocale | string
}) => {
  const items = useMemo(
    () => categories.map((c) => ({ code: c.code, name: c.name, color: c.color ?? undefined })),
    [categories]
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
