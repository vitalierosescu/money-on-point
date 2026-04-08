import { isAuthorRightsMode } from "@/lib/author-rights"
import { getInvoiceDeliveryMethod } from "@/lib/invoice-delivery"
import { validateInvoiceForPeppolDelivery, type InvoiceFieldErrors } from "@/lib/invoice-validation"
import { buildRecommandInvoicePayload } from "@/lib/recommand-payload"
import { sendInvoiceViaRecommand, verifyPeppolRecipient } from "@/lib/recommand"
import { getActiveRecommandEnvironment } from "@/lib/recommand-settings"
import { prisma } from "@/lib/db"
import { getSettings } from "@/models/settings"
import { getUserById } from "@/models/users"
import type { InvoiceFormData } from "@/lib/invoice-pdf/types"

export type PeppolSendResult =
  | { success: true; providerReferenceId?: string }
  | { success: false; error: string; fieldErrors?: InvoiceFieldErrors }

function flattenProviderErrors(errors?: Record<string, string[]>): string {
  if (!errors) return "Recommand rejected the invoice."
  return Object.entries(errors)
    .flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
    .join(" ")
}

export async function sendInvoiceViaPeppolForUser(userId: string, invoiceId: string): Promise<PeppolSendResult> {
  const user = await getUserById(userId)
  if (!user) {
    return { success: false, error: "User not found." }
  }

  const settings = await getSettings(userId)
  const environment = getActiveRecommandEnvironment(settings)
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    include: { customer: true },
  })

  if (!invoice) {
    return { success: false, error: "Invoice not found" }
  }

  if (invoice.status === "draft") {
    return { success: false, error: "Save the invoice as sent before sending it via PEPPOL." }
  }

  if (isAuthorRightsMode(invoice.invoiceMode)) {
    return { success: false, error: "Author-rights invoices are currently supported with Email + PDF only." }
  }

  if (getInvoiceDeliveryMethod(invoice) !== "peppol") {
    return { success: false, error: "This invoice is not using PEPPOL delivery." }
  }

  const validation = validateInvoiceForPeppolDelivery({
    businessName: user.businessName,
    businessAddress: user.businessAddress,
    businessBankDetails: user.businessBankDetails,
    customer: invoice.customer,
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    items: invoice.items,
    templateData: (invoice.templateData as unknown as InvoiceFormData | undefined) ?? null,
    settings,
  })

  if (validation.message) {
    await prisma.invoice.update({
      where: { id: invoice.id, userId },
      data: {
        deliveryMethod: "peppol",
        deliveryStatus: "failed",
        providerError: validation.message,
        peppolEnvironment: environment,
      },
    })
    return { success: false, error: validation.message, fieldErrors: validation.fieldErrors }
  }

  try {
    const verification = await verifyPeppolRecipient(
      settings,
      invoice.customer.peppolId ?? "",
      invoice.customer.country
    )

    if (!verification.isValid) {
      await prisma.invoice.update({
        where: { id: invoice.id, userId },
        data: {
          deliveryMethod: "peppol",
          deliveryStatus: "failed",
          providerError: verification.message ?? "Recipient is not registered in the PEPPOL network.",
          deliveryExceptionCode: "customer_not_peppol_ready",
          deliveryExceptionNote: verification.message ?? "Recipient is not registered in the PEPPOL network.",
          peppolEnvironment: environment,
        },
      })
      return { success: false, error: verification.message ?? "Recipient is not registered in the PEPPOL network." }
    }

    const payload = buildRecommandInvoicePayload(user, settings, invoice)
    const result = await sendInvoiceViaRecommand(
      settings,
      validation.normalizedPeppolAddress ?? invoice.customer.peppolId ?? "",
      invoice.customer.country,
      payload
    )

    if (!result.success) {
      const providerError = flattenProviderErrors(result.errors)
      await prisma.invoice.update({
        where: { id: invoice.id, userId },
        data: {
          deliveryMethod: "peppol",
          deliveryStatus: "failed",
          providerError,
          peppolEnvironment: environment,
        },
      })
      return { success: false, error: providerError }
    }

    await prisma.invoice.update({
      where: { id: invoice.id, userId },
      data: {
        deliveryMethod: "peppol",
        deliveryStatus: "sent",
        deliverySentAt: new Date(),
        providerReferenceId: result.id ?? validation.normalizedPeppolAddress,
        providerError: null,
        deliveryExceptionCode: null,
        deliveryExceptionNote: null,
        peppolEnvironment: environment,
      },
    })

    return { success: true, providerReferenceId: result.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : "PEPPOL send failed."
    await prisma.invoice.update({
      where: { id: invoice.id, userId },
      data: {
        deliveryMethod: "peppol",
        deliveryStatus: "failed",
        providerError: message,
        peppolEnvironment: environment,
      },
    })
    return { success: false, error: message }
  }
}
