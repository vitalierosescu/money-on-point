import { t } from "@/lib/i18n"
import type { UiLocale } from "@/lib/locale"
import { FormError } from "@/components/forms/error"
import { formatCurrency } from "@/lib/utils"
import { format, startOfDay } from "date-fns"
import { Loader2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "../ui/button"

const rateCache = new Map<string, number>()
const ratePromiseCache = new Map<string, Promise<number>>()

async function getCurrencyRate(currencyCodeFrom: string, currencyCodeTo: string, formattedDate: string): Promise<number> {
  const cacheKey = `${currencyCodeFrom}:${currencyCodeTo}:${formattedDate}`
  const cached = rateCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const inFlight = ratePromiseCache.get(cacheKey)
  if (inFlight) {
    return inFlight
  }

  const request = fetch(`/api/currency?from=${currencyCodeFrom}&to=${currencyCodeTo}&date=${formattedDate}`)
    .then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json()
        console.log("Currency API error:", errorData.error)
        throw new Error(errorData.error || "Failed to fetch currency rate")
      }

      const data = await response.json()
      rateCache.set(cacheKey, data.rate)
      return data.rate as number
    })
    .finally(() => {
      ratePromiseCache.delete(cacheKey)
    })

  ratePromiseCache.set(cacheKey, request)
  return request
}

export const CurrencyConverterTool = ({
  originalTotal,
  originalCurrencyCode,
  targetCurrencyCode,
  date,
  onChange,
  locale = "en",
}: {
  originalTotal: number
  originalCurrencyCode: string
  targetCurrencyCode: string
  date?: Date | undefined
  onChange?: (value: number) => void
  locale?: UiLocale
}) => {
  const normalizedDate = useMemo(
    () => startOfDay(date || new Date(Date.now() - 24 * 60 * 60 * 1000)),
    [date]
  )
  const normalizedDateString = useMemo(() => format(normalizedDate, "yyyy-MM-dd"), [normalizedDate])
  const [convertedTotal, setConvertedTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const onChangeRef = useRef(onChange)
  const cacheKey = `${originalCurrencyCode}:${targetCurrencyCode}:${normalizedDateString}`

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    let cancelled = false

    async function fetchAndUpdateRates() {
      try {
        setError(null)
        if (rateCache.has(cacheKey)) {
          const cachedRate = rateCache.get(cacheKey) ?? 0
          setConvertedTotal(Math.round(originalTotal * cachedRate * 100) / 100)
          setIsLoading(false)
          return
        }

        setIsLoading(true)

        const rate = await getCurrencyRate(originalCurrencyCode, targetCurrencyCode, normalizedDateString)
        if (cancelled) return

        setConvertedTotal(Math.round(originalTotal * rate * 100) / 100)
      } catch (error) {
        if (cancelled) return

        console.error("Error fetching currency rates:", error)
        setConvertedTotal(0)
        setError(error instanceof Error ? error.message : "Failed to fetch currency rate")
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchAndUpdateRates()

    return () => {
      cancelled = true
    }
  }, [cacheKey, normalizedDateString, originalCurrencyCode, originalTotal, retryNonce, targetCurrencyCode])

  const handleRestart = () => {
    setError(null)
    setRetryNonce((prev) => prev + 1)
  }

  useEffect(() => {
    onChangeRef.current?.(convertedTotal)
  }, [convertedTotal])

  if (!originalTotal || !originalCurrencyCode || !targetCurrencyCode || originalCurrencyCode === targetCurrencyCode) {
    return <></>
  }

  return (
    <div className="flex flex-row gap-2 items-center">
      {isLoading ? (
        <div className="flex flex-row items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <div className="font-semibold">{t(locale, "analyze.exchangeRateLoading")}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div>{formatCurrency(originalTotal * 100, originalCurrencyCode, locale)}</div>
            <div>=</div>
            <div>{targetCurrencyCode}</div>
            <input
              type="number"
              step="0.01"
              name="convertedTotal"
              value={convertedTotal}
              onChange={(e) => {
                const newValue = parseFloat(e.target.value || "0")
                if (!isNaN(newValue)) {
                  setConvertedTotal(Math.round(newValue * 100) / 100)
                }
              }}
              className="w-32 rounded-md border border-input px-2 py-1"
            />
          </div>
          {!error && (
            <div className="text-xs text-muted-foreground">
              {t(locale, "analyze.exchangeRateHint")}
            </div>
          )}
          {error && (
            <div className="flex flex-row gap-2">
              <FormError className="mt-0 text-sm">{error}</FormError>
              <Button variant="outline" size="sm" className="text-xs" onClick={handleRestart}>
                {t(locale, "common.retry")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
