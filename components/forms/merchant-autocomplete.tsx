"use client"

import { listMerchantsAction } from "@/app/(app)/expenses/actions"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { t } from "@/lib/i18n"
import type { UiLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type MerchantAutocompleteProps = {
  title?: string
  name?: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  locale: UiLocale
  placeholder?: string
  className?: string
}

export function MerchantAutocomplete({
  title,
  name = "merchant",
  value,
  onChange,
  required = false,
  locale,
  placeholder,
  className,
}: MerchantAutocompleteProps) {
  const [merchants, setMerchants] = useState<string[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const ensureLoaded = useCallback(async () => {
    if (hasLoaded) return
    setHasLoaded(true)
    const result = await listMerchantsAction()
    if (result.success) {
      setMerchants(result.merchants)
    }
  }, [hasLoaded])

  // Filter options client-side based on the current value
  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase()
    if (!query) return merchants.slice(0, 10)
    return merchants
      .filter((merchant) => merchant.toLowerCase().includes(query))
      // Don't show an exact match (it would just refill the same value)
      .filter((merchant) => merchant.toLowerCase() !== query)
      .slice(0, 10)
  }, [value, merchants])

  // Clamp highlight when filtered list shrinks
  useEffect(() => {
    if (highlightedIndex >= filtered.length) {
      setHighlightedIndex(0)
    }
  }, [filtered.length, highlightedIndex])

  function handleSelect(merchant: string) {
    onChange(merchant)
    setOpen(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (filtered.length === 0) return
      event.preventDefault()
      setOpen(true)
      setHighlightedIndex((prev) => (prev + 1) % filtered.length)
    } else if (event.key === "ArrowUp") {
      if (filtered.length === 0) return
      event.preventDefault()
      setOpen(true)
      setHighlightedIndex((prev) => (prev - 1 + filtered.length) % filtered.length)
    } else if (event.key === "Enter") {
      if (open && filtered.length > 0) {
        event.preventDefault()
        handleSelect(filtered[highlightedIndex] ?? filtered[0])
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault()
        setOpen(false)
      }
    }
  }

  const showPopover = open && filtered.length > 0

  return (
    <FormField label={title} required={required} htmlFor={name}>
      <Popover open={showPopover} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <Input
            ref={inputRef}
            id={name}
            name={name}
            value={value}
            placeholder={placeholder ?? t(locale, "forms.merchantPlaceholder")}
            autoComplete="off"
            data-1p-ignore
            className={cn("bg-background", className)}
            onChange={(event) => {
              onChange(event.target.value)
              setOpen(true)
              setHighlightedIndex(0)
            }}
            onFocus={() => {
              void ensureLoaded()
              setOpen(true)
            }}
            onBlur={() => {
              // Defer so click on a popover item registers first
              setTimeout(() => setOpen(false), 150)
            }}
            onKeyDown={handleKeyDown}
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="w-[var(--radix-popover-trigger-width)] p-1"
        >
          <ul role="listbox" className="max-h-64 overflow-y-auto">
            {filtered.map((merchant, index) => {
              const isActive = index === highlightedIndex
              return (
                <li key={merchant}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseDown={(event) => {
                      // Prevent the input's onBlur from firing before click
                      event.preventDefault()
                    }}
                    onClick={() => handleSelect(merchant)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      "w-full rounded-control px-3 py-2 text-left text-sm",
                      isActive ? "bg-muted" : "hover:bg-muted/50"
                    )}
                  >
                    {merchant}
                  </button>
                </li>
              )
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </FormField>
  )
}
