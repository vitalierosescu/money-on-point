import path from "path"
import slugify from "slugify"

const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g

function getDateParts(value: Date | string | null | undefined) {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    }
  }

  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) return null

  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/)
  if (isoDateMatch) {
    return {
      year: Number.parseInt(isoDateMatch[1] ?? "", 10),
      month: Number.parseInt(isoDateMatch[2] ?? "", 10),
      day: Number.parseInt(isoDateMatch[3] ?? "", 10),
    }
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null

  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  }
}

export function normalizeMerchantForFilename(merchant: string) {
  const slug = slugify(merchant, {
    replacement: "-",
    lower: true,
    strict: true,
    trim: true,
  })

  return slug || null
}

export function buildDocumentFilename({
  issuedAt,
  merchant,
  originalFilename,
}: {
  issuedAt: Date | string | null | undefined
  merchant: string | null | undefined
  originalFilename: string
}) {
  const date = getDateParts(issuedAt)
  if (!date || typeof merchant !== "string") return null

  const normalizedMerchant = normalizeMerchantForFilename(merchant)
  if (!normalizedMerchant) return null

  const extension = path.extname(path.basename(originalFilename))
  const year = String(date.year).slice(-2)
  const month = String(date.month).padStart(2, "0")
  const day = String(date.day).padStart(2, "0")

  return `${year}-${month}-${day}_${normalizedMerchant}${extension}`
}

export function normalizeDocumentFilenameInput({
  name,
  originalFilename,
}: {
  name: string | null | undefined
  originalFilename: string
}) {
  if (typeof name !== "string") return null

  const trimmed = path.basename(name.trim())
  if (!trimmed) return null

  const parsed = path.parse(trimmed)
  const rawBase = (parsed.name || parsed.base).replace(INVALID_FILENAME_CHARACTERS, "-")
  const normalizedBase = rawBase.replace(/\s+/g, " ").trim().replace(/^[.\s]+|[.\s]+$/g, "")
  if (!normalizedBase) return null

  const extension = path.extname(path.basename(originalFilename))
  return `${normalizedBase}${extension}`
}
