"use server"

import { prisma } from "@/lib/db"
import { getCurrentUser, isSubscriptionExpired } from "@/lib/auth"
import { normalizeFieldOptionsInput } from "@/lib/fields"
import { createField, updateField } from "@/models/fields"
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
