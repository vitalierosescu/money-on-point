// Browser-safe favicon helpers. No Node-only imports — this module can be
// imported from client components. Server-only fetch/cache logic lives in
// lib/favicons.ts which depends on this file.

const SAFE_HOST_REGEX = /^[a-z0-9.-]+$/

/**
 * Extract a hostname from a free-text website value. Accepts inputs like
 * "https://example.com/foo", "example.com", or "www.example.com" and returns
 * the lowercased apex/host with a leading "www." stripped. Returns null on
 * garbage input.
 */
export function normalizeWebsiteToHost(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withProtocol)
    const host = url.hostname.replace(/^www\./, "")
    if (!host || !SAFE_HOST_REGEX.test(host)) return null
    return host
  } catch {
    return null
  }
}

export function isSafeHost(host: string): boolean {
  return SAFE_HOST_REGEX.test(host)
}
