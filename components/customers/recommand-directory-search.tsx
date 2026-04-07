"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  searchRecommandDirectoryAction,
  lookupRecommandByVatAction,
  verifyRecommandRecipientAction,
} from "@/app/(app)/customers/actions"

export type DirectoryPick = {
  name: string
  country: string | null
  vatNumber: string | null
  peppolId: string | null
  peppolVerified: boolean
  street: string | null
  houseNumber: string | null
  zipCode: string | null
  city: string | null
}

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

const VAT_LIKE_REGEX = /^[A-Z]{0,2}\s*\d[\d\s.\-]{7,}$/i

function looksLikeVat(input: string): boolean {
  return VAT_LIKE_REGEX.test(input.trim())
}

type Props = {
  /** Optional initial query (e.g. existing customer's name when editing). */
  initialQuery?: string
  /** Called when user picks a hit. Parent prefills its form. */
  onPick: (pick: DirectoryPick) => void
  /** Optional label override. */
  label?: string
  /** Optional placeholder override. */
  placeholder?: string
}

export function RecommandDirectorySearch({
  initialQuery = "",
  onPick,
  label = "Search Peppol directory",
  placeholder = "Type at least 3 characters or paste a VAT number",
}: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [state, setState] = useState<DirectoryState>({ kind: "idle" })
  const [picking, setPicking] = useState<string | null>(null)
  const [lastPickedVerified, setLastPickedVerified] = useState<boolean | null>(null)
  const seqRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  const runSearch = (rawValue: string) => {
    const value = rawValue.trim()
    const seq = ++seqRef.current

    if (value.length < 3) {
      setState({ kind: "idle" })
      return
    }

    setState({ kind: "loading" })

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
      if (seq !== seqRef.current) return
      if (!result.success) {
        if (/not configured/i.test(result.error)) {
          setState({ kind: "disabled" })
        } else {
          setState({ kind: "error", message: result.error })
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
      setState({ kind: "results", hits })
    })
  }

  const handleChange = (value: string) => {
    setQuery(value)
    setLastPickedVerified(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runSearch(value), 300)
  }

  const handleSelectHit = async (hit: DirectoryHit) => {
    setPicking(hit.peppolAddress)
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

      setQuery(canonicalName)
      setState({ kind: "idle" })
      setLastPickedVerified(peppolReachable)
      onPick({
        name: canonicalName,
        country,
        vatNumber: hit.formattedNumber,
        peppolId: hit.peppolAddress,
        peppolVerified: peppolReachable,
        street: vies?.street ?? null,
        houseNumber: vies?.houseNumber ?? null,
        zipCode: vies?.postalCode ?? null,
        city: vies?.city ?? null,
      })
    } finally {
      setPicking(null)
    }
  }

  if (state.kind === "disabled") {
    return null // Recommand not configured — silently hide and let manual entry work.
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />

      {state.kind === "loading" && (
        <div className="border rounded-lg divide-y">
          {[0, 1, 2].map((i) => (
            <div key={i} className="p-3 animate-pulse">
              <div className="h-3 w-32 bg-muted rounded mb-2" />
              <div className="h-2 w-48 bg-muted rounded" />
            </div>
          ))}
        </div>
      )}

      {state.kind === "results" && state.hits.length > 0 && (
        <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
          {state.hits.map((hit) => {
            const isPicking = picking === hit.peppolAddress
            return (
              <button
                key={hit.peppolAddress}
                type="button"
                disabled={isPicking}
                onClick={() => handleSelectHit(hit)}
                className="w-full text-left p-3 hover:bg-muted disabled:opacity-50 flex items-start gap-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {hit.name.charAt(0).toUpperCase()}
                </div>
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

      {state.kind === "results" && state.hits.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No matches in the Peppol directory. Fill in the details manually below.
        </p>
      )}

      {state.kind === "error" && (
        <p className="text-xs text-amber-600">
          Couldn&apos;t reach the Peppol directory ({state.message}). Fill in the details manually below.
        </p>
      )}

      {lastPickedVerified === true && (
        <p className="text-xs text-emerald-700">
          ✓ Verified Peppol recipient — invoice delivery supported.
        </p>
      )}
      {lastPickedVerified === false && (
        <p className="text-xs text-amber-600">
          Found in directory but Peppol invoice delivery not confirmed. Email delivery still works.
        </p>
      )}
    </div>
  )
}
