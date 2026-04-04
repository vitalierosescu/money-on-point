"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { recordPaymentAction } from "@/app/(app)/invoices/actions"

type PaymentDialogProps = {
  invoiceId: string
  remainingAmount: number  // in cents
  currency: string
  trigger: React.ReactNode
}

export function PaymentDialog({ invoiceId, remainingAmount, currency, trigger }: PaymentDialogProps) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState((remainingAmount / 100).toFixed(2))
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0])
  const [note, setNote] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const amountInCents = Math.round(parseFloat(amount) * 100)
    if (!amountInCents || amountInCents <= 0) { setError("Enter a valid amount"); return }
    setIsSubmitting(true)
    setError(null)
    try {
      await recordPaymentAction(invoiceId, {
        amount: amountInCents,
        paidAt: new Date(paidAt),
        note: note || undefined,
      })
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record payment")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Amount ({currency})</Label>
            <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} />
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Payment reference or memo" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Recording..." : "Record Payment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
