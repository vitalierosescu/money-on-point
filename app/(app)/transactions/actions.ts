"use server"

import { transactionFormSchema } from "@/forms/transactions"
import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import {
  getDirectorySize,
  getTransactionFileUploadPath,
  getUserUploadsDirectory,
  isEnoughStorageToUploadFile,
  safePathJoin,
  unsortedFilePath,
} from "@/lib/files"
import { updateField } from "@/models/fields"
import { createFile, deleteFile, getFileById } from "@/models/files"
import {
  bulkDeleteTransactions,
  createTransaction,
  deleteTransaction,
  getTransactionById,
  updateTransaction,
  updateTransactionFiles,
} from "@/models/transactions"
import { updateUser } from "@/models/users"
import { Transaction } from "@/prisma/client"
import { randomUUID } from "crypto"
import { mkdir, rename, writeFile } from "fs/promises"
import { revalidatePath } from "next/cache"
import path from "path"

export async function createTransactionAction(
  _prevState: ActionState<Transaction> | null,
  formData: FormData
): Promise<ActionState<Transaction>> {
  try {
    const user = await getCurrentUser()
    const validatedForm = transactionFormSchema.safeParse(Object.fromEntries(formData.entries()))

    if (!validatedForm.success) {
      return { success: false, error: validatedForm.error.message }
    }

    const transaction = await createTransaction(user.id, validatedForm.data)
    revalidatePath("/invoices")
    revalidatePath("/expenses")
    revalidatePath("/dashboard")
    return { success: true, data: transaction }
  } catch (error) {
    console.error("Failed to create transaction:", error)
    return { success: false, error: `Failed to create transaction: ${error}` }
  }
}

export async function saveTransactionAction(
  _prevState: ActionState<Transaction> | null,
  formData: FormData
): Promise<ActionState<Transaction>> {
  try {
    const user = await getCurrentUser()
    const transactionId = formData.get("transactionId") as string
    const validatedForm = transactionFormSchema.safeParse(Object.fromEntries(formData.entries()))

    if (!validatedForm.success) {
      return { success: false, error: validatedForm.error.message }
    }

    const transaction = await updateTransaction(transactionId, user.id, validatedForm.data)
    revalidatePath("/invoices")
    revalidatePath("/expenses")
    revalidatePath("/dashboard")
    return { success: true, data: transaction }
  } catch (error) {
    console.error("Failed to save transaction:", error)
    return { success: false, error: `Failed to save transaction: ${error}` }
  }
}

export async function deleteTransactionAction(
  _prevState: ActionState<null> | null,
  transactionId: string
): Promise<ActionState<null>> {
  try {
    const user = await getCurrentUser()
    await deleteTransaction(transactionId, user.id)
    revalidatePath("/invoices")
    revalidatePath("/expenses")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete transaction:", error)
    return { success: false, error: `Failed to delete transaction: ${error}` }
  }
}

export async function bulkDeleteTransactionsAction(ids: string[]): Promise<ActionState<null>> {
  try {
    const user = await getCurrentUser()
    await bulkDeleteTransactions(ids, user.id)
    revalidatePath("/invoices")
    revalidatePath("/expenses")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (error) {
    console.error("Failed to bulk delete transactions:", error)
    return { success: false, error: `Failed to bulk delete transactions: ${error}` }
  }
}

export async function uploadTransactionFilesAction(formData: FormData): Promise<ActionState<null>> {
  try {
    const user = await getCurrentUser()
    const transactionId = formData.get("transactionId") as string
    const files = formData.getAll("files") as File[]

    const transaction = await getTransactionById(transactionId, user.id)
    if (!transaction) {
      return { success: false, error: "Transaction not found" }
    }

    const userUploadsDirectory = getUserUploadsDirectory(user)

    const totalFileSize = files.reduce((acc, file) => acc + file.size, 0)
    if (!isEnoughStorageToUploadFile(user, totalFileSize)) {
      return { success: false, error: "Insufficient storage to upload these files" }
    }

    const existingFileIds = Array.isArray(transaction.files) ? (transaction.files as string[]) : []

    const newFileIds = await Promise.all(
      files.map(async (file) => {
        if (!(file instanceof File)) return null

        const fileUuid = randomUUID()
        const relativeFilePath = getTransactionFileUploadPath(fileUuid, file.name, transaction)
        const fullFilePath = safePathJoin(userUploadsDirectory, relativeFilePath)
        await mkdir(path.dirname(fullFilePath), { recursive: true })

        const arrayBuffer = await file.arrayBuffer()
        await writeFile(fullFilePath, Buffer.from(arrayBuffer))

        const fileRecord = await createFile(user.id, {
          id: fileUuid,
          filename: file.name,
          path: relativeFilePath,
          mimetype: file.type,
          isReviewed: true,
          metadata: { size: file.size, lastModified: file.lastModified },
        })

        return fileRecord.id
      })
    )

    const validNewFileIds = newFileIds.filter(Boolean) as string[]
    await updateTransactionFiles(transactionId, user.id, [...existingFileIds, ...validNewFileIds])

    const storageUsed = await getDirectorySize(userUploadsDirectory)
    await updateUser(user.id, { storageUsed })

    revalidatePath("/invoices")
    revalidatePath("/expenses")
    return { success: true }
  } catch (error) {
    console.error("Failed to upload transaction files:", error)
    return { success: false, error: `Failed to upload files: ${error}` }
  }
}

export async function deleteTransactionFileAction(transactionId: string, fileId: string): Promise<ActionState<null>> {
  try {
    const user = await getCurrentUser()
    const transaction = await getTransactionById(transactionId, user.id)
    if (!transaction) {
      return { success: false, error: "Transaction not found" }
    }

    const existingFileIds = Array.isArray(transaction.files) ? (transaction.files as string[]) : []
    const updatedFileIds = existingFileIds.filter((id) => id !== fileId)
    await updateTransactionFiles(transactionId, user.id, updatedFileIds)

    // Delete file record if no other transactions reference it
    await deleteFile(fileId, user.id)

    revalidatePath("/invoices")
    revalidatePath("/expenses")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete transaction file:", error)
    return { success: false, error: `Failed to delete file: ${error}` }
  }
}

export async function updateFieldVisibilityAction(fieldCode: string, isVisible: boolean): Promise<ActionState<null>> {
  try {
    const user = await getCurrentUser()
    await updateField(user.id, fieldCode, { isVisibleInList: isVisible })
    revalidatePath("/invoices")
    revalidatePath("/expenses")
    return { success: true }
  } catch (error) {
    console.error("Failed to update field visibility:", error)
    return { success: false, error: `Failed to update field visibility: ${error}` }
  }
}
