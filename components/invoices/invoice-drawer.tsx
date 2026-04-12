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
} from "@/lib/invoice-delivery"
import { InvoiceFormData } from "@/lib/invoice-pdf/types"
import { getInvoiceDeliveryPresentation } from "@/lib/invoice-state-presentation"
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
  const deliveryPresentation = getInvoiceDeliveryPresentation(invoice.deliveryStatus)
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
        <SheetContent
          side="right"
          className="flex w-full flex-col p-0 sm:max-w-[1180px] [&>button]:right-5 [&>button]:top-5 sm:[&>button]:right-6"
        >
          <SheetHeader className="flex flex-row items-center justify-between border-b px-7 py-5 pr-16 sm:pr-20">
            <SheetTitle className="pr-4 text-base font-semibold">
              {invoice.invoiceNumber}
            </SheetTitle>
            <div className="mr-3 flex shrink-0 items-center gap-2">
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

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-h-0 overflow-y-auto bg-muted/20">
              <div className="mx-auto flex min-h-full w-full max-w-[880px] flex-col px-5 py-5 sm:px-7 sm:py-7">
                {templateData ? (
                  <div className="rounded-2xl border bg-background shadow-sm">
                    <InvoicePreview templateData={templateData} />
                  </div>
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed bg-background p-8 text-muted-foreground">
                    <p>{t(locale, "invoices.drawerPreviewUnavailable")}</p>
                  </div>
                )}
                <div className="mt-5 rounded-2xl border bg-background p-3">
                  <Link href={`/invoices/${invoice.id}`} onClick={onClose}>
                    <Button variant="outline" className="h-11 w-full">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t(locale, "invoices.drawerOpenFullPage")}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-col border-l bg-background/95">
              <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
                <div className="space-y-5 text-sm">
                  <div className="rounded-2xl border bg-card px-4 py-4">
                    <div className="text-base font-semibold">{invoice.customer?.name ?? "—"}</div>
                  </div>

                  <div className="rounded-2xl border bg-card px-4 py-3">
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
                      <div key={label} className="flex items-start justify-between gap-4 border-b py-2.5 last:border-b-0 last:pb-1 first:pt-1">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="text-right font-medium">{value}</span>
                      </div>
                    ))}
                    <div className="flex items-start justify-between gap-4 border-b py-2.5 font-semibold">
                      <span>{t(locale, "invoices.drawerTotal")}</span>
                      <span className="text-right">
                        {formatLocaleCurrency(invoice.total, invoice.currency, locale)}
                      </span>
                    </div>
                    {invoice.paidAmount > 0 && (
                      <div className="flex items-start justify-between gap-4 border-b py-2.5 text-success last:border-b-0">
                        <span>{t(locale, "invoices.drawerPaid")}</span>
                        <span className="text-right">
                          {formatLocaleCurrency(invoice.paidAmount, invoice.currency, locale)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-4 border-b py-2.5">
                      <span className="text-muted-foreground">{t(locale, "invoices.drawerDelivery")}</span>
                      <span className="text-right font-medium">{getInvoiceDeliveryMethodLabel(deliveryMethod)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 py-2.5">
                      <span className="text-muted-foreground">{t(locale, "invoices.drawerDeliveryStatus")}</span>
                      <span className={`text-right font-medium ${deliveryPresentation.textClassName}`}>
                        {deliveryPresentation.label}
                      </span>
                    </div>
                  </div>

                  {invoice.providerError && (
                    <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-3 text-xs text-destructive">
                      {invoice.providerError}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t bg-card/70 px-5 py-5 sm:px-6">
                <div className="space-y-3">
                  {isPending && (
                    <div className="flex justify-center py-1">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {canSend && deliveryMethod === "email_pdf" && (
                    <SendInvoiceDialog
                      invoiceId={invoice.id}
                      invoiceNumber={invoice.invoiceNumber}
                      defaultRecipients={defaultBillingRecipients}
                      trigger={
                        <Button variant="default" className="h-11 w-full" disabled={isPending}>
                          <Send className="mr-2 h-4 w-4" />
                          {t(locale, "invoices.drawerSend")}
                        </Button>
                      }
                    />
                  )}
                  {canSend && deliveryMethod === "peppol" && (
                    <Link href={`/invoices/${invoice.id}`} onClick={onClose}>
                      <Button variant="default" className="h-11 w-full" disabled={isPending}>
                        <Send className="mr-2 h-4 w-4" />
                        {t(locale, "invoices.drawerOpenPeppol")}
                      </Button>
                    </Link>
                  )}

                  {canMarkPaid && (
                    <Button
                      variant="default"
                      className="h-11 w-full"
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
                        <Button variant="outline" className="h-11 w-full" disabled={isPending}>
                          <CheckCircle className="mr-2 h-4 w-4" />
                          {t(locale, "invoices.drawerRecordPayment")}
                        </Button>
                      }
                    />
                  )}

                  {invoice.status === "draft" && (
                    <Link href={`/invoices/${invoice.id}/edit`} onClick={onClose}>
                      <Button variant="outline" className="h-11 w-full" disabled={isPending}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t(locale, "invoices.drawerEdit")}
                      </Button>
                    </Link>
                  )}

                  {templateData && (
                    <Button
                      variant="outline"
                      className="h-11 w-full"
                      disabled={isPending}
                      onClick={handleDownloadPDF}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {t(locale, "invoices.drawerDownloadPdf")}
                    </Button>
                  )}

                  {attachedFiles.length > 0 && (
                    <Link href={`/invoices/${invoice.id}#documents`} onClick={onClose}>
                      <Button variant="outline" className="h-11 w-full" disabled={isPending}>
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
                      className="h-11 w-full"
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
                      className="h-11 w-full"
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
                      className="h-11 w-full"
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
