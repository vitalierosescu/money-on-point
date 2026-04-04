"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { PaymentDialog } from "@/components/invoices/payment-dialog"
import {
  markInvoiceSentAction,
  markInvoicePaidAction,
  cancelInvoiceAction,
  deleteInvoiceAction,
} from "@/app/(app)/invoices/actions"
import { InvoiceWithCustomer } from "@/models/invoices"
import Link from "next/link"

export function InvoiceActions({ invoice }: { invoice: InvoiceWithCustomer }) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const run = async (action: () => Promise<unknown>) => {
    setIsLoading(true)
    try { await action() } finally { setIsLoading(false) }
  }

  const remaining = invoice.total - invoice.paidAmount

  if (invoice.status === "draft") {
    return (
      <div className="flex flex-col gap-2">
        <Link href={`/invoices/${invoice.id}/edit`}>
          <Button variant="outline" className="w-full">Edit</Button>
        </Link>
        <Button
          className="w-full"
          disabled={isLoading}
          onClick={() => run(() => markInvoiceSentAction(invoice.id))}
        >
          Mark as Sent
        </Button>
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
}
