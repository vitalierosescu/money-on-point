"use client"

import { useState, useTransition } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { InvoicePreview } from "./invoice-preview"
import { InvoiceStatusBadge } from "./invoice-status-badge"
import { SendInvoiceDialog } from "./send-invoice-dialog"
import { PaymentDialog } from "./payment-dialog"
import {
  getCustomerBillingEmails,
  getInvoiceDeliveryMethod,
  getInvoiceDeliveryMethodLabel,
  getInvoiceDeliveryStatusLabel,
  normalizeInvoiceDeliveryStatus,
} from "@/lib/invoice-delivery"
import { InvoiceFormData } from "@/lib/invoice-pdf/types"
import { InvoiceWithCustomer } from "@/models/invoices"
import { ExternalLink, Loader2, Pencil, Send, CheckCircle, XCircle, Trash2, Download, Copy, Paperclip } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import {
  markInvoicePaidAction,
  cancelInvoiceAction,
  deleteInvoiceAction,
  downloadInvoicePDFAction,
  duplicateInvoiceAction,
} from "@/app/(app)/invoices/actions"
import { t } from "@/lib/i18n"
import { formatLocaleCurrency, formatLocaleDate, type UiLocale } from "@/lib/locale"

type InvoiceDrawerProps = {
  invoice: InvoiceWithCustomer
  locale: UiLocale
  open: boolean
  onClose: () => void
}

export function InvoiceDrawer({ invoice, locale, open, onClose }: InvoiceDrawerProps) {
  const [isPending, startTransition] = useTransition()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const templateData = invoice.templateData
    ? (invoice.templateData as unknown as InvoiceFormData)
    : null
  const attachedFiles = Array.isArray(invoice.transaction?.files) ? (invoice.transaction?.files as string[]) : []
  const deliveryMethod = getInvoiceDeliveryMethod(invoice)
  const deliveryStatus = normalizeInvoiceDeliveryStatus(invoice.deliveryStatus)
  const defaultBillingRecipients = getCustomerBillingEmails(invoice.customer)

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      const result = await action()
      if (
        result &&
        typeof result === "object" &&
        "success" in result &&
        !(result as { success: boolean }).success
      ) {
        toast.error((result as { error?: string }).error ?? "Action failed")
        return
      }
      onClose()
    })
  }

  const canSend = invoice.status === "draft"
  const canMarkPaid =
    invoice.status === "sent" ||
    invoice.status === "overdue" ||
    invoice.status === "partially_paid"
  const canRecordPayment =
    invoice.status === "sent" ||
    invoice.status === "overdue" ||
    invoice.status === "partially_paid"
  const canCancel =
    invoice.status === "sent" ||
    invoice.status === "overdue" ||
    invoice.status === "partially_paid"
  const canDuplicate = invoice.status !== "draft"
  const canDelete = invoice.status === "draft" || invoice.status === "cancelled"

  async function handleDownloadPDF() {
    if (!templateData) {
      toast.error(t(locale, "invoices.drawerPreviewUnavailable"))
      return
    }
    startTransition(async () => {
      try {
        const { base64, filename } = await downloadInvoicePDFAction(invoice.id)
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: "application/pdf" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      } catch {
        toast.error(t(locale, "invoices.drawerDownloadPdf"))
      }
    })
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-5xl p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b flex flex-row items-center justify-between">
            <SheetTitle className="text-base font-semibold">
              {invoice.invoiceNumber}
            </SheetTitle>
            <div className="flex items-center gap-2">
              <InvoiceStatusBadge status={invoice.status} />
              {invoice.status === "draft" && (
                <Link href={`/invoices/${invoice.id}/edit`} onClick={onClose}>
                  <Button variant="ghost" size="icon">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
          </SheetHeader>

          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto border-r bg-muted/20 flex flex-col">
              <div className="flex-1">
                {templateData ? (
                  <InvoicePreview templateData={templateData} />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground p-8">
                    <p>{t(locale, "invoices.drawerPreviewUnavailable")}</p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t bg-card">
                <Link href={`/invoices/${invoice.id}`} onClick={onClose}>
                  <Button variant="outline" className="w-full">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t(locale, "invoices.drawerOpenFullPage")}
                  </Button>
                </Link>
              </div>
            </div>

            <div className="w-64 flex flex-col overflow-y-auto">
              <div className="flex-1 p-4 space-y-3 text-sm">
                <div className="font-semibold text-base">{invoice.customer?.name ?? "—"}</div>
                {(
                  [
                    [
                      t(locale, "invoices.drawerDate"),
                      invoice.issuedAt
                        ? formatLocaleDate(invoice.issuedAt, locale)
                        : "—",
                    ],
                    [
                      t(locale, "invoices.drawerDueDate"),
                      invoice.dueDate
                        ? formatLocaleDate(invoice.dueDate, locale)
                        : "—",
                    ],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
                <div className="flex justify-between py-1 border-b font-semibold">
                  <span>{t(locale, "invoices.drawerTotal")}</span>
                  <span>
                    {formatLocaleCurrency(invoice.total, invoice.currency, locale)}
                  </span>
                </div>
                {invoice.paidAmount > 0 && (
                  <div className="flex justify-between py-1 border-b text-success">
                    <span>{t(locale, "invoices.drawerPaid")}</span>
                    <span>
                      {formatLocaleCurrency(invoice.paidAmount, invoice.currency, locale)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">{t(locale, "invoices.drawerDelivery")}</span>
                  <span>{getInvoiceDeliveryMethodLabel(deliveryMethod)}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">{t(locale, "invoices.drawerDeliveryStatus")}</span>
                  <span>{getInvoiceDeliveryStatusLabel(deliveryStatus)}</span>
                </div>
                {invoice.providerError && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {invoice.providerError}
                  </div>
                )}
              </div>

              <div className="p-4 border-t space-y-2">
                {isPending && (
                  <div className="flex justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}

                {canSend && deliveryMethod === "email_pdf" && (
                  <SendInvoiceDialog
                    invoiceId={invoice.id}
                    invoiceNumber={invoice.invoiceNumber}
                    defaultRecipients={defaultBillingRecipients}
                    trigger={
                      <Button variant="default" className="w-full" disabled={isPending}>
                        <Send className="mr-2 h-4 w-4" />
                        {t(locale, "invoices.drawerSend")}
                      </Button>
                    }
                  />
                )}
                {canSend && deliveryMethod === "peppol" && (
                  <Link href={`/invoices/${invoice.id}`} onClick={onClose}>
                    <Button variant="default" className="w-full" disabled={isPending}>
                      <Send className="mr-2 h-4 w-4" />
                      {t(locale, "invoices.drawerOpenPeppol")}
                    </Button>
                  </Link>
                )}

                {canMarkPaid && (
                  <Button
                    variant="default"
                    className="w-full"
                    disabled={isPending}
                    onClick={() => run(() => markInvoicePaidAction(invoice.id, new Date()))}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    {t(locale, "invoices.drawerMarkPaid")}
                  </Button>
                )}

                {canRecordPayment && (
                  <PaymentDialog
                    invoiceId={invoice.id}
                    remainingAmount={invoice.total - invoice.paidAmount}
                    currency={invoice.currency}
                    trigger={
                      <Button variant="outline" className="w-full" disabled={isPending}>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        {t(locale, "invoices.drawerRecordPayment")}
                      </Button>
                    }
                  />
                )}

                {invoice.status === "draft" && (
                  <Link href={`/invoices/${invoice.id}/edit`} onClick={onClose}>
                    <Button variant="outline" className="w-full" disabled={isPending}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {t(locale, "invoices.drawerEdit")}
                    </Button>
                  </Link>
                )}

                {templateData && (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={isPending}
                    onClick={handleDownloadPDF}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {t(locale, "invoices.drawerDownloadPdf")}
                  </Button>
                )}

                {attachedFiles.length > 0 && (
                  <Link href={`/invoices/${invoice.id}#documents`} onClick={onClose}>
                    <Button variant="outline" className="w-full" disabled={isPending}>
                      <Paperclip className="mr-2 h-4 w-4" />
                      {attachedFiles.length === 1
                        ? t(locale, "invoices.drawerLinkedDocumentsOne", { count: attachedFiles.length })
                        : t(locale, "invoices.drawerLinkedDocumentsMany", { count: attachedFiles.length })}
                    </Button>
                  </Link>
                )}

                {canDuplicate && (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={isPending}
                    onClick={() => run(() => duplicateInvoiceAction(invoice.id))}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t(locale, "invoices.drawerDuplicate")}
                  </Button>
                )}

                {canCancel && (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={isPending}
                    onClick={() => run(() => cancelInvoiceAction(invoice.id))}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    {t(locale, "invoices.drawerCancel")}
                  </Button>
                )}

                {canDelete && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={isPending}
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t(locale, "invoices.drawerDelete")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {canDelete && (
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t(locale, "invoices.drawerDeleteTitle")}</DialogTitle>
              <DialogDescription>
                {t(locale, "invoices.drawerDeleteDescription", { invoiceNumber: invoice.invoiceNumber })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" disabled={isPending} onClick={() => setShowDeleteConfirm(false)}>
                {t(locale, "common.cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={isPending}
                onClick={() => {
                  setShowDeleteConfirm(false)
                  run(() => deleteInvoiceAction(invoice.id))
                }}
              >
                {t(locale, "common.delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
