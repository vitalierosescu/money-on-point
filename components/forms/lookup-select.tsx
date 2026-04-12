"use client"

import { FormField } from "@/components/ui/form-field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { UiLocale } from "@/lib/locale"
import { Check, ChevronDown, Search } from "lucide-react"
import { useMemo, useState } from "react"

export function getLookupPillStyle(color?: string): {
  className: string
  style: React.CSSProperties | undefined
} {
  if (!color) {
    return { className: "border-border bg-secondary text-foreground", style: undefined }
  }
  return {
    className: "text-foreground",
    style: { backgroundColor: `${color}22`, borderColor: `${color}55` },
  }
}

export function LookupSelect({
  title,
  name,
  value,
  defaultValue,
  items,
  onValueChange,
  isRequired = false,
  placeholder = "Select an option",
  locale = "en",
  searchable = true,
}: {
  title?: React.ReactNode
  name?: string
  value?: string
  defaultValue?: string
  items: Array<{ code: string; name: string; color?: string }>
  onValueChange?: (value: string) => void
  isRequired?: boolean
  placeholder?: string
  locale?: UiLocale | string
  searchable?: boolean
}) {
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState(defaultValue ?? "")
  const currentValue = isControlled ? (value ?? "") : internalValue

  const showSearch = searchable && items.length > 5

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const selected = items.find((item) => item.code === currentValue)
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => item.name.toLowerCase().includes(needle))
  }, [items, query])

  const selectedStyle = getLookupPillStyle(selected?.color)

  function handleSelect(code: string) {
    if (!isControlled) setInternalValue(code)
    onValueChange?.(code)
    setOpen(false)
    setQuery("")
  }

  return (
    <FormField label={title} required={isRequired} htmlFor={name}>
      {name && <input type="hidden" name={name} value={currentValue} />}
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery("") }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={name}
            className={cn(
              "flex h-10 w-full items-center text-left text-sm transition-colors",
              selected
                ? "rounded-full border-0 bg-transparent p-0 hover:opacity-80"
                : "rounded-control border border-input bg-background px-3 hover:bg-secondary/20 text-muted-foreground"
            )}
          >
            {selected ? (
              <span
                className={cn(
                  "inline-flex w-full items-center justify-between rounded-full border pl-3 pr-2.5 py-1 text-sm font-medium",
                  selectedStyle.className
                )}
                style={selectedStyle.style}
              >
                <span className="truncate">{selected.name}</span>
                <ChevronDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-60" />
              </span>
            ) : (
              <>
                <span className="flex-1 truncate">{placeholder}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-[var(--radix-popover-trigger-width)] min-w-[200px] overflow-hidden rounded-[10px] border border-border p-0 shadow-popover"
        >
          {showSearch && (
            <div className="border-b p-3">
              <div className="flex items-center gap-2 rounded-[8px] border border-input bg-background px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={locale === "nl" ? "Zoek een optie" : "Find an option"}
                  className="h-9 w-full border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
          )}
          <div className="max-h-64 space-y-1 overflow-y-auto p-3">
            {filteredItems.map((item) => {
              const itemStyle = getLookupPillStyle(item.color)
              const isSelected = item.code === currentValue
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => handleSelect(item.code)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[8px] px-2 py-1 text-left transition-colors hover:bg-secondary/50",
                    isSelected && "bg-secondary/50"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      itemStyle.className
                    )}
                    style={itemStyle.style}
                  >
                    {item.name}
                  </span>
                  {isSelected && <Check className="h-4 w-4 text-foreground" />}
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </FormField>
  )
}
