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
import { sendInvoiceCourtesyEmailAction, sendInvoiceEmailAction } from "@/app/(app)/invoices/actions"
import { parseEmailRecipients } from "@/lib/invoice-delivery"
import { toast } from "sonner"
import { Send } from "lucide-react"

interface SendInvoiceDialogProps {
  invoiceId: string
  invoiceNumber: string
  defaultRecipients: string[]
  kind?: "official" | "courtesy"
  trigger?: React.ReactNode
}

export function SendInvoiceDialog({
  invoiceId,
  invoiceNumber,
  defaultRecipients,
  kind = "official",
  trigger,
}: SendInvoiceDialogProps) {
  const [open, setOpen] = useState(false)
  const [recipients, setRecipients] = useState(defaultRecipients.join(", "))
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setRecipients(defaultRecipients.join(", "))
  }, [defaultRecipients])

  function handleSend() {
    const parsedRecipients = parseEmailRecipients(recipients)
    if (parsedRecipients.length === 0) return
    startTransition(async () => {
      try {
        const result =
          kind === "courtesy"
            ? await sendInvoiceCourtesyEmailAction(invoiceId, parsedRecipients)
            : await sendInvoiceEmailAction(invoiceId, parsedRecipients)

        if (!result.success) {
          toast.error(result.error || "Verzenden mislukt")
          return
        }

        toast.success(
          kind === "courtesy"
            ? `Kopie van factuur ${invoiceNumber} verzonden`
            : `Factuur ${invoiceNumber} verzonden`
        )
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
          <DialogTitle>{kind === "courtesy" ? "Factuurkopie verzenden" : "Factuur verzenden"}</DialogTitle>
          <DialogDescription>
            {kind === "courtesy"
              ? `Factuur ${invoiceNumber} wordt als PDF-kopie per e-mail verstuurd.`
              : `Factuur ${invoiceNumber} wordt als PDF per e-mail verstuurd.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="recipient-email">Ontvangers</Label>
            <Input
              id="recipient-email"
              type="text"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="klant@bedrijf.be, finance@bedrijf.be"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Annuleren
          </Button>
          <Button onClick={handleSend} disabled={isPending || parseEmailRecipients(recipients).length === 0}>
            {isPending ? "Bezig..." : "Verzenden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
