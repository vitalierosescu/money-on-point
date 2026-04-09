"use server"

import { ActionState } from "@/lib/actions"
import { getCurrentUser, isSubscriptionExpired } from "@/lib/auth"
import {
  getDirectorySize,
  getUserUploadsDirectory,
  isEnoughStorageToUploadFile,
  safePathJoin,
  unsortedFilePath,
} from "@/lib/files"
import { prisma } from "@/lib/db"
import { createFile, updateFile } from "@/models/files"
import { getLLMSettings, getSettings } from "@/models/settings"
import { updateUser } from "@/models/users"
import { Customer } from "@/prisma/client"
import { randomUUID } from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { loadAttachmentsForAI } from "./attachments"
import { INVOICE_EXTRACTION_PROMPT } from "./invoice-prompt"
import { INVOICE_EXTRACTION_SCHEMA, type ExtractedInvoice } from "./invoice-extraction-schema"
import { requestLLM } from "./providers/llmProvider"

export type InvoiceExtractionResult = {
  fileId: string
  /** Path of the uploaded PDF relative to the user's uploads directory.
   *  Used later to set `Invoice.pdfPath` when the user saves, so the
   *  original PDF becomes the invoice's permanent attachment. */
  filePath: string
  extracted: ExtractedInvoice
  matchedCustomers: Customer[]
  /** Data-URL base64 preview images of the uploaded PDF (one per page,
   *  up to the MAX_PAGES_TO_ANALYZE cap in `ai/attachments.ts`). The
   *  client renders these in the live preview pane instead of the
   *  reconstructed `<InvoicePreview>` so users see exactly the document
   *  they imported. */
  previewDataUrls: string[]
  tokensUsed: number
}

/**
 * Accepts a single PDF upload, runs it through the shared AI pipeline
 * (`loadAttachmentsForAI` → `requestLLM`) with an invoice-specific schema
 * and prompt, and returns the structured result plus any Customer rows
 * that look like a plausible match for the extracted recipient.
 *
 * Bypasses `app/(app)/files/actions.ts:uploadFilesAction` because that
 * returns `ActionState<null>` and doesn't give us back the File record.
 * Storage/limit checks mirror the same logic so behavior stays consistent.
 *
 * Caches the parsed result on `File.cachedParseResult` (same convention
 * as `analyzeTransaction` in `ai/analyze.ts`) so re-extracts don't re-burn
 * LLM tokens if the user drops the same file twice.
 */
export async function extractInvoiceFromPdfAction(
  formData: FormData
): Promise<ActionState<InvoiceExtractionResult>> {
  try {
    const user = await getCurrentUser()

    if (isSubscriptionExpired(user)) {
      return {
        success: false,
        error: "Your subscription has expired, please upgrade your account or buy a new subscription plan",
      }
    }

    const file = formData.get("file") as File | null
    if (!file) {
      return { success: false, error: "No file uploaded" }
    }

    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return { success: false, error: "Only PDF files are supported" }
    }

    if (!isEnoughStorageToUploadFile(user, file.size)) {
      return { success: false, error: "Insufficient storage to upload this file" }
    }

    // Persist the PDF to the unsorted directory (same convention as
    // `uploadFilesAction`) and create a File record so the AI pipeline
    // can find it on disk via `fullPathForFile`.
    const fileUuid = randomUUID()
    const relativeFilePath = unsortedFilePath(fileUuid, file.name)
    const buffer = Buffer.from(await file.arrayBuffer())

    const userUploadsDirectory = getUserUploadsDirectory(user)
    const fullFilePath = safePathJoin(userUploadsDirectory, relativeFilePath)
    await mkdir(path.dirname(fullFilePath), { recursive: true })
    await writeFile(fullFilePath, buffer)

    const fileRecord = await createFile(user.id, {
      id: fileUuid,
      filename: file.name,
      path: relativeFilePath,
      mimetype: file.type || "application/pdf",
      metadata: {
        size: file.size,
        lastModified: file.lastModified,
      },
    })

    // Update the user's reported storage usage, matching uploadFilesAction.
    const storageUsed = await getDirectorySize(userUploadsDirectory)
    await updateUser(user.id, { storageUsed })

    // Run LLM extraction
    const settings = await getSettings(user.id)
    const llmSettings = getLLMSettings(settings)

    // A provider is actually usable only when it has both a model name
    // and the credentials its transport needs (openai_compatible needs
    // baseUrl, everything else needs apiKey). This check mirrors the
    // skipping logic inside `requestLLM` so we fail fast with a clear
    // message instead of running the whole upload + preview pipeline.
    const usableProviders = llmSettings.providers.filter((p) => {
      if (!p.model) return false
      if (p.provider === "openai_compatible") return Boolean(p.baseUrl)
      return Boolean(p.apiKey)
    })

    if (usableProviders.length === 0) {
      return {
        success: false,
        error:
          "No LLM provider is usable. Open Settings → LLM and add an API key + model for at least one provider.",
      }
    }

    const attachments = await loadAttachmentsForAI(user, fileRecord)

    // The same base64 preview images that get sent to the LLM are reused
    // by the client to show the uploaded PDF in the live preview pane.
    // Zero extra disk/CPU cost since they're already generated.
    const previewDataUrls = attachments.map(
      (attachment) => `data:${attachment.contentType};base64,${attachment.base64}`
    )

    const response = await requestLLM(llmSettings, {
      prompt: INVOICE_EXTRACTION_PROMPT,
      schema: INVOICE_EXTRACTION_SCHEMA,
      attachments,
    })

    if (response.error) {
      return { success: false, error: response.error }
    }

    // Defensive check, same as `ai/analyze.ts:46-56`. Langchain's
    // withStructuredOutput can silently return undefined/empty when the
    // model fails to produce a valid JSON match.
    const result = response.output as unknown as ExtractedInvoice | undefined | null
    const isUsable =
      result !== null &&
      result !== undefined &&
      typeof result === "object" &&
      Object.keys(result).length > 0
    if (!isUsable) {
      return {
        success: false,
        error: "AI returned no usable fields. The PDF may be unreadable or unsupported.",
      }
    }

    // Cache the parse result on the file so re-extracts are free
    await updateFile(fileRecord.id, user.id, {
      cachedParseResult: result as unknown as object,
    })

    // Find customer candidates that look like the extracted recipient.
    // We search by name / VAT / email and let the client present them.
    const matchedCustomers = await findMatchingCustomers(user.id, result)

    return {
      success: true,
      data: {
        fileId: fileRecord.id,
        filePath: fileRecord.path,
        extracted: result,
        matchedCustomers,
        previewDataUrls,
        tokensUsed: response.tokensUsed ?? 0,
      },
    }
  } catch (error) {
    console.error("Error extracting invoice from PDF:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to extract invoice from PDF",
    }
  }
}

/**
 * Find Customer rows that plausibly match the extracted recipient.
 * Uses case-insensitive contains for name and exact match for VAT / email.
 * Returns up to 5 candidates so the UI can present a short list.
 */
async function findMatchingCustomers(userId: string, extracted: ExtractedInvoice): Promise<Customer[]> {
  const name = extracted.customer.name?.trim()
  const vatNumber = extracted.customer.vatNumber?.trim()
  const email = extracted.customer.email?.trim()

  if (!name && !vatNumber && !email) return []

  const orClauses: Array<Record<string, unknown>> = []
  if (name) orClauses.push({ name: { contains: name, mode: "insensitive" } })
  if (vatNumber) orClauses.push({ vatNumber: { equals: vatNumber, mode: "insensitive" } })
  if (email) orClauses.push({ email: { equals: email, mode: "insensitive" } })

  return prisma.customer.findMany({
    where: {
      userId,
      archivedAt: null,
      OR: orClauses,
    },
    take: 5,
    orderBy: { name: "asc" },
  })
}
