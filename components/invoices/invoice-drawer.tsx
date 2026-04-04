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
import { InvoiceFormData } from "@/app/(app)/apps/invoices/components/invoice-page"
import { Prisma } from "@/prisma/client"
import { ExternalLink, Loader2, Pencil, Send, CheckCircle, XCircle, Trash2 } from "lucide-react"
import Link from "next/link"
import {
  markInvoiceSentAction,
  markInvoicePaidAction,
  cancelInvoiceAction,
  deleteInvoiceAction,
} from "@/app/(app)/invoices/actions"

type InvoiceWithCustomer = Prisma.InvoiceGetPayload<{ include: { customer: true } }>

type InvoiceDrawerProps = {
  invoice: InvoiceWithCustomer
  open: boolean
  onClose: () => void
}

export function InvoiceDrawer({ invoice, open, onClose }: InvoiceDrawerProps) {
  const [isPending, startTransition] = useTransition()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const templateData = invoice.templateData
    ? (invoice.templateData as unknown as InvoiceFormData)
    : null

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action()
      onClose()
    })
  }

  const canSend = invoice.status === "draft"
  const canMarkPaid =
    invoice.status === "sent" ||
    invoice.status === "overdue" ||
    invoice.status === "partially_paid"
  const canCancel = invoice.status !== "cancelled" && invoice.status !== "paid"

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
              <Link href={`/invoices/${invoice.id}/edit`} onClick={onClose}>
                <Button variant="ghost" size="icon">
                  <Pencil className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </SheetHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* Left: invoice preview */}
            <div className="flex-1 overflow-y-auto border-r bg-gray-50 flex flex-col">
              <div className="flex-1">
                {templateData ? (
                  <InvoicePreview templateData={templateData} />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground p-8">
                    <p>No preview available</p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t bg-white">
                <Link href={`/invoices/${invoice.id}`} onClick={onClose}>
                  <Button variant="outline" className="w-full">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open full page
                  </Button>
                </Link>
              </div>
            </div>

            {/* Right: details + actions */}
            <div className="w-64 flex flex-col overflow-y-auto">
              <div className="flex-1 p-4 space-y-3 text-sm">
                <div className="font-semibold text-base">{invoice.customer?.name ?? "—"}</div>
                {(
                  [
                    [
                      "Date",
                      invoice.issuedAt
                        ? new Date(invoice.issuedAt).toLocaleDateString("nl-BE")
                        : "—",
                    ],
                    [
                      "Due date",
                      invoice.dueDate
                        ? new Date(invoice.dueDate).toLocaleDateString("nl-BE")
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
                  <span>Total</span>
                  <span>
                    {invoice.currency} {(invoice.total / 100).toFixed(2)}
                  </span>
                </div>
                {invoice.paidAmount > 0 && (
                  <div className="flex justify-between py-1 border-b text-green-600">
                    <span>Paid</span>
                    <span>
                      {invoice.currency} {(invoice.paidAmount / 100).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-4 border-t space-y-2">
                {isPending && (
                  <div className="flex justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}

                {canSend && (
                  <Button
                    variant="default"
                    className="w-full"
                    disabled={isPending}
                    onClick={() => run(() => markInvoiceSentAction(invoice.id))}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Mark as sent
                  </Button>
                )}

                {canMarkPaid && (
                  <Button
                    variant="default"
                    className="w-full"
                    disabled={isPending}
                    onClick={() => run(() => markInvoicePaidAction(invoice.id, new Date()))}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Mark as paid
                  </Button>
                )}

                <Link href={`/invoices/${invoice.id}/edit`} onClick={onClose}>
                  <Button variant="outline" className="w-full" disabled={isPending}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </Link>

                {canCancel && (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={isPending}
                    onClick={() => run(() => cancelInvoiceAction(invoice.id))}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                )}

                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={isPending}
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete invoice?</DialogTitle>
            <DialogDescription>
              This will permanently delete invoice {invoice.invoiceNumber}. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={isPending} onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                setShowDeleteConfirm(false)
                run(() => deleteInvoiceAction(invoice.id))
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
