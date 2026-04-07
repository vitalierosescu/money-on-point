"use server"

import { getCurrentUser } from "@/lib/auth"
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  archiveCustomer,
  restoreCustomer,
  getCustomerDeletionInfo,
  CustomerData,
} from "@/models/customers"
import { getSettings } from "@/models/settings"
import {
  searchRecommandDirectory,
  verifyRecommandRecipient,
  verifyRecommandDocumentSupport,
  vatToPeppolAddress,
  parsePeppolAddress,
  lookupViesVatDetails,
  type RecommandDirectoryHit,
  type RecommandRecipientVerification,
  type RecommandDocumentSupport,
  type ViesLookupResult,
} from "@/lib/recommand-companies"
import { hasConfiguredRecommandCredentials } from "@/lib/recommand-settings"
import { revalidatePath } from "next/cache"

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export async function createCustomerAction(data: CustomerData) {
  const user = await getCurrentUser()
  const customer = await createCustomer(user.id, data)
  revalidatePath("/customers")
  return { success: true, data: customer }
}

export async function updateCustomerAction(id: string, data: CustomerData) {
  const user = await getCurrentUser()
  const customer = await updateCustomer(id, user.id, data)
  revalidatePath("/customers")
  revalidatePath(`/customers/${id}`)
  return { success: true, data: customer }
}

export async function getCustomerDeletionInfoAction(id: string) {
  const user = await getCurrentUser()
  const info = await getCustomerDeletionInfo(id, user.id)
  return { success: true as const, data: info }
}

/**
 * Hard-delete only. Fails (and returns an error) if the customer has any
 * invoices. The UI should call getCustomerDeletionInfoAction first and
 * present an Archive flow when invoiceCount > 0.
 */
export async function deleteCustomerAction(id: string) {
  const user = await getCurrentUser()
  try {
    await deleteCustomer(id, user.id)
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to delete customer.",
    }
  }
  revalidatePath("/customers")
  return { success: true as const }
}

export async function archiveCustomerAction(id: string) {
  const user = await getCurrentUser()
  await archiveCustomer(id, user.id)
  revalidatePath("/customers")
  revalidatePath(`/customers/${id}`)
  return { success: true as const }
}

export async function restoreCustomerAction(id: string) {
  const user = await getCurrentUser()
  await restoreCustomer(id, user.id)
  revalidatePath("/customers")
  revalidatePath(`/customers/${id}`)
  return { success: true as const }
}

// ---------------------------------------------------------------------------
// Peppol directory autocomplete
// ---------------------------------------------------------------------------

export async function searchRecommandDirectoryAction(
  query: string
): Promise<ActionResult<{ hits: RecommandDirectoryHit[] }>> {
  try {
    const user = await getCurrentUser()
    const trimmed = query?.trim() ?? ""
    if (trimmed.length < 3) {
      return { success: true, data: { hits: [] } }
    }
    const settings = await getSettings(user.id)
    if (!hasConfiguredRecommandCredentials(settings)) {
      return { success: false, error: "Recommand is not configured." }
    }
    const hits = await searchRecommandDirectory(settings, trimmed)
    return { success: true, data: { hits } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Directory search failed.",
    }
  }
}

export async function lookupRecommandByVatAction(
  vatOrEnterpriseNumber: string
): Promise<ActionResult<{ hit: RecommandDirectoryHit | null }>> {
  try {
    const user = await getCurrentUser()
    const peppolAddress = vatToPeppolAddress(vatOrEnterpriseNumber)
    if (!peppolAddress) {
      return { success: true, data: { hit: null } }
    }
    const settings = await getSettings(user.id)
    if (!hasConfiguredRecommandCredentials(settings)) {
      return { success: false, error: "Recommand is not configured." }
    }
    const verification = await verifyRecommandRecipient(settings, peppolAddress)
    if (!verification.isValid || !verification.companyName) {
      return { success: true, data: { hit: null } }
    }
    const supportedDocumentTypes = verification.supportedDocuments
      .map((doc) => doc.docTypeId ?? doc.name ?? "")
      .filter(Boolean)
    return {
      success: true,
      data: {
        hit: {
          peppolAddress,
          name: verification.companyName,
          supportedDocumentTypes,
          scheme: peppolAddress.split(":")[0] ?? null,
          identifier: peppolAddress.split(":")[1] ?? null,
          countryCode: verification.countryCode,
          formattedNumber: verification.countryCode
            ? `${verification.countryCode}${peppolAddress.split(":")[1] ?? ""}`
            : null,
          supportsInvoice: supportedDocumentTypes.some((t) => /Invoice|invoice/.test(t)),
        },
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "VAT lookup failed.",
    }
  }
}

export async function verifyRecommandRecipientAction(
  peppolAddress: string
): Promise<
  ActionResult<{
    verification: RecommandRecipientVerification
    documentSupport: RecommandDocumentSupport | null
    vies: ViesLookupResult | null
  }>
> {
  try {
    const user = await getCurrentUser()
    if (!peppolAddress) {
      return { success: false, error: "Missing Peppol address." }
    }
    const settings = await getSettings(user.id)
    if (!hasConfiguredRecommandCredentials(settings)) {
      return { success: false, error: "Recommand is not configured." }
    }

    const verification = await verifyRecommandRecipient(settings, peppolAddress)

    let documentSupport: RecommandDocumentSupport | null = null
    if (verification.isValid) {
      try {
        documentSupport = await verifyRecommandDocumentSupport(settings, peppolAddress, "invoice")
      } catch {
        documentSupport = null
      }
    }

    // Enrich with VIES address (best-effort, non-blocking).
    let vies: ViesLookupResult | null = null
    const parsed = parsePeppolAddress(peppolAddress)
    if (parsed.identifier && parsed.countryCode) {
      // Belgian enterprise numbers (10 digits, scheme 0208) need the leading "0" stripped to get the 9-digit VAT.
      const isBeEnterprise = parsed.scheme === "0208" && parsed.identifier.length === 10
      const vatDigits = isBeEnterprise ? parsed.identifier.slice(1) : parsed.identifier
      vies = await lookupViesVatDetails(parsed.countryCode, vatDigits)
    }

    return { success: true, data: { verification, documentSupport, vies } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Recipient verification failed.",
    }
  }
}
