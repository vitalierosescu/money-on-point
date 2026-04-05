// lib/parse-year-param.ts
export function parseYearParam(value: string | null): number {
  const parsed = parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed >= 2000 && parsed <= 2100
    ? parsed
    : new Date().getFullYear()
}
