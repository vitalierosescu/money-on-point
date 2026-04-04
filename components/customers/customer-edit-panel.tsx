"use client"

import { createCustomerAction, updateCustomerAction } from "@/app/(app)/customers/actions"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Customer } from "@/prisma/client"
import { ChevronDown } from "lucide-react"
import { useState } from "react"

interface CustomerEditPanelProps {
  customer?: Customer | null
  trigger: React.ReactNode
  onSuccess?: () => void
}

export function CustomerEditPanel({ customer, trigger, onSuccess }: CustomerEditPanelProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const form = e.currentTarget
    const fd = new FormData(form)

    const billingEmailsRaw = fd.get("billingEmailsRaw") as string
    const billingEmails = billingEmailsRaw
      ? billingEmailsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : []

    const data = {
      name: fd.get("name") as string,
      email: (fd.get("email") as string) || null,
      billingEmails,
      phone: (fd.get("phone") as string) || null,
      website: (fd.get("website") as string) || null,
      contactPerson: (fd.get("contactPerson") as string) || null,
      street: (fd.get("street") as string) || null,
      houseNumber: (fd.get("houseNumber") as string) || null,
      bus: (fd.get("bus") as string) || null,
      zipCode: (fd.get("zipCode") as string) || null,
      city: (fd.get("city") as string) || null,
      country: (fd.get("country") as string) || "Belgium",
      vatNumber: (fd.get("vatNumber") as string) || null,
      defaultCurrency: (fd.get("defaultCurrency") as string) || null,
      note: (fd.get("note") as string) || null,
    }

    try {
      if (customer) {
        await updateCustomerAction(customer.id, data)
      } else {
        await createCustomerAction(data)
      }
      setOpen(false)
      onSuccess?.()
    } finally {
      setLoading(false)
    }
  }

  const billingEmailsDefault = Array.isArray(customer?.billingEmails)
    ? (customer.billingEmails as string[]).join(", ")
    : ""

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{customer ? "Edit Customer" : "Add Customer"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" defaultValue={customer?.name ?? ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="billingEmailsRaw">Billing Emails (comma-separated)</Label>
            <Input id="billingEmailsRaw" name="billingEmailsRaw" defaultValue={billingEmailsDefault} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={customer?.phone ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" defaultValue={customer?.website ?? ""} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactPerson">Contact Person</Label>
            <Input id="contactPerson" name="contactPerson" defaultValue={customer?.contactPerson ?? ""} />
          </div>

          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" className="w-full justify-between px-0">
                <span className="font-medium">Details</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="street">Street</Label>
                  <Input id="street" name="street" defaultValue={customer?.street ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="houseNumber">House Number</Label>
                  <Input id="houseNumber" name="houseNumber" defaultValue={customer?.houseNumber ?? ""} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bus">Bus</Label>
                  <Input id="bus" name="bus" defaultValue={customer?.bus ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zipCode">ZIP Code</Label>
                  <Input id="zipCode" name="zipCode" defaultValue={customer?.zipCode ?? ""} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" name="city" defaultValue={customer?.city ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" name="country" defaultValue={customer?.country ?? "Belgium"} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vatNumber">VAT Number</Label>
                  <Input id="vatNumber" name="vatNumber" defaultValue={customer?.vatNumber ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultCurrency">Default Currency</Label>
                  <Input id="defaultCurrency" name="defaultCurrency" defaultValue={customer?.defaultCurrency ?? "EUR"} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="note">Note</Label>
                <textarea
                  id="note"
                  name="note"
                  defaultValue={customer?.note ?? ""}
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : customer ? "Save Changes" : "Add Customer"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
