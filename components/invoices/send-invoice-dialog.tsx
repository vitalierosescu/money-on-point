"use client"

import { useState, useTransition, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { sendInvoiceEmailAction } from "@/app/(app)/invoices/actions"
import { toast } from "sonner"
import { Send } from "lucide-react"

interface SendInvoiceDialogProps {
  invoiceId: string
  invoiceNumber: string
  defaultEmail: string
  trigger?: React.ReactNode
}

export function SendInvoiceDialog({
  invoiceId,
  invoiceNumber,
  defaultEmail,
  trigger,
}: SendInvoiceDialogProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(defaultEmail)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setEmail(defaultEmail)
  }, [defaultEmail])

  function handleSend() {
    if (!email || !email.includes("@")) return
    startTransition(async () => {
      try {
        await sendInvoiceEmailAction(invoiceId, email)
        toast.success(`Factuur ${invoiceNumber} verzonden naar ${email}`)
        setOpen(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Verzenden mislukt")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isPending) setOpen(next) }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="w-full">
            <Send className="h-4 w-4 mr-2" />
            Verzenden
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Factuur verzenden</DialogTitle>
          <DialogDescription>
            Factuur {invoiceNumber} wordt als PDF per e-mail verstuurd.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="recipient-email">Ontvanger</Label>
            <Input
              id="recipient-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="klant@bedrijf.be"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Annuleren
          </Button>
          <Button onClick={handleSend} disabled={isPending || !email}>
            {isPending ? "Bezig..." : "Verzenden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
