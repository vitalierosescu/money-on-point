"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Mail, Network, RefreshCcw, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PaymentDialog } from "@/components/invoices/payment-dialog"
import { SendInvoiceDialog } from "@/components/invoices/send-invoice-dialog"
import {
  cancelInvoiceAction,
  deleteInvoiceAction,
  markInvoicePaidAction,
  sendInvoicePeppolAction,
  setInvoiceDeliveryMethodAction,
  verifyInvoicePeppolRecipientAction,
} from "@/app/(app)/invoices/actions"
import {
  classifyInvoiceDeliveryRequirement,
  getCustomerBillingEmails,
  getInvoiceDeliveryMethod,
  getInvoiceDeliveryMethodLabel,
  getInvoiceDeliveryStatusLabel,
  normalizeDeliveryExceptionCode,
  normalizeEmailCopyStatus,
  normalizeInvoiceDeliveryStatus,
} from "@/lib/invoice-delivery"
import { isAuthorRightsMode } from "@/lib/author-rights"
import { InvoiceWithCustomer } from "@/models/invoices"
import Link from "next/link"

export function InvoiceActions({
  invoice,
  sellerCountryCode,
}: {
  invoice: InvoiceWithCustomer
  sellerCountryCode?: string | null
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const deliveryMethod = getInvoiceDeliveryMethod(invoice)
  const deliveryStatus = normalizeInvoiceDeliveryStatus(invoice.deliveryStatus)
  const defaultBillingRecipients = getCustomerBillingEmails(invoice.customer)
  const isDeliveryLocked = deliveryStatus === "sent" || invoice.status === "paid" || invoice.status === "cancelled"
  const peppolWasDelivered = deliveryMethod === "peppol" && deliveryStatus === "sent"
  const isAuthorRightsInvoice = isAuthorRightsMode(invoice.invoiceMode)
  const emailCopyStatus = normalizeEmailCopyStatus(invoice.emailCopyStatus)
  const peppolVerificationPassed =
    normalizeDeliveryExceptionCode(invoice.deliveryExceptionCode) === "customer_not_peppol_ready"
      ? false
      : deliveryStatus === "verified" || peppolWasDelivered
        ? true
        : null
  const compliance = classifyInvoiceDeliveryRequirement({
    sellerCountry: sellerCountryCode,
    customerCountry: invoice.customer.country,
    customerVatNumber: invoice.customer.vatNumber,
    customerPeppolId: invoice.customer.peppolId,
    customerDeliveryPreference: invoice.customer.invoiceDeliveryMethod,
    invoiceMode: invoice.invoiceMode,
    peppolVerificationPassed,
  })
  const emailSwitchBlocked =
    !compliance.scopeKnown || (compliance.requiresStructuredInvoice && !compliance.allowEmailFallback)
  const emailSendBlocked =
    deliveryMethod === "email_pdf" &&
    (!compliance.scopeKnown || (compliance.requiresStructuredInvoice && !compliance.allowEmailFallback))

  const run = async (action: () => Promise<unknown>) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await action()
      if (
        result &&
        typeof result === "object" &&
        "success" in result &&
        !(result as { success: boolean }).success
      ) {
        setError((result as { error?: string }).error ?? "Action failed")
        return false
      }
      router.refresh()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed")
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const remaining = invoice.total - invoice.paidAmount

  const deliverySwitch = (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Delivery</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium">
          {getInvoiceDeliveryMethodLabel(deliveryMethod)}
        </span>
        <span className="rounded-full bg-background px-2.5 py-1 text-xs text-muted-foreground">
          {getInvoiceDeliveryStatusLabel(deliveryStatus)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant={deliveryMethod === "email_pdf" ? "default" : "outline"}
          size="sm"
          disabled={isLoading || isDeliveryLocked || (deliveryMethod !== "email_pdf" && emailSwitchBlocked)}
          onClick={() => run(() => setInvoiceDeliveryMethodAction(invoice.id, "email_pdf"))}
        >
          <Mail className="mr-2 h-4 w-4" />
          Email + PDF
        </Button>
        <Button
          variant={deliveryMethod === "peppol" ? "default" : "outline"}
          size="sm"
          disabled={isLoading || isDeliveryLocked || isAuthorRightsInvoice}
          onClick={() => run(() => setInvoiceDeliveryMethodAction(invoice.id, "peppol"))}
        >
          <Network className="mr-2 h-4 w-4" />
          PEPPOL
        </Button>
      </div>
      {isAuthorRightsInvoice && (
        <p className="mt-2 text-xs text-muted-foreground">
          Auteursrechtenfacturen blijven in v1 beperkt tot Email + PDF.
        </p>
      )}
      {emailSwitchBlocked && deliveryMethod !== "peppol" && compliance.message && (
        <p className="mt-2 text-xs text-amber-700">{compliance.message}</p>
      )}
      {compliance.allowEmailFallback && invoice.deliveryExceptionNote && (
        <p className="mt-2 text-xs text-amber-700">{invoice.deliveryExceptionNote}</p>
      )}
      {invoice.providerReferenceId && (
        <p className="mt-2 text-xs text-muted-foreground">Provider ref: {invoice.providerReferenceId}</p>
      )}
      {invoice.emailCopySentAt && (
        <p className="mt-2 text-xs text-muted-foreground">
          Courtesy copy: {emailCopyStatus} on {new Date(invoice.emailCopySentAt).toLocaleDateString("nl-BE")}
        </p>
      )}
      {invoice.providerError && <p className="mt-2 text-xs text-destructive">{invoice.providerError}</p>}
      {peppolWasDelivered && (
        <p className="mt-2 text-xs text-success">
          Deze factuur is al via PEPPOL verzonden. Gebruik de providerreferentie hierboven als naslag.
        </p>
      )}
    </div>
  )

  const content = (() => {
    if (invoice.status === "draft") {
      return (
        <div className="flex flex-col gap-2">
          {deliverySwitch}
          <Link href={`/invoices/${invoice.id}/edit`}>
            <Button variant="outline" className="w-full">Edit</Button>
          </Link>
          {deliveryMethod === "email_pdf" && !emailSendBlocked ? (
            <SendInvoiceDialog
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
              defaultRecipients={defaultBillingRecipients}
            />
          ) : (
            <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              {deliveryMethod === "peppol"
                ? "Save this invoice as sent first, then use the PEPPOL actions."
                : compliance.message ?? "This invoice cannot be emailed yet."}
            </div>
          )}
          <Button
            variant="destructive"
            className="w-full"
            disabled={isLoading}
            onClick={async () => {
              if (!confirm("Delete this invoice?")) return
              const didDelete = await run(() => deleteInvoiceAction(invoice.id))
              if (didDelete) {
                router.push("/invoices")
              }
            }}
          >
            Delete
          </Button>
        </div>
      )
    }

    if (invoice.status === "sent" || invoice.status === "partially_paid" || invoice.status === "overdue") {
      return (
        <div className="flex flex-col gap-2">
          {deliverySwitch}
          {deliveryMethod === "peppol" ? (
            <>
              <Button
                variant="outline"
                className="w-full"
                disabled={isLoading || peppolWasDelivered}
                onClick={() => run(() => verifyInvoicePeppolRecipientAction(invoice.id))}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {peppolWasDelivered ? "Ontvanger geverifieerd" : "Ontvanger verifiëren"}
              </Button>
              {peppolWasDelivered ? (
                <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                  Via PEPPOL verzonden.
                </div>
              ) : (
                <Button
                  className="w-full"
                  disabled={isLoading}
                  onClick={() => run(() => sendInvoicePeppolAction(invoice.id))}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {deliveryStatus === "failed" ? "Opnieuw via PEPPOL verzenden" : "Verzenden via PEPPOL"}
                </Button>
              )}
              {peppolWasDelivered && (
                <SendInvoiceDialog
                  invoiceId={invoice.id}
                  invoiceNumber={invoice.invoiceNumber}
                  defaultRecipients={defaultBillingRecipients}
                  kind="courtesy"
                  trigger={
                    <Button variant="outline" className="w-full">
                      <Mail className="mr-2 h-4 w-4" />
                      {emailCopyStatus === "sent" ? "Resend Courtesy Copy" : "Send Courtesy Copy"}
                    </Button>
                  }
                />
              )}
            </>
          ) : !emailSendBlocked ? (
            <SendInvoiceDialog
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
              defaultRecipients={defaultBillingRecipients}
              trigger={
                <Button variant="default" className="w-full">
                  {deliveryStatus === "sent" ? <RefreshCcw className="mr-2 h-4 w-4" /> : <Mail className="mr-2 h-4 w-4" />}
                  {deliveryStatus === "sent" ? "Resend by Email" : "Send by Email"}
                </Button>
              }
            />
          ) : (
            <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              {compliance.message ?? "This invoice cannot be emailed yet."}
            </div>
          )}
          <PaymentDialog
            invoiceId={invoice.id}
            remainingAmount={remaining}
            currency={invoice.currency}
            trigger={<Button variant="outline" className="w-full">Record Payment</Button>}
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={isLoading}
            onClick={() => run(() => markInvoicePaidAction(invoice.id, new Date()))}
          >
            Mark as Fully Paid
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={isLoading}
            onClick={async () => {
              if (!confirm("Cancel this invoice?")) return
              await run(() => cancelInvoiceAction(invoice.id))
            }}
          >
            Cancel Invoice
          </Button>
        </div>
      )
    }

    if (invoice.status === "paid") {
      return (
        <div className="flex flex-col gap-2">
          {deliverySwitch}
          <Link href={`/invoices/new`}>
            <Button variant="outline" className="w-full">Create New Invoice</Button>
          </Link>
        </div>
      )
    }

    if (invoice.status === "cancelled") {
      return (
        <div className="flex flex-col gap-2">
          {deliverySwitch}
          <Link href={`/invoices/new`}>
            <Button variant="outline" className="w-full">Create New Invoice</Button>
          </Link>
          <Button
            variant="destructive"
            className="w-full"
            disabled={isLoading}
            onClick={async () => {
              if (!confirm("Delete this invoice?")) return
              const didDelete = await run(() => deleteInvoiceAction(invoice.id))
              if (didDelete) {
                router.push("/invoices")
              }
            }}
          >
            Delete
          </Button>
        </div>
      )
    }

    return null
  })()

  return (
    <div>
      {content}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
