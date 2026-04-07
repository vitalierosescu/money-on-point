import { normalizeCountryCode } from "@/lib/invoice-delivery"
import {
  getActiveRecommandEnvironment,
  getRecommandEnvironmentLabel,
  getResolvedRecommandCredentials,
  type RecommandEnvironment,
} from "@/lib/recommand-settings"
import type { SettingsMap } from "@/models/settings"
import type { User } from "@/prisma/client"

const RECOMMAND_BASE_URL = "https://app.recommand.eu/api/v1"

export type RecommandCompany = {
  id: string
  teamId?: string
  name: string
  address: string
  postalCode: string
  city: string
  country: string
  enterpriseNumberScheme?: string | null
  enterpriseNumber?: string | null
  vatNumber?: string | null
  email?: string | null
  phone?: string | null
  isSmpRecipient?: boolean
  isVerified?: boolean
  createdAt?: string
  updatedAt?: string
}

type RecommandCompanyBody = {
  name?: string
  address?: string
  postalCode?: string
  city?: string
  country?: string
  enterpriseNumberScheme?: string
  enterpriseNumber?: string
  vatNumber?: string
  email?: string
  phone?: string
}

export type DesiredRecommandCompanyProfile = {
  name: string
  address: string
  postalCode: string
  city: string
  country: string
  enterpriseNumberScheme?: string
  enterpriseNumber?: string
  vatNumber?: string
}

export type RecommandCompanySyncResult = {
  environment: RecommandEnvironment
  companyId: string
  action: "already_in_sync" | "updated" | "matched_existing" | "created"
  changedFields: string[]
  verificationTriggered: boolean
  verificationUrl?: string | null
  company: RecommandCompany
}

function normalizeOptional(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function getAuthorizationHeader(settings: SettingsMap, environment = getActiveRecommandEnvironment(settings)): string {
  const { apiKey, apiSecret } = getResolvedRecommandCredentials(settings, environment)
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  const body = text ? (JSON.parse(text) as T & { errors?: Record<string, string[] | string> }) : ({} as T)

  if (!response.ok) {
    const details =
      body && typeof body === "object" && "errors" in body && body.errors
        ? Object.entries(body.errors)
            .flatMap(([field, messages]) =>
              Array.isArray(messages) ? messages.map((message) => `${field}: ${message}`) : [`${field}: ${messages}`]
            )
            .join(" ")
        : ""
    throw new Error(
      details
        ? `Recommand request failed with status ${response.status}. ${details}`
        : `Recommand request failed with status ${response.status}`
    )
  }

  return body as T
}

async function recommandRequest<T>(
  settings: SettingsMap,
  path: string,
  init?: RequestInit,
  environment = getActiveRecommandEnvironment(settings)
): Promise<T> {
  const response = await fetch(`${RECOMMAND_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: getAuthorizationHeader(settings, environment),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  return parseResponse<T>(response)
}

export function buildDesiredRecommandCompanyProfile(user: User, settings: SettingsMap): DesiredRecommandCompanyProfile {
  const streetLine1 = normalizeOptional(settings.business_street_line1)
  const streetLine2 = normalizeOptional(settings.business_street_line2)

  return {
    name: normalizeOptional(user.businessName) || normalizeOptional(user.name) || "",
    address: [streetLine1, streetLine2].filter(Boolean).join(", "),
    postalCode: normalizeOptional(settings.business_postal_code) || "",
    city: normalizeOptional(settings.business_city) || "",
    country: normalizeCountryCode(settings.business_country_code),
    enterpriseNumberScheme: normalizeOptional(settings.business_enterprise_number) ? "0208" : undefined,
    enterpriseNumber: normalizeOptional(settings.business_enterprise_number),
    vatNumber: normalizeOptional(settings.business_vat_number),
  }
}

export function getDesiredRecommandCompanyProfileErrors(profile: DesiredRecommandCompanyProfile): string[] {
  const errors: string[] = []
  if (!profile.name) errors.push("Add your legal sender name first.")
  if (!profile.address) errors.push("Add your street line 1 before syncing Recommand.")
  if (!profile.postalCode) errors.push("Add your postal code before syncing Recommand.")
  if (!profile.city) errors.push("Add your city before syncing Recommand.")
  if (!profile.country) errors.push("Add your country code before syncing Recommand.")
  return errors
}

export async function listRecommandCompanies(
  settings: SettingsMap,
  environment = getActiveRecommandEnvironment(settings)
): Promise<RecommandCompany[]> {
  const result = await recommandRequest<{ success: boolean; companies: RecommandCompany[] }>(
    settings,
    "/companies",
    { method: "GET" },
    environment
  )
  return result.companies ?? []
}

export async function getRecommandCompany(
  settings: SettingsMap,
  companyId: string,
  environment = getActiveRecommandEnvironment(settings)
): Promise<RecommandCompany> {
  const result = await recommandRequest<{ success: boolean; company: RecommandCompany }>(
    settings,
    `/companies/${companyId}`,
    { method: "GET" },
    environment
  )
  return result.company
}

export async function createRecommandCompany(
  settings: SettingsMap,
  body: Pick<DesiredRecommandCompanyProfile, "name" | "address" | "postalCode" | "city" | "country">,
  environment = getActiveRecommandEnvironment(settings)
): Promise<RecommandCompany> {
  const result = await recommandRequest<{ success: boolean; company: RecommandCompany }>(
    settings,
    "/companies",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    environment
  )
  return result.company
}

export async function updateRecommandCompany(
  settings: SettingsMap,
  companyId: string,
  body: RecommandCompanyBody,
  environment = getActiveRecommandEnvironment(settings)
): Promise<RecommandCompany> {
  const result = await recommandRequest<{ success: boolean; company: RecommandCompany }>(
    settings,
    `/companies/${companyId}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
    environment
  )
  return result.company
}

export async function verifyRecommandCompany(
  settings: SettingsMap,
  companyId: string,
  environment = getActiveRecommandEnvironment(settings)
): Promise<{ verificationUrl: string | null }> {
  const result = await recommandRequest<{ success: boolean; verificationUrl?: string | null }>(
    settings,
    `/companies/${companyId}/verify`,
    { method: "POST" },
    environment
  )
  return { verificationUrl: result.verificationUrl ?? null }
}

function comparableValue(value?: string | null) {
  return normalizeOptional(value) || ""
}

function buildCompanyUpdatePayload(
  desired: DesiredRecommandCompanyProfile,
  current: RecommandCompany
): { changedFields: string[]; body: RecommandCompanyBody } {
  const body: RecommandCompanyBody = {}
  const changedFields: string[] = []

  const fields: Array<keyof DesiredRecommandCompanyProfile> = [
    "name",
    "address",
    "postalCode",
    "city",
    "country",
    "enterpriseNumberScheme",
    "enterpriseNumber",
    "vatNumber",
  ]

  for (const field of fields) {
    const desiredValue = comparableValue(desired[field])
    const currentValue = comparableValue(current[field as keyof RecommandCompany] as string | null | undefined)
    if (desiredValue !== currentValue) {
      body[field] = desired[field]
      changedFields.push(field)
    }
  }

  return { changedFields, body }
}

function findMatchingCompany(companies: RecommandCompany[], desired: DesiredRecommandCompanyProfile): RecommandCompany | null {
  return (
    companies.find(
      (company) =>
        comparableValue(company.name) === comparableValue(desired.name) &&
        comparableValue(company.address) === comparableValue(desired.address) &&
        comparableValue(company.postalCode) === comparableValue(desired.postalCode) &&
        comparableValue(company.city) === comparableValue(desired.city)
    ) ?? null
  )
}

export async function syncActiveRecommandCompanyProfile(
  user: User,
  settings: SettingsMap
): Promise<RecommandCompanySyncResult> {
  const environment = getActiveRecommandEnvironment(settings)
  const profile = buildDesiredRecommandCompanyProfile(user, settings)
  const validationErrors = getDesiredRecommandCompanyProfileErrors(profile)

  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(" "))
  }

  const configuredCompanyId = getResolvedRecommandCredentials(settings, environment).companyId
  let company: RecommandCompany | null = null
  let action: RecommandCompanySyncResult["action"] = "already_in_sync"

  try {
    company = await getRecommandCompany(settings, configuredCompanyId, environment)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Recommand company."
    if (!message.includes("status 404")) {
      throw error
    }
  }

  if (!company) {
    const companies = await listRecommandCompanies(settings, environment)
    const matchedCompany = findMatchingCompany(companies, profile)

    if (matchedCompany) {
      company = matchedCompany
      action = "matched_existing"
    } else {
      company = await createRecommandCompany(
        settings,
        {
          name: profile.name,
          address: profile.address,
          postalCode: profile.postalCode,
          city: profile.city,
          country: profile.country,
        },
        environment
      )
      action = "created"
    }
  }

  const { changedFields, body } = buildCompanyUpdatePayload(profile, company)
  if (changedFields.length > 0) {
    company = await updateRecommandCompany(settings, company.id, body, environment)
    action = action === "created" ? "created" : action === "matched_existing" ? "matched_existing" : "updated"
  }

  const verificationNeeded = company.isVerified === false
  const verificationResult = verificationNeeded
    ? await verifyRecommandCompany(settings, company.id, environment)
    : { verificationUrl: null }

  return {
    environment,
    companyId: company.id,
    action,
    changedFields,
    verificationTriggered: verificationNeeded,
    verificationUrl: verificationResult.verificationUrl,
    company,
  }
}

// ---------------------------------------------------------------------------
// Peppol directory search & recipient verification
// ---------------------------------------------------------------------------

export type RecommandDirectoryHit = {
  peppolAddress: string
  name: string
  supportedDocumentTypes: string[]
  /** Derived: scheme part before ":" (e.g. "0208") */
  scheme: string | null
  /** Derived: identifier part after ":" (e.g. "0931413103") */
  identifier: string | null
  /** Derived: ISO country code if scheme implies one */
  countryCode: string | null
  /** Derived: human-friendly VAT/enterprise number (e.g. "BE0931413103") */
  formattedNumber: string | null
  /** Derived: whether supportedDocumentTypes contains an invoice type */
  supportsInvoice: boolean
}

export type RecommandRecipientVerification = {
  peppolAddress: string
  isValid: boolean
  companyName: string | null
  countryCode: string | null
  supportedDocuments: Array<{
    name?: string
    docTypeId?: string
    serviceProvider?: string
  }>
}

export type RecommandDocumentSupport = {
  peppolAddress: string
  isValid: boolean
  serviceProvider: string | null
}

const PEPPOL_SCHEME_TO_COUNTRY: Record<string, string> = {
  "0208": "BE", // Belgian enterprise number (KBO/BCE)
  "9925": "BE", // Belgian VAT
  "0106": "NL", // Dutch KvK
  "9944": "NL", // Dutch VAT
  "0184": "DK",
  "0192": "NO",
  "0007": "SE",
  "0037": "FI",
  "9930": "DE",
  "9922": "AT",
  "9923": "CH",
  "9931": "ES",
  "9928": "FR",
  "9932": "GB",
  "9933": "IT",
  "9938": "LU",
  "9941": "PT",
  "9913": "IE",
}

const INVOICE_DOC_TYPE_REGEX = /Invoice|invoice/

export function parsePeppolAddress(peppolAddress: string): {
  scheme: string | null
  identifier: string | null
  countryCode: string | null
  formattedNumber: string | null
} {
  const trimmed = peppolAddress?.trim() ?? ""
  const [scheme, rawIdentifier] = trimmed.split(":")
  if (!scheme || !rawIdentifier) {
    return { scheme: null, identifier: null, countryCode: null, formattedNumber: null }
  }
  const countryCode = PEPPOL_SCHEME_TO_COUNTRY[scheme] ?? null
  // Strip a leading country prefix from the identifier if it duplicates the scheme's country.
  // Example: scheme 9925 + identifier "be0772396944" → identifier "0772396944"
  let identifier = rawIdentifier
  if (countryCode) {
    const prefixRegex = new RegExp(`^${countryCode}`, "i")
    identifier = identifier.replace(prefixRegex, "")
  }
  const formattedNumber = countryCode ? `${countryCode}${identifier}`.toUpperCase() : identifier.toUpperCase()
  return { scheme, identifier, countryCode, formattedNumber }
}

/** Strip spaces, dots, and dashes; uppercase. Returns null if input is empty. */
export function normalizeVatNumber(input?: string | null): string | null {
  const cleaned = input?.replace(/[\s.\-]/g, "").toUpperCase() ?? ""
  return cleaned || null
}

/** "BE0931413103" → "0208:0931413103". Returns null if shape is unrecognized. */
export function vatToPeppolAddress(input: string): string | null {
  const normalized = normalizeVatNumber(input)
  if (!normalized) return null
  const match = normalized.match(/^([A-Z]{2})?(\d{8,})$/)
  if (!match) return null
  const countryPrefix = match[1] ?? "BE"
  const digits = match[2]
  // Belgian enterprise numbers are 10 digits → scheme 0208
  if (countryPrefix === "BE" && digits.length === 10) {
    return `0208:${digits}`
  }
  // Belgian VAT (9 digits, often without prefix) → scheme 9925
  if (countryPrefix === "BE" && digits.length === 9) {
    return `9925:${digits}`
  }
  // Fallback for other countries: try VAT scheme mapping
  const schemeEntry = Object.entries(PEPPOL_SCHEME_TO_COUNTRY).find(
    ([, country]) => country === countryPrefix
  )
  if (schemeEntry) {
    return `${schemeEntry[0]}:${digits}`
  }
  return null
}

function enrichDirectoryHit(raw: { peppolAddress: string; name: string; supportedDocumentTypes?: string[] }): RecommandDirectoryHit {
  const parsed = parsePeppolAddress(raw.peppolAddress)
  const supportedDocumentTypes = raw.supportedDocumentTypes ?? []
  return {
    peppolAddress: raw.peppolAddress,
    name: raw.name,
    supportedDocumentTypes,
    ...parsed,
    supportsInvoice: supportedDocumentTypes.some((type) => INVOICE_DOC_TYPE_REGEX.test(type)),
  }
}

/**
 * Score a hit against the user's query for ranking.
 * Higher = better match. 0 = no match.
 */
function scoreDirectoryHit(name: string, query: string): number {
  const n = name.toLowerCase().trim()
  const q = query.toLowerCase().trim()
  if (!q) return 0
  if (n === q) return 1000
  if (n.startsWith(q)) return 800
  // Word-boundary starts-with (e.g. query "ikag" matches "IKAg Solutions")
  const words = n.split(/[\s\-_/&,.]+/).filter(Boolean)
  if (words.some((w) => w.startsWith(q))) return 600
  if (n.includes(q)) return 400
  return 100
}

/**
 * Pick the "better" of two duplicate hits sharing the same canonical number.
 * Prefers scheme 0208 (enterprise number) over 9925 (VAT) for BE companies,
 * since the former is the canonical Peppol participant ID.
 */
function preferredScheme(a: RecommandDirectoryHit, b: RecommandDirectoryHit): RecommandDirectoryHit {
  const order = ["0208", "0106", "9925", "9944"]
  const aIdx = a.scheme ? order.indexOf(a.scheme) : -1
  const bIdx = b.scheme ? order.indexOf(b.scheme) : -1
  if (aIdx === -1 && bIdx === -1) return a
  if (aIdx === -1) return b
  if (bIdx === -1) return a
  return aIdx <= bIdx ? a : b
}

export async function searchRecommandDirectory(
  settings: SettingsMap,
  query: string,
  environment = getActiveRecommandEnvironment(settings)
): Promise<RecommandDirectoryHit[]> {
  const trimmed = query?.trim()
  if (!trimmed || trimmed.length < 3) return []

  const result = await recommandRequest<{ success: boolean; results?: Array<{ peppolAddress: string; name: string; supportedDocumentTypes?: string[] }> }>(
    settings,
    "/search-peppol-directory",
    {
      method: "POST",
      body: JSON.stringify({ query: trimmed }),
    },
    environment
  )

  const enriched = (result.results ?? []).map(enrichDirectoryHit)

  // Dedupe by canonical (countryCode + formattedNumber + name) — collapses 0208/9925 duplicates.
  const dedupeMap = new Map<string, RecommandDirectoryHit>()
  for (const hit of enriched) {
    const key = `${hit.formattedNumber ?? hit.peppolAddress}::${hit.name.toLowerCase().trim()}`
    const existing = dedupeMap.get(key)
    dedupeMap.set(key, existing ? preferredScheme(existing, hit) : hit)
  }

  // Rank by name match quality, then alphabetically as a stable tiebreaker.
  return Array.from(dedupeMap.values()).sort((a, b) => {
    const scoreDiff = scoreDirectoryHit(b.name, trimmed) - scoreDirectoryHit(a.name, trimmed)
    if (scoreDiff !== 0) return scoreDiff
    return a.name.localeCompare(b.name)
  })
}

export async function verifyRecommandRecipient(
  settings: SettingsMap,
  peppolAddress: string,
  environment = getActiveRecommandEnvironment(settings)
): Promise<RecommandRecipientVerification> {
  const result = await recommandRequest<{
    success: boolean
    isValid?: boolean
    companyName?: string
    countryCode?: string
    supportedDocuments?: Array<{ name?: string; docTypeId?: string; serviceProvider?: string }>
  }>(
    settings,
    "/verify",
    {
      method: "POST",
      body: JSON.stringify({
        peppolAddress,
        includeEndpointDetails: false,
        includeBusinessCard: true,
      }),
    },
    environment
  )

  return {
    peppolAddress,
    isValid: Boolean(result.isValid),
    companyName: result.companyName ?? null,
    countryCode: result.countryCode ?? null,
    supportedDocuments: result.supportedDocuments ?? [],
  }
}

export async function verifyRecommandDocumentSupport(
  settings: SettingsMap,
  peppolAddress: string,
  documentType: string = "invoice",
  environment = getActiveRecommandEnvironment(settings)
): Promise<RecommandDocumentSupport> {
  const result = await recommandRequest<{
    success: boolean
    isValid?: boolean
    serviceProvider?: string
  }>(
    settings,
    "/verify-document-support",
    {
      method: "POST",
      body: JSON.stringify({ peppolAddress, documentType }),
    },
    environment
  )

  return {
    peppolAddress,
    isValid: Boolean(result.isValid),
    serviceProvider: result.serviceProvider ?? null,
  }
}

// ---------------------------------------------------------------------------
// VIES address enrichment (free EU VAT validation service)
// ---------------------------------------------------------------------------

const VIES_BASE_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api"

export type ViesLookupResult = {
  isValid: boolean
  name: string | null
  /** Full multi-line address as returned by VIES */
  rawAddress: string | null
  /** Best-effort parsed address (street + house number, postal, city) */
  street: string | null
  houseNumber: string | null
  postalCode: string | null
  city: string | null
}

/**
 * Parse a BE-style address string. Examples:
 *   "RUE DES MESSES 18\n4500 HUY"
 *   "Avenue de l'Atomium 35-39\n1020 Laeken"
 *   "Korte Meer 6\n9000 Gent"
 */
function parseEuAddress(raw: string): {
  street: string | null
  houseNumber: string | null
  postalCode: string | null
  city: string | null
} {
  if (!raw) return { street: null, houseNumber: null, postalCode: null, city: null }
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return { street: null, houseNumber: null, postalCode: null, city: null }

  const streetLine = lines[0] ?? ""
  const cityLine = lines[lines.length - 1] ?? ""

  // Street: try to split off trailing number (incl. ranges like "35-39" and bus suffixes ignored)
  const streetMatch = streetLine.match(/^(.*?)\s+(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s*$/)
  const street = streetMatch ? streetMatch[1].trim() : streetLine
  const houseNumber = streetMatch ? streetMatch[2] : null

  // City line: "1020 Laeken" or "B-1020 Laeken"
  const cityMatch = cityLine.match(/^(?:[A-Z]{1,2}-)?(\d{4,5})\s+(.+)$/)
  const postalCode = cityMatch ? cityMatch[1] : null
  const city = cityMatch ? cityMatch[2].trim() : null

  return { street, houseNumber, postalCode, city }
}

/**
 * Look up a VAT number against VIES. countryCode + vatNumber must be plain (no prefix).
 * Returns null on network error so callers can fall back gracefully.
 */
export async function lookupViesVatDetails(
  countryCode: string,
  vatNumber: string
): Promise<ViesLookupResult | null> {
  try {
    const cc = countryCode.toUpperCase()
    const vn = vatNumber.replace(/[\s.\-]/g, "")
    if (!/^[A-Z]{2}$/.test(cc) || !/^\d+$/.test(vn)) return null

    const response = await fetch(`${VIES_BASE_URL}/ms/${cc}/vat/${vn}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    })
    if (!response.ok) return null
    const body = (await response.json()) as {
      isValid?: boolean
      name?: string
      address?: string
      viesApproximate?: { street?: string; postalCode?: string; city?: string }
    }

    if (!body.isValid) {
      return {
        isValid: false,
        name: null,
        rawAddress: null,
        street: null,
        houseNumber: null,
        postalCode: null,
        city: null,
      }
    }

    // Prefer the parsed `address` string (parseEuAddress also extracts house number).
    const parsed = body.address ? parseEuAddress(body.address) : { street: null, houseNumber: null, postalCode: null, city: null }
    const fallbackStreet = body.viesApproximate?.street ?? null
    const fallbackPostal = body.viesApproximate?.postalCode ?? null
    const fallbackCity = body.viesApproximate?.city ?? null

    return {
      isValid: true,
      name: body.name ?? null,
      rawAddress: body.address ?? null,
      street: parsed.street ?? fallbackStreet,
      houseNumber: parsed.houseNumber,
      postalCode: parsed.postalCode ?? fallbackPostal,
      city: parsed.city ?? fallbackCity,
    }
  } catch {
    return null
  }
}

export function getRecommandSyncSummary(result: RecommandCompanySyncResult): string {
  const environmentLabel = getRecommandEnvironmentLabel(result.environment)
  if (result.action === "already_in_sync") {
    return `Active ${environmentLabel} company is already in sync.`
  }

  const fieldSummary =
    result.changedFields.length > 0 ? ` Updated: ${result.changedFields.join(", ")}.` : ""
  const verificationSummary =
    result.verificationTriggered && result.verificationUrl
      ? ` Verification started: ${result.verificationUrl}`
      : result.verificationTriggered
        ? " Verification was triggered."
        : ""

  if (result.action === "created") {
    return `Created a new ${environmentLabel} Recommand company.${fieldSummary}${verificationSummary}`
  }

  if (result.action === "matched_existing") {
    return `Matched an existing ${environmentLabel} Recommand company and synced it.${fieldSummary}${verificationSummary}`
  }

  return `Updated the active ${environmentLabel} Recommand company.${fieldSummary}${verificationSummary}`
}
