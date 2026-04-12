"use server"

import { prisma } from "@/lib/db"
import { getCurrentUser, isSubscriptionExpired } from "@/lib/auth"
import { normalizeFieldOptionsInput } from "@/lib/fields"
import { createField, getFields, updateField } from "@/models/fields"
import { deleteTransaction, updateExpenseStatus, updateTransaction } from "@/models/transactions"
import { revalidatePath, revalidateTag } from "next/cache"
import {
  getDirectorySize,
  getUserUploadsDirectory,
  isEnoughStorageToUploadFile,
  safePathJoin,
  unsortedFilePath,
} from "@/lib/files"
import { createFile, deleteFile, updateFile } from "@/models/files"
import { updateUser } from "@/models/users"
import { randomUUID } from "crypto"
import { codeFromName } from "@/lib/utils"
import { Prisma } from "@/prisma/client"
import { mkdir, writeFile } from "fs/promises"
import path from "path"

type MerchantAutofillValue = string | number

export type MerchantAutofillProfile = {
  merchant: string
  fields: Record<string, MerchantAutofillValue>
  vatRate: number | null
  vatComputationBasis: "gross" | "net"
}

const AUTOFILL_STANDARD_KEYS = ["currencyCode", "type", "categoryCode", "projectCode", "description"] as const
const EXCLUDED_AUTOFILL_EXTRA_CODES = new Set(["vat", "vat_rate"])

function normalizeMerchantInput(value: string) {
  return value.trim()
}

function parseNumericLike(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".")
    if (!normalized) return null
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function normalizeAutofillValue(key: string, value: unknown): MerchantAutofillValue | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) return null

  if (key === "currencyCode") return trimmed.toUpperCase()
  if (key === "type") return trimmed.toLowerCase()
  return trimmed
}

function valueBucketKey(value: MerchantAutofillValue) {
  return typeof value === "number" ? `n:${value}` : `s:${value}`
}

function pickDominantValue(
  values: MerchantAutofillValue[],
  minimumConfidence: number
): MerchantAutofillValue | null {
  if (values.length === 0) return null

  const counts = new Map<string, { value: MerchantAutofillValue; count: number }>()
  values.forEach((value) => {
    const bucket = valueBucketKey(value)
    const current = counts.get(bucket)
    if (current) {
      current.count += 1
      return
    }
    counts.set(bucket, { value, count: 1 })
  })

  const ranked = Array.from(counts.values()).sort((a, b) => b.count - a.count)
  const winner = ranked[0]
  if (!winner) return null

  if (values.length === 1) {
    return winner.value
  }

  const confidence = winner.count / values.length
  if (confidence < minimumConfidence) {
    return null
  }

  const runnerUpCount = ranked[1]?.count ?? 0
  if (winner.count === runnerUpCount) {
    return null
  }

  return winner.value
}

function readExtraObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function pickVatRateFromRow(row: {
  total: number | null
  taxAmount: number | null
  extra: Prisma.JsonValue | null
}): number | null {
  const extra = readExtraObject(row.extra)
  const explicitRate = parseNumericLike(extra.vat_rate)
  if (explicitRate !== null) {
    return Number(explicitRate.toFixed(4))
  }

  const total = row.total !== null && row.total !== undefined ? row.total / 100 : null
  const vatAmount =
    parseNumericLike(extra.vat) ??
    (row.taxAmount !== null && row.taxAmount !== undefined ? row.taxAmount / 100 : null)

  if (total === null || total <= 0 || vatAmount === null || vatAmount <= 0 || vatAmount >= total) {
    return null
  }

  const grossDerivedRate = (vatAmount / (total - vatAmount)) * 100
  return Number(grossDerivedRate.toFixed(4))
}

function inferVatBasis(rows: Array<{
  total: number | null
  taxAmount: number | null
  extra: Prisma.JsonValue | null
}>): "gross" | "net" {
  let grossError = 0
  let netError = 0
  let comparableRows = 0

  rows.forEach((row) => {
    const extra = readExtraObject(row.extra)
    const rate = parseNumericLike(extra.vat_rate)
    const total = row.total !== null && row.total !== undefined ? row.total / 100 : null
    const vatAmount =
      parseNumericLike(extra.vat) ??
      (row.taxAmount !== null && row.taxAmount !== undefined ? row.taxAmount / 100 : null)

    if (rate === null || total === null || total <= 0 || vatAmount === null || vatAmount < 0) {
      return
    }

    grossError += Math.abs(total * (rate / (100 + rate)) - vatAmount)
    netError += Math.abs(total * (rate / 100) - vatAmount)
    comparableRows += 1
  })

  if (comparableRows === 0) {
    return "gross"
  }

  return grossError <= netError ? "gross" : "net"
}

export async function listMerchantsAction(): Promise<
  { success: true; merchants: string[] } | { success: false; error: string }
> {
  try {
    const user = await getCurrentUser()
    const rows = await prisma.transaction.findMany({
      where: { userId: user.id, merchant: { not: null } },
      select: { merchant: true },
      distinct: ["merchant"],
      orderBy: { merchant: "asc" },
      take: 200,
    })
    const merchants = rows
      .map((row) => row.merchant?.trim())
      .filter((value): value is string => Boolean(value && value.length > 0))
    return { success: true, merchants }
  } catch (error) {
    console.error("Failed to list merchants:", error)
    return { success: false, error: "Failed to list merchants" }
  }
}

export async function getMerchantAutofillAction(
  merchant: string
): Promise<
  { success: true; profile: MerchantAutofillProfile | null } | { success: false; error: string }
> {
  try {
    const user = await getCurrentUser()
    const trimmedMerchant = normalizeMerchantInput(merchant)
    if (!trimmedMerchant) {
      return { success: true, profile: null }
    }

    const [rows, fields] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId: user.id,
          merchant: { equals: trimmedMerchant, mode: "insensitive" },
        },
        select: {
          merchant: true,
          currencyCode: true,
          type: true,
          categoryCode: true,
          projectCode: true,
          description: true,
          total: true,
          taxAmount: true,
          extra: true,
        },
        orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
        take: 50,
      }),
      getFields(user.id),
    ])

    if (rows.length === 0) {
      return { success: true, profile: null }
    }

    const extraFieldCodes = fields
      .filter((field) => field.isExtra && field.type !== "boolean" && !EXCLUDED_AUTOFILL_EXTRA_CODES.has(field.code))
      .map((field) => field.code)

    const fieldCandidates = new Map<string, MerchantAutofillValue[]>()

    AUTOFILL_STANDARD_KEYS.forEach((key) => {
      const values = rows
        .map((row) => normalizeAutofillValue(key, row[key]))
        .filter((value): value is MerchantAutofillValue => value !== null)
      if (values.length > 0) {
        fieldCandidates.set(key, values)
      }
    })

    extraFieldCodes.forEach((code) => {
      const values = rows
        .map((row) => normalizeAutofillValue(code, readExtraObject(row.extra)[code]))
        .filter((value): value is MerchantAutofillValue => value !== null)
      if (values.length > 0) {
        fieldCandidates.set(code, values)
      }
    })

    const resolvedFields: Record<string, MerchantAutofillValue> = {}
    fieldCandidates.forEach((values, code) => {
      const minimumConfidence = code === "description" ? 0.75 : 0.6
      const dominantValue = pickDominantValue(values, minimumConfidence)
      if (dominantValue !== null) {
        resolvedFields[code] = dominantValue
      }
    })

    const vatRates = rows
      .map((row) => pickVatRateFromRow(row))
      .filter((value): value is number => value !== null)
      .map((value) => Number(value.toFixed(2)))

    const dominantVatRate = pickDominantValue(vatRates, 0.55)

    return {
      success: true,
      profile: {
        merchant: rows[0]?.merchant?.trim() || trimmedMerchant,
        fields: resolvedFields,
        vatRate: typeof dominantVatRate === "number" ? dominantVatRate : null,
        vatComputationBasis: inferVatBasis(rows),
      },
    }
  } catch (error) {
    console.error("Failed to load merchant autofill profile:", error)
    return { success: false, error: "Failed to load merchant autofill profile" }
  }
}

export async function markExpensePaidAction(id: string) {
  const user = await getCurrentUser()
  await updateExpenseStatus(id, user.id, "paid")
  revalidatePath("/expenses")
  revalidatePath(`/expenses/${id}`)
  return { success: true }
}

export async function markExpenseToPayAction(id: string) {
  const user = await getCurrentUser()
  await updateExpenseStatus(id, user.id, "to_pay")
  revalidatePath("/expenses")
  revalidatePath(`/expenses/${id}`)
  return { success: true }
}

export async function markExpenseUnpaidAction(id: string) {
  const user = await getCurrentUser()
  await updateExpenseStatus(id, user.id, "unpaid")
  revalidatePath("/expenses")
  revalidatePath(`/expenses/${id}`)
  return { success: true }
}

export async function updateExpenseAction(
  id: string,
  data: Record<string, unknown>
) {
  const user = await getCurrentUser()
  await updateTransaction(id, user.id, data)
  revalidatePath("/expenses")
  revalidatePath(`/expenses/${id}`)
  return { success: true }
}

export async function updateExpenseFieldVisibilityAction(code: string, isVisibleInList: boolean) {
  const user = await getCurrentUser()

  await updateField(user.id, code, { isVisibleInList })

  revalidatePath("/expenses")
  revalidatePath("/settings/fields")
  return { success: true }
}

export async function createExpenseFieldAction(data: {
  name: string
  type: "string" | "single_select"
  options?: string[] | string | null
}) {
  const user = await getCurrentUser()
  const type = data.type === "single_select" ? "single_select" : "string"
  const options = normalizeFieldOptionsInput(type, data.options)

  if (!data.name.trim()) {
    return { success: false, error: "Field name is required." }
  }

  if (type === "single_select" && (!options || options.length === 0)) {
    return { success: false, error: "Single-select fields need at least one option." }
  }

  const code = codeFromName(data.name)

  try {
    const field = await createField(user.id, {
      code,
      name: data.name.trim(),
      type,
      options,
      llm_prompt: null,
      isVisibleInList: true,
      isVisibleInAnalysis: false,
      isRequired: false,
      isExtra: true,
    })

    revalidatePath("/expenses")
    revalidatePath("/settings/fields")
    return { success: true, field }
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, error: "A field with this name already exists." }
    }

    return { success: false, error: "Failed to create field." }
  }
}

export async function duplicateExpenseAction(id: string) {
  const user = await getCurrentUser()
  const original = await prisma.transaction.findFirst({
    where: { id, userId: user.id },
  })
  if (!original) return { success: false, error: "Expense not found" }

  const { extra, ...baseData } = original
  const rest = {
    ...baseData,
    id: undefined,
    createdAt: undefined,
    updatedAt: undefined,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.transaction.create as any)({
    data: {
      ...rest,
      extra: extra ?? undefined,
      status: "unpaid",
      files: [],
      items: [],
    },
  })
  revalidatePath("/expenses")
  return { success: true }
}

export async function createCreditNoteAction(
  id: string
) {
  const user = await getCurrentUser()
  const original = await prisma.transaction.findFirst({
    where: { id, userId: user.id },
  })
  if (!original) return { success: false, error: "Expense not found" }

  const { extra, ...baseData } = original
  const rest = {
    ...baseData,
    id: undefined,
    createdAt: undefined,
    updatedAt: undefined,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.transaction.create as any)({
    data: {
      ...rest,
      extra: extra ?? undefined,
      total: original.total !== null ? -Math.abs(original.total) : null,
      convertedTotal: original.convertedTotal !== null ? -Math.abs(original.convertedTotal) : null,
      taxAmount: original.taxAmount !== null && original.taxAmount !== undefined
        ? -Math.abs(original.taxAmount)
        : null,
      status: "unpaid",
      linkedExpenseId: id,
      files: [],
      items: [],
      name: `Credit: ${original.name ?? original.merchant ?? ""}`,
    },
  })

  revalidatePath("/expenses")
  return { success: true }
}

export async function deleteExpenseAction(id: string) {
  const user = await getCurrentUser()
  await deleteTransaction(id, user.id)
  revalidatePath("/expenses")
  revalidatePath("/files")
  return { success: true }
}

export async function uploadAndAttachFileToExpenseAction(
  expenseId: string,
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()

  const files = formData.getAll("files") as File[]
  if (!files.length) return { success: false, error: "No files provided" }

  if (isSubscriptionExpired(user)) {
    return { success: false, error: "Your subscription has expired" }
  }

  const totalSize = files.reduce((acc, f) => acc + f.size, 0)
  if (!isEnoughStorageToUploadFile(user, totalSize)) {
    return { success: false, error: "Insufficient storage" }
  }

  const userUploadsDir = getUserUploadsDirectory(user)

  for (const file of files) {
    if (!(file instanceof File)) continue

    const fileUuid = randomUUID()
    const relativeFilePath = unsortedFilePath(fileUuid, file.name)
    const fullFilePath = safePathJoin(userUploadsDir, relativeFilePath)
    const buffer = Buffer.from(await file.arrayBuffer())

    await mkdir(path.dirname(fullFilePath), { recursive: true })
    await writeFile(fullFilePath, buffer)

    const fileRecord = await createFile(user.id, {
      id: fileUuid,
      filename: file.name,
      path: relativeFilePath,
      mimetype: file.type,
      metadata: { size: file.size, lastModified: file.lastModified },
    })

    // Mark as reviewed since it's being directly attached to an expense
    await updateFile(fileRecord.id, user.id, { isReviewed: true })

    // Attach to expense
    const expense = await prisma.transaction.findFirst({
      where: { id: expenseId, userId: user.id },
    })
    if (!expense) return { success: false, error: "Expense not found" }

    const currentFiles = Array.isArray(expense.files) ? (expense.files as string[]) : []
    await prisma.transaction.update({
      where: { id: expenseId, userId: user.id },
      data: { files: [...currentFiles, fileUuid] },
    })
  }

  const storageUsed = await getDirectorySize(userUploadsDir)
  await updateUser(user.id, { storageUsed })

  revalidateTag(`unsorted:${user.id}`)
  revalidateTag(`user:${user.id}`)
  revalidatePath("/expenses")
  revalidatePath(`/expenses/${expenseId}`)
  revalidatePath("/files")
  return { success: true }
}

export async function attachFileToExpenseAction(expenseId: string, fileId: string) {
  const user = await getCurrentUser()
  const expense = await prisma.transaction.findFirst({
    where: { id: expenseId, userId: user.id },
  })
  if (!expense) return { success: false, error: "Expense not found" }

  const currentFiles = Array.isArray(expense.files) ? (expense.files as string[]) : []
  await prisma.transaction.update({
    where: { id: expenseId, userId: user.id },
    data: { files: [...currentFiles, fileId] },
  })
  revalidatePath("/expenses")
  revalidatePath(`/expenses/${expenseId}`)
  revalidatePath("/files")
  return { success: true }
}

export async function removeFileFromExpenseAction(
  expenseId: string,
  fileId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()
  const expense = await prisma.transaction.findFirst({
    where: { id: expenseId, userId: user.id },
  })
  if (!expense) return { success: false, error: "Expense not found" }

  const currentFiles = Array.isArray(expense.files) ? (expense.files as string[]) : []
  if (!currentFiles.includes(fileId)) {
    return { success: false, error: "File is not attached to this expense" }
  }

  // Detach from this expense
  await prisma.transaction.update({
    where: { id: expenseId, userId: user.id },
    data: { files: currentFiles.filter((id) => id !== fileId) },
  })

  // If no other expense references this file, delete it from disk + db
  const otherExpenses = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      id: { not: expenseId },
      files: { array_contains: fileId },
    },
    select: { id: true },
  })
  if (otherExpenses.length === 0) {
    await deleteFile(fileId, user.id)
  }

  revalidateTag(`unsorted:${user.id}`)
  revalidateTag(`user:${user.id}`)
  revalidatePath("/expenses")
  revalidatePath(`/expenses/${expenseId}`)
  revalidatePath("/files")
  return { success: true }
}

export async function bulkMarkExpensePaidAction(ids: string[]) {
  const user = await getCurrentUser()
  await prisma.transaction.updateMany({
    where: { id: { in: ids }, userId: user.id },
    data: { status: "paid" },
  })
  revalidatePath("/expenses")
  return { success: true }
}

export async function bulkMarkExpenseToPayAction(ids: string[]) {
  const user = await getCurrentUser()
  await prisma.transaction.updateMany({
    where: { id: { in: ids }, userId: user.id },
    data: { status: "to_pay" },
  })
  revalidatePath("/expenses")
  return { success: true }
}

export async function bulkDeleteExpenseAction(ids: string[]) {
  const user = await getCurrentUser()

  for (const id of ids) {
    await deleteTransaction(id, user.id)
  }

  revalidatePath("/expenses")
  revalidatePath("/files")
  return { success: true }
}
