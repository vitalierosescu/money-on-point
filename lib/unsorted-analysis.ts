import { AnalysisResult, analyzeTransaction } from "@/ai/analyze"
import { AnalyzeAttachment, loadAttachmentsForAI } from "@/ai/attachments"
import { buildLLMPrompt } from "@/ai/prompt"
import { fieldsToJsonSchema } from "@/ai/schema"
import { DEFAULT_PROMPT_ANALYSE_NEW_FILE } from "@/models/defaults"
import { getFields } from "@/models/fields"
import { getFileById, updateFile } from "@/models/files"
import { getCategories } from "@/models/categories"
import { getProjects } from "@/models/projects"
import { getSettings } from "@/models/settings"
import { createTransaction, type TransactionData, updateTransactionFiles } from "@/models/transactions"
import { updateUser } from "@/models/users"
import { isAiBalanceExhausted, isSubscriptionExpired } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { buildDocumentFilename, normalizeDocumentFilenameInput } from "@/lib/document-filenames"
import {
  ensureUniqueRelativeFilePath,
  getNamedTransactionFileUploadPath,
  getUserUploadsDirectory,
  safePathJoin,
} from "@/lib/files"
import type { ActionState } from "@/lib/actions"
import type { File, Transaction, User } from "@/prisma/client"
import { mkdir, rename } from "fs/promises"
import { revalidatePath, revalidateTag } from "next/cache"
import path from "path"

export type BulkAnalyzeFileResult = {
  output: Record<string, unknown>
  tokensUsed: number
  autoSaved: boolean
  transactionId?: string
}

type PersistOptions = {
  revalidate?: boolean
}

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

async function getUserOrThrow(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw new Error("User not found")
  }
  return user
}

async function matchExistingMerchant(userId: string, merchant: unknown): Promise<string | null> {
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

export async function listPendingUnsortedFilesForUser(userId: string): Promise<Array<{ id: string; filename: string }>> {
  const files = await prisma.file.findMany({
    where: {
      userId,
      isReviewed: false,
      isSplitted: false,
    },
    select: {
      id: true,
      filename: true,
      cachedParseResult: true,
    },
    orderBy: { createdAt: "desc" },
  })

  return files
    .filter((file) => file.cachedParseResult === null || file.cachedParseResult === undefined)
    .map((file) => ({ id: file.id, filename: file.filename }))
}

export async function runUnsortedFileAnalysisForUser(
  userId: string,
  file: File
): Promise<ActionState<AnalysisResult>> {
  const user = await getUserOrThrow(userId)

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

  const [settings, fields, categories, projects] = await Promise.all([
    getSettings(user.id),
    getFields(user.id),
    getCategories(user.id),
    getProjects(user.id),
  ])

  const prompt = buildLLMPrompt(
    settings.prompt_analyse_new_file || DEFAULT_PROMPT_ANALYSE_NEW_FILE,
    fields,
    categories,
    projects
  )
  const schema = fieldsToJsonSchema(fields)
  const results = await analyzeTransaction(prompt, schema, attachments, file.id, user.id)

  if (results.data?.tokensUsed && results.data.tokensUsed > 0) {
    await updateUser(user.id, { aiBalance: { decrement: 1 } })
    revalidateTag(`user:${user.id}`)
  }

  return results
}

async function persistFileAsTransactionInternal(
  user: User,
  file: File,
  data: TransactionData,
  options: PersistOptions = {}
): Promise<{ success: true; transaction: Transaction } | { success: false; error: string }> {
  try {
    const generatedDocumentFilename = buildDocumentFilename({
      issuedAt: data.issuedAt,
      merchant: typeof data.merchant === "string" ? data.merchant : null,
      originalFilename: file.filename,
    })
    const originalDocumentFilename =
      normalizeDocumentFilenameInput({
        name: file.filename,
        originalFilename: file.filename,
      }) ?? file.filename
    const providedDocumentFilename = normalizeDocumentFilenameInput({
      name: typeof data.name === "string" ? data.name : null,
      originalFilename: file.filename,
    })
    const resolvedDocumentFilename =
      generatedDocumentFilename && providedDocumentFilename === originalDocumentFilename
        ? generatedDocumentFilename
        : providedDocumentFilename ?? generatedDocumentFilename ?? file.filename

    const transactionData: TransactionData = {
      ...data,
      name: resolvedDocumentFilename,
      ...((!data.type || data.type === "expense") ? { status: "unpaid" } : {}),
    }

    const transaction = await createTransaction(user.id, transactionData)
    const userUploadsDirectory = getUserUploadsDirectory(user)
    const requestedRelativeFilePath = getNamedTransactionFileUploadPath(
      resolvedDocumentFilename,
      transaction
    )
    const newRelativeFilePath = await ensureUniqueRelativeFilePath(
      userUploadsDirectory,
      requestedRelativeFilePath
    )

    const oldFullFilePath = safePathJoin(userUploadsDirectory, file.path)
    const newFullFilePath = safePathJoin(userUploadsDirectory, newRelativeFilePath)
    await mkdir(path.dirname(newFullFilePath), { recursive: true })
    await rename(path.resolve(oldFullFilePath), path.resolve(newFullFilePath))

    await updateFile(file.id, user.id, {
      filename: path.basename(newRelativeFilePath),
      path: newRelativeFilePath,
      isReviewed: true,
    })

    await updateTransactionFiles(transaction.id, user.id, [file.id])

    if (options.revalidate !== false) {
      revalidateTag(`unsorted:${user.id}`)
      revalidatePath("/unsorted")
      revalidatePath("/expenses")
    }

    return { success: true, transaction }
  } catch (error) {
    console.error("Failed to persist file as transaction:", error)
    return { success: false, error: `Failed to save transaction: ${error}` }
  }
}

export async function persistFileAsTransactionForUser(
  userId: string,
  fileId: string,
  data: TransactionData,
  options: PersistOptions = {}
): Promise<{ success: true; transaction: Transaction } | { success: false; error: string }> {
  const [user, file] = await Promise.all([getUserOrThrow(userId), getFileById(fileId, userId)])

  if (!file) {
    return { success: false, error: "File not found" }
  }

  return persistFileAsTransactionInternal(user, file, data, options)
}

export async function analyzeUnsortedFileForUser(
  userId: string,
  fileId: string,
  options: PersistOptions = {}
): Promise<ActionState<BulkAnalyzeFileResult>> {
  try {
    const file = await getFileById(fileId, userId)
    if (!file) return { success: false, error: "File not found" }

    let analyzeOutput: Record<string, unknown> | null = null
    let tokensUsed = 0

    if (file.cachedParseResult && typeof file.cachedParseResult === "object") {
      analyzeOutput = file.cachedParseResult as Record<string, unknown>
    } else {
      const analyzeResult = await runUnsortedFileAnalysisForUser(userId, file)
      if (!analyzeResult.success) {
        return { success: false, error: analyzeResult.error }
      }
      analyzeOutput = (analyzeResult.data?.output as Record<string, unknown>) ?? null
      tokensUsed = analyzeResult.data?.tokensUsed ?? 0
    }

    if (!analyzeOutput) {
      return { success: false, error: "AI analysis returned no output" }
    }

    const currencies = await prisma.currency.findMany({
      where: { OR: [{ userId }, { userId: null }] },
      select: { code: true },
    })

    const totalDecimal = parseAmountFromCache(analyzeOutput.total)
    const issuedAt = parseDateFromCache(analyzeOutput.issuedAt)
    const typeOk = isValidType(analyzeOutput.type)
    const currencyOk = isValidCurrency(analyzeOutput.currencyCode, currencies)

    const requiredOk =
      totalDecimal !== null && totalDecimal > 0 && issuedAt !== null && typeOk && currencyOk

    if (!requiredOk) {
      return {
        success: true,
        data: {
          output: analyzeOutput,
          tokensUsed,
          autoSaved: false,
        },
      }
    }

    const canonicalMerchant = await matchExistingMerchant(userId, analyzeOutput.merchant)
    const freshFile = await getFileById(fileId, userId)
    if (!freshFile) return { success: false, error: "File not found after analysis" }

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

    const persisted = await persistFileAsTransactionForUser(userId, fileId, transactionData, options)
    if (!persisted.success) {
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
