"use client"

import { createCustomerAction, updateCustomerAction } from "@/app/(app)/customers/actions"
import {
  getCustomerInvoiceDeliveryMethodLabel,
  normalizeCustomerInvoiceDeliveryMethod,
} from "@/lib/invoice-delivery"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Customer } from "@/prisma/client"
import { useState } from "react"
import { RecommandDirectorySearch } from "@/components/customers/recommand-directory-search"

interface CustomerEditPanelProps {
  customer?: Customer | null
  trigger: React.ReactNode
  onSuccess?: (customer: Customer) => void
}

export function CustomerEditPanel({ customer, trigger, onSuccess }: CustomerEditPanelProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fields the Peppol directory can prefill — controlled so picks override defaults.
  const [name, setName] = useState(customer?.name ?? "")
  const [country, setCountry] = useState(customer?.country ?? "Belgium")
  const [vatNumber, setVatNumber] = useState(customer?.vatNumber ?? "")
  const [peppolId, setPeppolId] = useState(customer?.peppolId ?? "")
  const [street, setStreet] = useState(customer?.street ?? "")
  const [houseNumber, setHouseNumber] = useState(customer?.houseNumber ?? "")
  const [zipCode, setZipCode] = useState(customer?.zipCode ?? "")
  const [city, setCity] = useState(customer?.city ?? "")
  const [peppolVerified, setPeppolVerified] = useState<boolean | null>(
    customer?.peppolVerified ?? null
  )
  const [directoryPicked, setDirectoryPicked] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = e.currentTarget
    const fd = new FormData(form)

    const billingEmailsRaw = fd.get("billingEmailsRaw") as string
    const billingEmails = billingEmailsRaw
      ? billingEmailsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : []

    const data = {
      name,
      email: (fd.get("email") as string) || null,
      billingEmails,
      phone: (fd.get("phone") as string) || null,
      website: (fd.get("website") as string) || null,
      contactPerson: (fd.get("contactPerson") as string) || null,
      street: street || null,
      houseNumber: houseNumber || null,
      bus: (fd.get("bus") as string) || null,
      zipCode: zipCode || null,
      city: city || null,
      country: country || "Belgium",
      vatNumber: vatNumber || null,
      peppolId: peppolId || null,
      peppolVerified,
      peppolVerifiedAt: directoryPicked && peppolVerified ? new Date() : customer?.peppolVerifiedAt ?? null,
      recommandDirectorySource: directoryPicked
        ? "directory"
        : customer?.recommandDirectorySource ?? "manual",
      invoiceDeliveryMethod: normalizeCustomerInvoiceDeliveryMethod(fd.get("invoiceDeliveryMethod") as string),
      defaultCurrency: (fd.get("defaultCurrency") as string) || null,
      note: (fd.get("note") as string) || null,
    }

    try {
      let result: { success: boolean; data?: Customer }
      if (customer) {
        result = await updateCustomerAction(customer.id, data)
      } else {
        result = await createCustomerAction(data)
      }
      setOpen(false)
      if (result.data) {
        onSuccess?.(result.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  const billingEmailsDefault = Array.isArray(customer?.billingEmails)
    ? (customer.billingEmails as string[]).join(", ")
    : ""
  const deliveryMethod = normalizeCustomerInvoiceDeliveryMethod(customer?.invoiceDeliveryMethod)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{customer ? "Edit Customer" : "Add Customer"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <RecommandDirectorySearch
            initialQuery={customer?.name ?? ""}
            onPick={(pick) => {
              setName(pick.name)
              if (pick.country) setCountry(pick.country)
              if (pick.vatNumber) setVatNumber(pick.vatNumber)
              if (pick.peppolId) setPeppolId(pick.peppolId)
              if (pick.street) setStreet(pick.street)
              if (pick.houseNumber) setHouseNumber(pick.houseNumber)
              if (pick.zipCode) setZipCode(pick.zipCode)
              if (pick.city) setCity(pick.city)
              setPeppolVerified(pick.peppolVerified)
              setDirectoryPicked(true)
            }}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="street">Street</Label>
              <Input
                id="street"
                name="street"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="houseNumber">House Number</Label>
              <Input
                id="houseNumber"
                name="houseNumber"
                value={houseNumber}
                onChange={(e) => setHouseNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bus">Bus</Label>
              <Input id="bus" name="bus" defaultValue={customer?.bus ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input
                id="zipCode"
                name="zipCode"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                name="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                name="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vatNumber">VAT Number</Label>
              <Input
                id="vatNumber"
                name="vatNumber"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="peppolId">PEPPOL ID</Label>
              <Input
                id="peppolId"
                name="peppolId"
                value={peppolId}
                onChange={(e) => setPeppolId(e.target.value)}
                placeholder="0208:0123456789"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="defaultCurrency">Default Currency</Label>
              <Input id="defaultCurrency" name="defaultCurrency" defaultValue={customer?.defaultCurrency ?? "EUR"} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceDeliveryMethod">Delivery Method</Label>
              <select
                id="invoiceDeliveryMethod"
                name="invoiceDeliveryMethod"
                defaultValue={deliveryMethod}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {(["manual_choice", "email_pdf", "peppol"] as const).map((method) => (
                  <option key={method} value={method}>
                    {getCustomerInvoiceDeliveryMethodLabel(method)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea id="note" name="note" defaultValue={customer?.note ?? ""} className="min-h-[80px]" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

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
