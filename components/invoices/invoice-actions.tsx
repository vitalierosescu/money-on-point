"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PaymentDialog } from "@/components/invoices/payment-dialog"
import { SendInvoiceDialog } from "@/components/invoices/send-invoice-dialog"
import {
  markInvoicePaidAction,
  cancelInvoiceAction,
  deleteInvoiceAction,
} from "@/app/(app)/invoices/actions"
import { InvoiceWithCustomer } from "@/models/invoices"
import Link from "next/link"

export function InvoiceActions({ invoice }: { invoice: InvoiceWithCustomer }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const run = async (action: () => Promise<unknown>) => {
    setIsLoading(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed")
    } finally {
      setIsLoading(false)
    }
  }

  const remaining = invoice.total - invoice.paidAmount

  const content = (() => {
    if (invoice.status === "draft") {
      return (
        <div className="flex flex-col gap-2">
          <Link href={`/invoices/${invoice.id}/edit`}>
            <Button variant="outline" className="w-full">Edit</Button>
          </Link>
          <SendInvoiceDialog
            invoiceId={invoice.id}
            invoiceNumber={invoice.invoiceNumber}
            defaultEmail={invoice.customer?.email ?? ""}
          />
          <Button
            variant="destructive"
            className="w-full"
            disabled={isLoading}
            onClick={async () => {
              if (!confirm("Delete this invoice?")) return
              await run(() => deleteInvoiceAction(invoice.id))
              router.push("/invoices")
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
          <PaymentDialog
            invoiceId={invoice.id}
            remainingAmount={remaining}
            currency={invoice.currency}
            trigger={<Button className="w-full">Record Payment</Button>}
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
          <SendInvoiceDialog
            invoiceId={invoice.id}
            invoiceNumber={invoice.invoiceNumber}
            defaultEmail={invoice.customer?.email ?? ""}
            trigger={
              <Button variant="outline" className="w-full">
                <Send className="h-4 w-4 mr-2" />
                Opnieuw verzenden
              </Button>
            }
          />
        </div>
      )
    }

    if (invoice.status === "paid") {
      return (
        <div className="flex flex-col gap-2">
          <Button variant="outline" className="w-full" disabled>Paid</Button>
        </div>
      )
    }

    if (invoice.status === "cancelled") {
      return (
        <div className="flex flex-col gap-2">
          <Link href={`/invoices/new`}>
            <Button variant="outline" className="w-full">Create New Invoice</Button>
          </Link>
        </div>
      )
    }

    return null
  })()

  return (
    <div>
      {content}
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
    </div>
  )
}
