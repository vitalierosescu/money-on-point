import type { SettingsMap } from "@/models/settings"

export const UI_LOCALES = ["en", "nl"] as const

export type UiLocale = (typeof UI_LOCALES)[number]

export const DEFAULT_UI_LOCALE: UiLocale = "en"

const INTL_LOCALES: Record<UiLocale, string> = {
  en: "en-BE",
  nl: "nl-BE",
}

export function isUiLocale(value: string | undefined | null): value is UiLocale {
  return value === "en" || value === "nl"
}

export function getUiLocale(settings?: SettingsMap | null): UiLocale {
  const candidate = settings?.ui_locale?.trim()
  return isUiLocale(candidate) ? candidate : DEFAULT_UI_LOCALE
}

export function getIntlLocale(locale: UiLocale): string {
  return INTL_LOCALES[locale]
}

export function formatLocaleCurrency(total: number, currency: string, locale: UiLocale) {
  try {
    return new Intl.NumberFormat(getIntlLocale(locale), {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(total / 100)
  } catch {
    return `${currency} ${total / 100}`
  }
}

export function formatLocaleNumber(number: number, locale: UiLocale) {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    useGrouping: true,
  }).format(number)
}

export function formatLocaleDate(
  value: Date | string | number,
  locale: UiLocale,
  options?: Intl.DateTimeFormatOptions
) {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(getIntlLocale(locale), options).format(date)
}

export function formatLocaleDateTime(
  value: Date | string | number,
  locale: UiLocale,
  options?: Intl.DateTimeFormatOptions
) {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(date)
}

export function formatLocalePeriodLabel(period: string, date: Date, locale: UiLocale): string {
  if (period.includes("-") && period.split("-").length === 3) {
    return formatLocaleDate(date, locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  return formatLocaleDate(date, locale, {
    month: "short",
    year: "numeric",
  })
}
