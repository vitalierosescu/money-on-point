"use client"

import { useState } from "react"
import { Customer } from "@/prisma/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { createCustomerAction } from "@/app/(app)/customers/actions"

type CustomerPickerProps = {
  customers: Customer[]
  selectedCustomer: Customer | null
  onSelect: (customer: Customer | null) => void
}

export function CustomerPicker({ customers, selectedCustomer, onSelect }: CustomerPickerProps) {
  const [activeTab, setActiveTab] = useState<"existing" | "new">("existing")
  const [search, setSearch] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [newCustomer, setNewCustomer] = useState({
    name: "",
    country: "Belgium",
    vatNumber: "",
    street: "",
    houseNumber: "",
    zipCode: "",
    city: "",
    email: "",
  })

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email?.toLowerCase().includes(search.toLowerCase()))
  )

  const handleCreate = async () => {
    if (!newCustomer.name) return
    setIsSubmitting(true)
    try {
      const result = await createCustomerAction({
        name: newCustomer.name,
        country: newCustomer.country || null,
        vatNumber: newCustomer.vatNumber || null,
        street: newCustomer.street || null,
        houseNumber: newCustomer.houseNumber || null,
        zipCode: newCustomer.zipCode || null,
        city: newCustomer.city || null,
        email: newCustomer.email || null,
      })
      if (result.success && result.data) {
        onSelect(result.data)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (selectedCustomer) {
    return (
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div>
          <p className="font-medium">{selectedCustomer.name}</p>
          {selectedCustomer.email && (
            <p className="text-sm text-muted-foreground">{selectedCustomer.email}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => onSelect(null)}>
          Change
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Tab navigation */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setActiveTab("existing")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "existing"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Existing Customer
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("new")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "new"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          New Customer
        </button>
      </div>

      {/* Existing customer tab */}
      {activeTab === "existing" && (
        <div className="space-y-2">
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="border rounded-lg max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No customers found.</p>
            ) : (
              filtered.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  className="w-full text-left p-3 hover:bg-muted border-b last:border-0"
                  onClick={() => onSelect(customer)}
                >
                  <p className="font-medium">{customer.name}</p>
                  {customer.email && (
                    <p className="text-xs text-muted-foreground">{customer.email}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* New customer tab */}
      {activeTab === "new" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              value={newCustomer.name}
              onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
              placeholder="Company or person name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Country</Label>
              <Input
                value={newCustomer.country}
                onChange={(e) => setNewCustomer((p) => ({ ...p, country: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>VAT Number</Label>
              <Input
                value={newCustomer.vatNumber}
                onChange={(e) => setNewCustomer((p) => ({ ...p, vatNumber: e.target.value }))}
                placeholder="BE0123456789"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Street</Label>
              <Input
                value={newCustomer.street}
                onChange={(e) => setNewCustomer((p) => ({ ...p, street: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>House No.</Label>
              <Input
                value={newCustomer.houseNumber}
                onChange={(e) => setNewCustomer((p) => ({ ...p, houseNumber: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>ZIP</Label>
              <Input
                value={newCustomer.zipCode}
                onChange={(e) => setNewCustomer((p) => ({ ...p, zipCode: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input
                value={newCustomer.city}
                onChange={(e) => setNewCustomer((p) => ({ ...p, city: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={newCustomer.email}
              onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))}
            />
          </div>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={isSubmitting || !newCustomer.name}
            className="w-full"
          >
            {isSubmitting ? "Creating..." : "Create & Select Customer"}
          </Button>
        </div>
      )}
    </div>
  )
}
