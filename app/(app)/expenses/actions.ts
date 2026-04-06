"use server"

import { prisma } from "@/lib/db"
import { getCurrentUser, isSubscriptionExpired } from "@/lib/auth"
import { updateExpenseStatus } from "@/models/transactions"
import { deleteTransaction } from "@/models/transactions"
import { revalidatePath, revalidateTag } from "next/cache"
import {
  getUserUploadsDirectory,
  isEnoughStorageToUploadFile,
  safePathJoin,
  unsortedFilePath,
} from "@/lib/files"
import { createFile, updateFile } from "@/models/files"
import { updateUser } from "@/models/users"
import { getDirectorySize } from "@/lib/files"
import { randomUUID } from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"

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
  data: {
    merchant?: string | null
    total?: number | null
    currencyCode?: string | null
    issuedAt?: Date | null
    dueDate?: Date | null
    categoryCode?: string | null
    projectCode?: string | null
    note?: string | null
    name?: string | null
    description?: string | null
    taxAmount?: number | null
    convertedTotal?: number | null
    convertedCurrencyCode?: string | null
  }
) {
  const user = await getCurrentUser()
  await prisma.transaction.update({
    where: { id, userId: user.id },
    data,
  })
  revalidatePath("/expenses")
  revalidatePath(`/expenses/${id}`)
  return { success: true }
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
