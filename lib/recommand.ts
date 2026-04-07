import { ensurePeppolAddress } from "@/lib/invoice-delivery"
import { getResolvedRecommandCredentials } from "@/lib/recommand-settings"
import type { SettingsMap } from "@/models/settings"

const RECOMMAND_BASE_URL = "https://app.recommand.eu/api/v1"

type RecommandCredentials = {
  environment: "playground" | "production"
  teamId?: string
  companyId: string
  apiKey: string
  apiSecret: string
  usesLegacyKeys: boolean
}

export type RecommandVerificationResult = {
  isValid: boolean
  message?: string
}

export type RecommandSendResult = {
  success: boolean
  id?: string
  errors?: Record<string, string[]>
  sentOverPeppol?: boolean
  sentOverEmail?: boolean
}

function flattenResponseErrors(body: unknown): string | null {
  if (!body || typeof body !== "object") return null

  const value = body as { errors?: Record<string, string[] | string> }
  if (!value.errors || typeof value.errors !== "object") return null

  return Object.entries(value.errors)
    .flatMap(([field, messages]) => {
      if (Array.isArray(messages)) {
        return messages.map((message) => `${field}: ${message}`)
      }
      if (typeof messages === "string") {
        return [`${field}: ${messages}`]
      }
      return []
    })
    .join(" ")
}

function getCredentials(settings: SettingsMap): RecommandCredentials {
  return getResolvedRecommandCredentials(settings)
}

function getAuthorizationHeader(settings: SettingsMap): string {
  const { apiKey, apiSecret } = getCredentials(settings)
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  const body = text ? (JSON.parse(text) as T) : ({} as T)

  if (!response.ok) {
    const details = flattenResponseErrors(body)
    throw new Error(
      details
        ? `Recommand request failed with status ${response.status}. ${details}`
        : `Recommand request failed with status ${response.status}`
    )
  }

  return body
}

export async function verifyPeppolRecipient(
  settings: SettingsMap,
  peppolId: string,
  country?: string | null
): Promise<RecommandVerificationResult> {
  const peppolAddress = ensurePeppolAddress(peppolId, country)
  if (!peppolAddress) {
    throw new Error("PEPPOL recipient is missing.")
  }

  const response = await fetch(`${RECOMMAND_BASE_URL}/verify`, {
    method: "POST",
    headers: {
      Authorization: getAuthorizationHeader(settings),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ peppolAddress }),
  })

  return parseResponse<RecommandVerificationResult>(response)
}

export async function sendInvoiceViaRecommand(
  settings: SettingsMap,
  recipientPeppolId: string,
  country: string | null | undefined,
  document: unknown
): Promise<RecommandSendResult> {
  const peppolAddress = ensurePeppolAddress(recipientPeppolId, country)
  if (!peppolAddress) {
    throw new Error("PEPPOL recipient is missing.")
  }

  const { companyId } = getCredentials(settings)
  const response = await fetch(`${RECOMMAND_BASE_URL}/${companyId}/send`, {
    method: "POST",
    headers: {
      Authorization: getAuthorizationHeader(settings),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: peppolAddress,
      documentType: "invoice",
      document,
    }),
  })

  return parseResponse<RecommandSendResult>(response)
}
