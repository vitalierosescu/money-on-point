import { prisma } from "@/lib/db"
import type { SettingsMap } from "@/models/settings"

const ARCHIE_BASE_URL = "https://api.archieapp.co/v1"
const TOKEN_APP_KEY = "archie_token"
const TOKEN_EXPIRY_BUFFER_MS = 60_000

type ArchieTokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
}

type ArchieTokenCache = {
  accessToken: string
  expiresAt: string
}

type ArchieInvoicePage<T> = {
  data: T[]
  has_more?: boolean
  next_token?: string
}

export type ArchieInvoiceRest = Record<string, unknown>

async function getTokenCache(userId: string): Promise<ArchieTokenCache | null> {
  const record = await prisma.appData.findUnique({
    where: { userId_app: { userId, app: TOKEN_APP_KEY } },
  })

  if (!record?.data || typeof record.data !== "object") return null
  const data = record.data as { accessToken?: string; expiresAt?: string }
  if (!data.accessToken || !data.expiresAt) return null
  return { accessToken: data.accessToken, expiresAt: data.expiresAt }
}

async function setTokenCache(userId: string, cache: ArchieTokenCache) {
  await prisma.appData.upsert({
    where: { userId_app: { userId, app: TOKEN_APP_KEY } },
    update: { data: cache },
    create: { userId, app: TOKEN_APP_KEY, data: cache },
  })
}

function isTokenValid(cache: ArchieTokenCache | null): boolean {
  if (!cache) return false
  const expiresAt = new Date(cache.expiresAt).getTime()
  return Number.isFinite(expiresAt) && expiresAt - TOKEN_EXPIRY_BUFFER_MS > Date.now()
}

export async function getAccessToken(userId: string, settings: SettingsMap): Promise<string> {
  const cached = await getTokenCache(userId)
  if (isTokenValid(cached)) {
    return cached!.accessToken
  }

  const clientId = settings.archie_client_id?.trim()
  const clientSecret = settings.archie_client_secret?.trim()
  if (!clientId || !clientSecret) {
    throw new Error("Archie client credentials are missing.")
  }

  const response = await fetch(`${ARCHIE_BASE_URL}/authenticate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Archie authentication failed (${response.status}). ${details}`)
  }

  const payload = (await response.json()) as ArchieTokenResponse
  const expiresAt = new Date(Date.now() + payload.expires_in * 1000).toISOString()
  const cache = { accessToken: payload.access_token, expiresAt }
  await setTokenCache(userId, cache)
  return payload.access_token
}

async function fetchArchie<T>(
  userId: string,
  settings: SettingsMap,
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = await getAccessToken(userId, settings)
  const response = await fetch(`${ARCHIE_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Archie API error (${response.status}). ${details}`)
  }

  return (await response.json()) as T
}

export async function listGroupInvoices(
  userId: string,
  settings: SettingsMap,
  spaceDomain: string,
  groupUuid: string
): Promise<ArchieInvoiceRest[]> {
  const invoices: ArchieInvoiceRest[] = []
  let nextToken: string | undefined

  do {
    const params = new URLSearchParams()
    params.set("limit", "100")
    params.append("status[]", "open")
    if (nextToken) params.set("startAfter", nextToken)

    const page = await fetchArchie<ArchieInvoicePage<ArchieInvoiceRest>>(
      userId,
      settings,
      `/spaces/${encodeURIComponent(spaceDomain)}/groups/${encodeURIComponent(groupUuid)}/invoices?${params.toString()}`
    )

    invoices.push(...(page.data ?? []))
    nextToken = page.has_more ? page.next_token : undefined
  } while (nextToken)

  return invoices
}
