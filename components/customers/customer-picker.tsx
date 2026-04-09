"use client"

import { useEffect, useRef, useState } from "react"
import { Customer } from "@/prisma/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  createCustomerAction,
  searchRecommandDirectoryAction,
  lookupRecommandByVatAction,
  verifyRecommandRecipientAction,
} from "@/app/(app)/customers/actions"
import { CustomerAvatar } from "@/components/customers/customer-avatar"
import { CustomerEditPanel } from "@/components/customers/customer-edit-panel"

type DirectoryHit = {
  peppolAddress: string
  name: string
  formattedNumber: string | null
  countryCode: string | null
  supportsInvoice: boolean
}

type DirectoryState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; hits: DirectoryHit[] }
  | { kind: "error"; message: string }
  | { kind: "disabled" }

type CustomerPickerProps = {
  customers: Customer[]
  selectedCustomer: Customer | null
  onSelect: (customer: Customer | null) => void
}

const VAT_LIKE_REGEX = /^[A-Z]{0,2}\s*\d[\d\s.\-]{7,}$/i

function looksLikeVat(input: string): boolean {
  return VAT_LIKE_REGEX.test(input.trim())
}

export function CustomerPicker({ customers, selectedCustomer, onSelect }: CustomerPickerProps) {
  const [activeTab, setActiveTab] = useState<"existing" | "new">("existing")
  const [search, setSearch] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localCustomers, setLocalCustomers] = useState(customers)

  const [newCustomer, setNewCustomer] = useState({
    name: "",
    country: "Belgium",
    vatNumber: "",
    street: "",
    houseNumber: "",
    zipCode: "",
    city: "",
    email: "",
    peppolVerified: false as boolean | null,
    recommandDirectorySource: null as null | "directory" | "manual",
  })

  // Directory search state
  const [directoryState, setDirectoryState] = useState<DirectoryState>({ kind: "idle" })
  const [pickingPeppolAddress, setPickingPeppolAddress] = useState<string | null>(null)
  const searchSeqRef = useRef(0)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalCustomers(customers)
  }, [customers])

  const filtered = localCustomers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email?.toLowerCase().includes(search.toLowerCase()))
  )

  // ---------- Directory search ----------

  const runDirectorySearch = (rawValue: string) => {
    const value = rawValue.trim()
    const seq = ++searchSeqRef.current

    if (value.length < 3) {
      setDirectoryState({ kind: "idle" })
      return
    }

    setDirectoryState({ kind: "loading" })

    const isVat = looksLikeVat(value)
    const promise = isVat
      ? lookupRecommandByVatAction(value).then((result) => {
          if (!result.success) return result
          return {
            success: true as const,
            data: { hits: result.data.hit ? [result.data.hit] : [] },
          }
        })
      : searchRecommandDirectoryAction(value)

    promise.then((result) => {
      if (seq !== searchSeqRef.current) return // stale
      if (!result.success) {
        if (/not configured/i.test(result.error)) {
          setDirectoryState({ kind: "disabled" })
        } else {
          setDirectoryState({ kind: "error", message: result.error })
        }
        return
      }
      const hits: DirectoryHit[] = result.data.hits.map((h) => ({
        peppolAddress: h.peppolAddress,
        name: h.name,
        formattedNumber: h.formattedNumber,
        countryCode: h.countryCode,
        supportsInvoice: h.supportsInvoice,
      }))
      setDirectoryState({ kind: "results", hits })
    })
  }

  const handleNameChange = (value: string) => {
    setNewCustomer((p) => ({ ...p, name: value, peppolVerified: false, recommandDirectorySource: null }))
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => runDirectorySearch(value), 300)
  }

  const handleSelectHit = async (hit: DirectoryHit) => {
    // Local duplicate guard
    const existing = localCustomers.find(
      (c) => c.vatNumber && hit.formattedNumber && c.vatNumber.replace(/\s/g, "").toUpperCase() === hit.formattedNumber.toUpperCase()
    )
    if (existing) {
      onSelect(existing)
      return
    }

    setPickingPeppolAddress(hit.peppolAddress)
    try {
      const verifyResult = await verifyRecommandRecipientAction(hit.peppolAddress)
      const peppolReachable = verifyResult.success
        ? verifyResult.data.verification.isValid &&
          (verifyResult.data.documentSupport?.isValid ?? hit.supportsInvoice)
        : hit.supportsInvoice

      const vies = verifyResult.success ? verifyResult.data.vies : null
      const canonicalName = vies?.name
        ?? (verifyResult.success ? verifyResult.data.verification.companyName ?? hit.name : hit.name)
      const country = verifyResult.success
        ? verifyResult.data.verification.countryCode ?? hit.countryCode
        : hit.countryCode

      setNewCustomer((p) => ({
        ...p,
        name: canonicalName,
        country: country ?? p.country,
        vatNumber: hit.formattedNumber ?? p.vatNumber,
        street: vies?.street ?? p.street,
        houseNumber: vies?.houseNumber ?? p.houseNumber,
        zipCode: vies?.postalCode ?? p.zipCode,
        city: vies?.city ?? p.city,
        peppolVerified: peppolReachable,
        recommandDirectorySource: "directory",
      }))
      setDirectoryState({ kind: "idle" })
    } finally {
      setPickingPeppolAddress(null)
    }
  }

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
        peppolVerified: newCustomer.peppolVerified ?? null,
        peppolVerifiedAt: newCustomer.peppolVerified ? new Date() : null,
        recommandDirectorySource: newCustomer.recommandDirectorySource ?? "manual",
      })
      if (result.success && result.data) {
        setLocalCustomers((prev) =>
          [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name))
        )
        onSelect(result.data)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (selectedCustomer) {
    return (
      // Compact selected-customer chip: small avatar, tight text,
      // buttons grouped at the end. Avoids the previous layout where
      // "Robbe Verhoest" was wrapping to 2 lines next to an oversized
      // avatar and the Edit/Change buttons were crammed against it.
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2">
        <div className="flex min-w-0 items-center gap-2">
          <CustomerAvatar
            name={selectedCustomer.name}
            website={selectedCustomer.website}
            size="sm"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selectedCustomer.name}</p>
            {selectedCustomer.email && (
              <p className="truncate text-xs text-muted-foreground">{selectedCustomer.email}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <CustomerEditPanel
            customer={selectedCustomer}
            onSuccess={(updated) => {
              setLocalCustomers((prev) =>
                prev.map((customer) => (customer.id === updated.id ? updated : customer))
              )
              onSelect(updated)
            }}
            trigger={
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                Edit
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onSelect(null)}
          >
            Change
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Tab navigation — compact so both tabs fit side-by-side inside
          a narrow Klant card without truncating to "Existing Custom..."
          and "Cu..." */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setActiveTab("existing")}
          className={`px-2 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "existing"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Existing
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("new")}
          className={`px-2 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "new"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          New
        </button>
      </div>

      {/* Existing customer tab — compact rows: smaller avatar, tighter
          padding, smaller text. The container keeps min-w-0 + truncate
          everywhere so long customer names shrink gracefully instead of
          forcing horizontal overflow or multi-line wraps. */}
      {activeTab === "existing" && (
        <div className="space-y-2">
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="border rounded-lg max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">No customers found.</p>
            ) : (
              filtered.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  className="w-full text-left px-2 py-1.5 hover:bg-muted border-b last:border-0 flex items-center gap-2 min-w-0"
                  onClick={() => onSelect(customer)}
                >
                  <CustomerAvatar name={customer.name} website={customer.website} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{customer.name}</p>
                    {customer.email && (
                      <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                    )}
                  </div>
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
            <Label>Company name or VAT number</Label>
            <Input
              value={newCustomer.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Type at least 3 characters or paste a VAT number"
              autoComplete="off"
            />

            {/* Directory results */}
            {directoryState.kind === "loading" && (
              <div className="border rounded-lg divide-y">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="p-3 animate-pulse">
                    <div className="h-3 w-32 bg-muted rounded mb-2" />
                    <div className="h-2 w-48 bg-muted rounded" />
                  </div>
                ))}
              </div>
            )}

            {directoryState.kind === "results" && directoryState.hits.length > 0 && (
              <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                {directoryState.hits.map((hit) => {
                  const isPicking = pickingPeppolAddress === hit.peppolAddress
                  return (
                    <button
                      key={hit.peppolAddress}
                      type="button"
                      disabled={isPicking}
                      onClick={() => handleSelectHit(hit)}
                      className="w-full text-left p-3 hover:bg-muted disabled:opacity-50 flex items-start gap-3"
                    >
                      <CustomerAvatar name={hit.name} website={null} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{hit.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {hit.formattedNumber ?? hit.peppolAddress}
                        </p>
                      </div>
                      {hit.supportsInvoice && (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          Peppol
                        </span>
                      )}
                      {isPicking && (
                        <span className="shrink-0 text-xs text-muted-foreground">Verifying…</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {directoryState.kind === "results" && directoryState.hits.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No matches in the Peppol directory. Fill in the details manually below.
              </p>
            )}

            {directoryState.kind === "error" && (
              <p className="text-xs text-amber-600">
                Couldn't reach the Peppol directory ({directoryState.message}). Fill in the details manually below.
              </p>
            )}

            {newCustomer.recommandDirectorySource === "directory" && newCustomer.peppolVerified && (
              <p className="text-xs text-emerald-700">
                ✓ Verified Peppol recipient — invoice delivery supported.
              </p>
            )}
            {newCustomer.recommandDirectorySource === "directory" && !newCustomer.peppolVerified && (
              <p className="text-xs text-amber-600">
                Found in directory but Peppol invoice delivery not confirmed. Email delivery still works.
              </p>
            )}
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
