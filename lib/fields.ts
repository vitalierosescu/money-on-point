import { Field, Transaction } from "@/prisma/client"

export function getFieldOptions(options: unknown): string[] {
  if (!Array.isArray(options)) {
    return []
  }

  return options
    .map((option) => String(option).trim())
    .filter((option) => option.length > 0)
}

export function normalizeFieldOptionsInput(type: string, options: unknown): string[] | null {
  if (type !== "single_select") {
    return null
  }

  const rawOptions = Array.isArray(options)
    ? options
    : typeof options === "string"
      ? options.split(/[\n,]/g)
      : []

  const normalized = rawOptions
    .map((option) => String(option).trim())
    .filter((option, index, array) => option.length > 0 && array.indexOf(option) === index)

  return normalized.length > 0 ? normalized : null
}

export function formatFieldOptions(options: unknown): string {
  return getFieldOptions(options).join(", ")
}

export function getTransactionFieldValue(
  transaction: Transaction,
  field: Pick<Field, "code" | "isExtra">
): unknown {
  if (field.isExtra) {
    const extra = transaction.extra as Record<string, unknown> | null
    return extra?.[field.code]
  }

  return transaction[field.code as keyof Transaction]
}
