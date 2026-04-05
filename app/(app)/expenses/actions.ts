"use server"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"
import { updateExpenseStatus } from "@/models/transactions"
import { revalidatePath } from "next/cache"

export async function markExpensePaidAction(id: string) {
  const user = await getCurrentUser()
  await updateExpenseStatus(id, user.id, "paid")
  revalidatePath("/expenses")
  return { success: true }
}

export async function markExpenseToPayAction(id: string) {
  const user = await getCurrentUser()
  await updateExpenseStatus(id, user.id, "to_pay")
  revalidatePath("/expenses")
  return { success: true }
}

export async function markExpenseUnpaidAction(id: string) {
  const user = await getCurrentUser()
  await updateExpenseStatus(id, user.id, "unpaid")
  revalidatePath("/expenses")
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
  }
) {
  const user = await getCurrentUser()
  await prisma.transaction.update({
    where: { id, userId: user.id },
    data,
  })
  revalidatePath("/expenses")
  return { success: true }
}

export async function duplicateExpenseAction(id: string) {
  const user = await getCurrentUser()
  const original = await prisma.transaction.findFirst({
    where: { id, userId: user.id },
  })
  if (!original) return { success: false, error: "Expense not found" }

  const { id: _id, createdAt: _c, updatedAt: _u, extra, ...rest } = original
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
  id: string,
  linkedInvoiceId?: string | null
) {
  const user = await getCurrentUser()
  const original = await prisma.transaction.findFirst({
    where: { id, userId: user.id },
  })
  if (!original) return { success: false, error: "Expense not found" }

  const { id: _id, createdAt: _c, updatedAt: _u, extra, ...rest } = original
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.transaction.create as any)({
    data: {
      ...rest,
      extra: extra ?? undefined,
      total: original.total !== null ? -Math.abs(original.total) : null,
      convertedTotal: original.convertedTotal !== null ? -Math.abs(original.convertedTotal) : null,
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
  await prisma.transaction.delete({
    where: { id, userId: user.id },
  })
  revalidatePath("/expenses")
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
