"use client"

import { useState, useMemo } from "react"
import { Customer, Currency, User } from "@/prisma/client"
import { SettingsMap } from "@/models/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CustomerPicker } from "@/components/customers/customer-picker"
import { createInvoiceAction } from "@/app/(app)/invoices/actions"
import { Loader2, X } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

type InvoiceFormProps = {
  customers: Customer[]
  currencies: Currency[]
  nextInvoiceNumber: string
  settings: SettingsMap
  user: User
}

type LineItem = {
  name: string
  subtitle: string
  showSubtitle: boolean
  quantity: number
  unitPrice: number
  taxRate: number
  subtotal: number
}

function getToday(): string {
  return new Date().toISOString().split("T")[0]
}

function getDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().split("T")[0]
}

export function InvoiceForm({ customers, currencies, nextInvoiceNumber, settings }: InvoiceFormProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [invoiceNumber, setInvoiceNumber] = useState(nextInvoiceNumber)
  const [currency, setCurrency] = useState(currencies[0]?.code || "EUR")
  const [issuedAt, setIssuedAt] = useState(getToday())
  const [dueDate, setDueDate] = useState(getDueDate())
  const [paymentReference, setPaymentReference] = useState("")
  const [poNumber, setPoNumber] = useState("")
  const [subject, setSubject] = useState("")
  const [items, setItems] = useState<LineItem[]>([
    { name: "", subtitle: "", showSubtitle: false, quantity: 1, unitPrice: 0, taxRate: 21, subtotal: 0 },
  ])
  const [notes, setNotes] = useState(settings.invoice_default_payment_terms || "")
  const [isVatReversed, setIsVatReversed] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [items]
  )

  const taxTotal = useMemo(
    () =>
      isVatReversed
        ? 0
        : items.reduce((sum, item) => sum + (item.quantity * item.unitPrice * item.taxRate) / 100, 0),
    [items, isVatReversed]
  )

  const total = subtotal + taxTotal

  const updateItem = (index: number, field: keyof LineItem, value: string | number | boolean) => {
    setItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      if (field === "quantity" || field === "unitPrice") {
        updated[index].subtotal = Number(updated[index].quantity) * Number(updated[index].unitPrice)
      }
      return updated
    })
  }

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { name: "", subtitle: "", showSubtitle: false, quantity: 1, unitPrice: 0, taxRate: 21, subtotal: 0 },
    ])
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async (status: "draft" | "sent") => {
    if (!selectedCustomer) {
      alert("Please select a customer")
      return
    }
    setIsSaving(true)
    try {
      const billTo = selectedCustomer ? [
        selectedCustomer.name,
        selectedCustomer.street && selectedCustomer.houseNumber
          ? `${selectedCustomer.street} ${selectedCustomer.houseNumber}${selectedCustomer.bus ? ` ${selectedCustomer.bus}` : ""}`
          : "",
        selectedCustomer.zipCode && selectedCustomer.city
          ? `${selectedCustomer.zipCode} ${selectedCustomer.city}`
          : "",
        selectedCustomer.country || "",
        selectedCustomer.vatNumber ? `BTW: ${selectedCustomer.vatNumber}` : "",
      ].filter(Boolean).join("\n") : ""
      const result = await createInvoiceAction({
        customerId: selectedCustomer.id,
        invoiceNumber,
        status,
        issuedAt: new Date(issuedAt),
        dueDate: new Date(dueDate),
        currency,
        subtotal: Math.round(subtotal * 100),
        taxTotal: Math.round(taxTotal * 100),
        total: Math.round(total * 100),
        items: items.map((i) => ({ ...i, subtotal: i.quantity * i.unitPrice })),
        paymentReference: paymentReference || null,
        poNumber: poNumber || null,
        subject: subject || null,
        notes: notes || null,
        paymentTerms: null,
        isVatReversed,
        templateData: { billTo },
      })
      if (result.success) {
        window.location.href = `/invoices/${result.data.id}`
      }
    } finally {
      setIsSaving(false)
    }
  }

  // Group tax rates for breakdown display
  const taxBreakdown = useMemo(() => {
    if (isVatReversed) return []
    const map: Record<number, number> = {}
    for (const item of items) {
      const amt = (item.quantity * item.unitPrice * item.taxRate) / 100
      map[item.taxRate] = (map[item.taxRate] || 0) + amt
    }
    return Object.entries(map)
      .filter(([, amt]) => amt > 0)
      .map(([rate, amt]) => ({ rate: Number(rate), amount: amt }))
  }, [items, isVatReversed])

  return (
    <div className="space-y-8">
      {/* Customer */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Customer</h3>
        <CustomerPicker
          customers={customers}
          selectedCustomer={selectedCustomer}
          onSelect={setSelectedCustomer}
        />
      </section>

      {/* Document Info */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">Document Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Invoice Number</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Currency</Label>
            {currencies.length > 0 ? (
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="EUR" />
            )}
          </div>
          <div className="space-y-1">
            <Label>Invoice Date</Label>
            <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Payment Reference <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="e.g. IBAN or structured reference"
            />
          </div>
          <div className="space-y-1">
            <Label>PO Number <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              placeholder="Purchase order number"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Subject <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Invoice subject or project name"
            />
          </div>
        </div>
      </section>

      {/* Line Items */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Line Items</h3>
        <div className="border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[1fr_80px_110px_80px_90px_36px] gap-2 bg-muted px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div>Description</div>
            <div className="text-right">Qty</div>
            <div className="text-right">Unit Price</div>
            <div className="text-right">Tax %</div>
            <div className="text-right">Subtotal</div>
            <div />
          </div>

          {/* Rows */}
          <div className="divide-y">
            {items.map((item, index) => (
              <div key={index} className="px-4 py-3 flex flex-col sm:grid sm:grid-cols-[1fr_80px_110px_80px_90px_36px] sm:items-center gap-2">
                <div className="flex flex-col gap-1">
                  <Input
                    value={item.name}
                    onChange={(e) => updateItem(index, "name", e.target.value)}
                    placeholder="Item description"
                    className="h-8"
                  />
                  {!item.showSubtitle ? (
                    <button
                      type="button"
                      onClick={() => updateItem(index, "showSubtitle", true)}
                      className="text-xs text-muted-foreground hover:text-foreground text-left"
                    >
                      + Add subtitle
                    </button>
                  ) : (
                    <Input
                      value={item.subtitle}
                      onChange={(e) => updateItem(index, "subtitle", e.target.value)}
                      placeholder="Subtitle (optional)"
                      className="h-7 text-xs"
                    />
                  )}
                </div>
                <div className="flex sm:block gap-2 items-center">
                  <span className="sm:hidden text-xs text-muted-foreground w-16">Qty</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                    className="h-8 text-right"
                  />
                </div>
                <div className="flex sm:block gap-2 items-center">
                  <span className="sm:hidden text-xs text-muted-foreground w-16">Unit Price</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(index, "unitPrice", Number(e.target.value))}
                    className="h-8 text-right"
                  />
                </div>
                <div className="flex sm:block gap-2 items-center">
                  <span className="sm:hidden text-xs text-muted-foreground w-16">Tax %</span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={item.taxRate}
                    onChange={(e) => updateItem(index, "taxRate", Number(e.target.value))}
                    className="h-8 text-right"
                    disabled={isVatReversed}
                  />
                </div>
                <div className="flex sm:flex items-center justify-end sm:justify-end text-sm font-medium">
                  {formatCurrency(item.quantity * item.unitPrice * 100, currency)}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="h-7 w-7 rounded-full"
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 border-t">
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              + Add Item
            </Button>
          </div>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-full sm:w-72 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(Math.round(subtotal * 100), currency)}</span>
            </div>
            {taxBreakdown.map(({ rate, amount }) => (
              <div key={rate} className="flex justify-between">
                <span className="text-muted-foreground">VAT {rate}%</span>
                <span>{formatCurrency(Math.round(amount * 100), currency)}</span>
              </div>
            ))}
            {isVatReversed && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT (verlegd)</span>
                <span>{formatCurrency(0, currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t pt-2">
              <span>Total</span>
              <span>{formatCurrency(Math.round(total * 100), currency)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Options */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">Options</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isVatReversed}
            onChange={(e) => setIsVatReversed(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span className="text-sm">BTW verlegd (VAT reverse charge)</span>
        </label>
        <div className="space-y-1">
          <Label>Notes / Payment Terms</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Payment terms, bank details, or additional notes"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
        </div>
      </section>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2 pb-8">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleSave("draft")}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save as Draft
        </Button>
        <Button
          type="button"
          onClick={() => handleSave("sent")}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save & Mark as Sent
        </Button>
      </div>
    </div>
  )
}
