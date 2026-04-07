"use server"

import { AnalysisResult, analyzeTransaction } from "@/ai/analyze"
import { AnalyzeAttachment, loadAttachmentsForAI } from "@/ai/attachments"
import { buildLLMPrompt } from "@/ai/prompt"
import { fieldsToJsonSchema } from "@/ai/schema"
import { transactionFormSchema } from "@/forms/transactions"
import { ActionState } from "@/lib/actions"
import { getCurrentUser, isAiBalanceExhausted, isSubscriptionExpired } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
  getDirectorySize,
  getTransactionFileUploadPath,
  getUserUploadsDirectory,
  safePathJoin,
  unsortedFilePath,
} from "@/lib/files"
import { getCategories } from "@/models/categories"
import { DEFAULT_PROMPT_ANALYSE_NEW_FILE } from "@/models/defaults"
import { getFields } from "@/models/fields"
import { createFile, deleteFile, getFileById, updateFile } from "@/models/files"
import { getProjects } from "@/models/projects"
import { getSettings } from "@/models/settings"
import { createTransaction, TransactionData, updateTransactionFiles } from "@/models/transactions"
import { updateUser } from "@/models/users"
import { Category, Field, File, Prisma, Project, Transaction, User } from "@/prisma/client"
import { randomUUID } from "crypto"
import { mkdir, readFile, rename, writeFile } from "fs/promises"
import { revalidatePath, revalidateTag } from "next/cache"
import path from "path"

export async function analyzeFileAction(
  file: File,
  settings: Record<string, string>,
  fields: Field[],
  categories: Category[],
  projects: Project[]
): Promise<ActionState<AnalysisResult>> {
  const user = await getCurrentUser()

  if (!file || file.userId !== user.id) {
    return { success: false, error: "File not found or does not belong to the user" }
  }

  if (isAiBalanceExhausted(user)) {
    return {
      success: false,
      error: "You used all of your pre-paid AI scans, please upgrade your account or buy new subscription plan",
    }
  }

  if (isSubscriptionExpired(user)) {
    return {
      success: false,
      error: "Your subscription has expired, please upgrade your account or buy new subscription plan",
    }
  }

  let attachments: AnalyzeAttachment[] = []
  try {
    attachments = await loadAttachmentsForAI(user, file)
  } catch (error) {
    console.error("Failed to retrieve files:", error)
    return { success: false, error: "Failed to retrieve files: " + error }
  }

  const prompt = buildLLMPrompt(
    settings.prompt_analyse_new_file || DEFAULT_PROMPT_ANALYSE_NEW_FILE,
    fields,
    categories,
    projects
  )

  const schema = fieldsToJsonSchema(fields)

  const results = await analyzeTransaction(prompt, schema, attachments, file.id, user.id)

  console.log("Analysis results:", results)

  if (results.data?.tokensUsed && results.data.tokensUsed > 0) {
    await updateUser(user.id, { aiBalance: { decrement: 1 } })
    revalidateTag(`user:${user.id}`)
  }

  return results
}

export async function listUnanalyzedUnsortedFileIdsAction(): Promise<
  { success: true; ids: string[] } | { success: false; error: string }
> {
  try {
    const user = await getCurrentUser()
    // Fetch all unsorted files (same query as the unsorted page uses), then
    // filter out the ones that already have a cached AI analysis in JS. This
    // sidesteps Prisma's finicky JSON-null filter semantics (equals: DbNull /
    // JsonNull / AnyNull) which silently returned zero rows in practice.
    const files = await prisma.file.findMany({
      where: {
        userId: user.id,
        isReviewed: false,
        isSplitted: false,
      },
      select: { id: true, cachedParseResult: true },
      orderBy: { createdAt: "desc" },
    })
    const ids = files
      .filter((f) => f.cachedParseResult === null || f.cachedParseResult === undefined)
      .map((f) => f.id)
    return { success: true, ids }
  } catch (error) {
    console.error("Failed to list unanalyzed unsorted files:", error)
    return { success: false, error: "Failed to list unanalyzed files" }
  }
}

// ---- Helpers used by the bulk analyze auto-save path ----------------------

const VALID_TRANSACTION_TYPES = new Set(["expense", "income", "pending", "other"])

function parseAmountFromCache(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number.parseFloat(trimmed.replace(",", "."))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseDateFromCache(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00` : trimmed
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function isValidType(value: unknown): value is string {
  return typeof value === "string" && VALID_TRANSACTION_TYPES.has(value.trim().toLowerCase())
}

function isValidCurrency(code: unknown, currencies: { code: string }[]): boolean {
  if (typeof code !== "string") return false
  const upper = code.trim().toUpperCase()
  if (!upper) return false
  return currencies.some((c) => c.code.toUpperCase() === upper)
}

/**
 * Look up an existing canonical merchant casing for the given user. If the
 * AI returned "engie" but the user already has "ENGIE" on past transactions,
 * we want the auto-saved transaction to use "ENGIE" so the merchant column
 * stays consistent and autocomplete dedup keeps working.
 */
async function matchExistingMerchant(
  userId: string,
  merchant: unknown
): Promise<string | null> {
  if (typeof merchant !== "string") return null
  const trimmed = merchant.trim()
  if (!trimmed) return null

  const existing = await prisma.transaction.findFirst({
    where: {
      userId,
      merchant: { equals: trimmed, mode: "insensitive" },
    },
    select: { merchant: true },
    orderBy: { issuedAt: "desc" },
  })
  return existing?.merchant ?? trimmed
}

export type BulkAnalyzeFileResult = {
  output: Record<string, unknown>
  tokensUsed: number
  autoSaved: boolean
  transactionId?: string
}

export async function analyzeFileByIdAction(
  fileId: string
): Promise<ActionState<BulkAnalyzeFileResult>> {
  try {
    const user = await getCurrentUser()
    const file = await getFileById(fileId, user.id)
    if (!file) return { success: false, error: "File not found" }

    // Defensive: if cache slipped in between list and analyze, skip without charging.
    // We still attempt auto-save below in case the cache is from a previous run that
    // never saved.
    let analyzeOutput: Record<string, unknown> | null = null
    let tokensUsed = 0

    if (file.cachedParseResult && typeof file.cachedParseResult === "object") {
      analyzeOutput = file.cachedParseResult as Record<string, unknown>
    } else {
      const [settings, fields, categories, projects] = await Promise.all([
        getSettings(user.id),
        getFields(user.id),
        getCategories(user.id),
        getProjects(user.id),
      ])

      const analyzeResult = await analyzeFileAction(file, settings, fields, categories, projects)
      if (!analyzeResult.success) {
        return { success: false, error: analyzeResult.error }
      }
      analyzeOutput = (analyzeResult.data?.output as Record<string, unknown>) ?? null
      tokensUsed = analyzeResult.data?.tokensUsed ?? 0
    }

    if (!analyzeOutput) {
      return { success: false, error: "AI analysis returned no output" }
    }

    // Decide whether the result is high-confidence enough to auto-save.
    const currencies = await prisma.currency.findMany({
      where: { OR: [{ userId: user.id }, { userId: null }] },
      select: { code: true },
    })

    const totalDecimal = parseAmountFromCache(analyzeOutput.total)
    const issuedAt = parseDateFromCache(analyzeOutput.issuedAt)
    const typeOk = isValidType(analyzeOutput.type)
    const currencyOk = isValidCurrency(analyzeOutput.currencyCode, currencies)

    const requiredOk =
      totalDecimal !== null && totalDecimal > 0 && issuedAt !== null && typeOk && currencyOk

    if (!requiredOk) {
      // Cached result stays in DB for the manual review pass; just report not auto-saved.
      return {
        success: true,
        data: {
          output: analyzeOutput,
          tokensUsed,
          autoSaved: false,
        },
      }
    }

    // Match merchant against existing list (canonical casing)
    const canonicalMerchant = await matchExistingMerchant(user.id, analyzeOutput.merchant)

    // Reload the file because analyzeFileAction may have updated the cachedParseResult
    // path field. We need the most recent file.path for the rename in persistFileAsTransaction.
    const freshFile = await getFileById(fileId, user.id)
    if (!freshFile) return { success: false, error: "File not found after analysis" }

    // Build transaction data shape that createTransaction expects.
    // total stored as cents (Int).
    const transactionData: TransactionData = {
      name: typeof analyzeOutput.name === "string" ? analyzeOutput.name : freshFile.filename,
      merchant: canonicalMerchant,
      description:
        typeof analyzeOutput.description === "string" ? analyzeOutput.description : null,
      total: Math.round(totalDecimal * 100),
      currencyCode: (analyzeOutput.currencyCode as string).trim().toUpperCase(),
      type: (analyzeOutput.type as string).trim().toLowerCase(),
      issuedAt,
      categoryCode:
        typeof analyzeOutput.categoryCode === "string" ? analyzeOutput.categoryCode : null,
      projectCode:
        typeof analyzeOutput.projectCode === "string" ? analyzeOutput.projectCode : null,
      note: typeof analyzeOutput.note === "string" ? analyzeOutput.note : null,
      text: typeof analyzeOutput.text === "string" ? analyzeOutput.text : null,
      items: Array.isArray(analyzeOutput.items) ? (analyzeOutput.items as TransactionData[]) : [],
    }

    const persisted = await persistFileAsTransaction(user, freshFile, transactionData)
    if (!persisted.success) {
      // Auto-save failed but the analysis itself succeeded — fall back to needs-review
      // so the user can fix it manually rather than losing the cached result.
      console.error("Auto-save failed, falling back to needs-review:", persisted.error)
      return {
        success: true,
        data: {
          output: analyzeOutput,
          tokensUsed,
          autoSaved: false,
        },
      }
    }

    return {
      success: true,
      data: {
        output: analyzeOutput,
        tokensUsed,
        autoSaved: true,
        transactionId: persisted.transaction.id,
      },
    }
  } catch (error) {
    console.error("Failed to analyze file by id:", error)
    return { success: false, error: `Failed to analyze file: ${error}` }
  }
}

/**
 * Persist an unsorted file as a Transaction. Used by:
 *   - saveFileAsTransactionAction (manual save from the form)
 *   - analyzeFileByIdAction       (auto-save from the bulk loop)
 *
 * Side effects:
 *   - inserts a Transaction row
 *   - moves the file on disk from unsorted/UUID/... to transaction/{tx.id}/...
 *   - marks file.isReviewed = true and updates its path
 *   - links the file to the new transaction
 *   - revalidates the unsorted tag + /unsorted + /expenses
 */
async function persistFileAsTransaction(
  user: User,
  file: File,
  data: TransactionData
): Promise<{ success: true; transaction: Transaction } | { success: false; error: string }> {
  try {
    // Auto-set status for expenses; income stays null
    const transactionData: TransactionData = {
      ...data,
      ...((!data.type || data.type === "expense") ? { status: "unpaid" } : {}),
    }
    const transaction = await createTransaction(user.id, transactionData)

    // Move file to processed location
    const userUploadsDirectory = getUserUploadsDirectory(user)
    const originalFileName = path.basename(file.path)
    const newRelativeFilePath = getTransactionFileUploadPath(file.id, originalFileName, transaction)

    const oldFullFilePath = safePathJoin(userUploadsDirectory, file.path)
    const newFullFilePath = safePathJoin(userUploadsDirectory, newRelativeFilePath)
    await mkdir(path.dirname(newFullFilePath), { recursive: true })
    await rename(path.resolve(oldFullFilePath), path.resolve(newFullFilePath))

    await updateFile(file.id, user.id, {
      path: newRelativeFilePath,
      isReviewed: true,
    })

    await updateTransactionFiles(transaction.id, user.id, [file.id])

    revalidateTag(`unsorted:${user.id}`)
    revalidatePath("/unsorted")
    revalidatePath("/expenses")

    return { success: true, transaction }
  } catch (error) {
    console.error("Failed to persist file as transaction:", error)
    return { success: false, error: `Failed to save transaction: ${error}` }
  }
}

export async function saveFileAsTransactionAction(
  _prevState: ActionState<Transaction> | null,
  formData: FormData
): Promise<ActionState<Transaction>> {
  try {
    const user = await getCurrentUser()
    const validatedForm = transactionFormSchema.safeParse(Object.fromEntries(formData.entries()))

    if (!validatedForm.success) {
      return { success: false, error: validatedForm.error.message }
    }

    const fileId = formData.get("fileId") as string
    const file = await getFileById(fileId, user.id)
    if (!file) throw new Error("File not found")

    const persisted = await persistFileAsTransaction(user, file, validatedForm.data)
    if (!persisted.success) {
      return { success: false, error: persisted.error }
    }

    return { success: true, data: persisted.transaction }
  } catch (error) {
    console.error("Failed to save transaction:", error)
    return { success: false, error: `Failed to save transaction: ${error}` }
  }
}

export async function deleteUnsortedFileAction(
  _prevState: ActionState<Transaction> | null,
  fileId: string
): Promise<ActionState<Transaction>> {
  try {
    const user = await getCurrentUser()
    await deleteFile(fileId, user.id)
    revalidateTag(`unsorted:${user.id}`)
    revalidatePath("/unsorted")
    return { success: true }
  } catch (error) {
    console.error("Failed to delete file:", error)
    return { success: false, error: "Failed to delete file" }
  }
}

export async function splitFileIntoItemsAction(
  _prevState: ActionState<null> | null,
  formData: FormData
): Promise<ActionState<null>> {
  try {
    const user = await getCurrentUser()
    const fileId = formData.get("fileId") as string
    const items = JSON.parse(formData.get("items") as string) as TransactionData[]

    if (!fileId || !items || items.length === 0) {
      return { success: false, error: "File ID and items are required" }
    }

    // Get the original file
    const originalFile = await getFileById(fileId, user.id)
    if (!originalFile) {
      return { success: false, error: "Original file not found" }
    }

    // Get the original file's content
    const userUploadsDirectory = getUserUploadsDirectory(user)
    const originalFilePath = safePathJoin(userUploadsDirectory, originalFile.path)
    const fileContent = await readFile(originalFilePath)

    // Create a new file for each item
    for (const item of items) {
      const fileUuid = randomUUID()
      const fileName = `${originalFile.filename}-part-${item.name}`
      const relativeFilePath = unsortedFilePath(fileUuid, fileName)
      const fullFilePath = safePathJoin(userUploadsDirectory, relativeFilePath)

      // Create directory if it doesn't exist
      await mkdir(path.dirname(fullFilePath), { recursive: true })

      // Copy the original file content
      await writeFile(fullFilePath, fileContent)

      // Create file record in database with the item data cached
      await createFile(user.id, {
        id: fileUuid,
        filename: fileName,
        path: relativeFilePath,
        mimetype: originalFile.mimetype,
        metadata: originalFile.metadata ?? undefined,
        isSplitted: true,
        cachedParseResult: {
          name: item.name,
          merchant: item.merchant,
          description: item.description,
          total: item.total,
          currencyCode: item.currencyCode,
          categoryCode: item.categoryCode,
          projectCode: item.projectCode,
          type: item.type,
          issuedAt: item.issuedAt,
          note: item.note,
          text: item.text,
        },
      })
    }

    // Delete the original file
    await deleteFile(fileId, user.id)

    // Update user storage used
    const storageUsed = await getDirectorySize(getUserUploadsDirectory(user))
    await updateUser(user.id, { storageUsed })

    revalidateTag(`unsorted:${user.id}`)
    revalidateTag(`user:${user.id}`)
    revalidatePath("/unsorted")
    return { success: true }
  } catch (error) {
    console.error("Failed to split file into items:", error)
    return { success: false, error: `Failed to split file into items: ${error}` }
  }
}
