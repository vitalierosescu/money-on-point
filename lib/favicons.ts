import { existsSync } from "fs"
import fs from "fs/promises"
import path from "path"

import { isSafeHost } from "./favicons-shared"

export { normalizeWebsiteToHost } from "./favicons-shared"

const FAVICON_CACHE_DIR = path.join(process.cwd(), ".favicon-cache")
const FAVICON_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const FAVICON_FETCH_TIMEOUT_MS = 4000

export type FaviconResolution =
  | { ok: true; mimeType: string; buffer: Buffer; cached: boolean }
  | { ok: false; reason: "no-website" | "invalid-host" | "fetch-failed" | "empty" }

async function ensureCacheDir() {
  if (!existsSync(FAVICON_CACHE_DIR)) {
    await fs.mkdir(FAVICON_CACHE_DIR, { recursive: true })
  }
}

function cacheFilePath(host: string) {
  return path.join(FAVICON_CACHE_DIR, `${host}.bin`)
}

function metaFilePath(host: string) {
  return path.join(FAVICON_CACHE_DIR, `${host}.meta.json`)
}

async function readCached(host: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const [bin, meta] = await Promise.all([
      fs.readFile(cacheFilePath(host)),
      fs.readFile(metaFilePath(host), "utf8"),
    ])
    const parsed = JSON.parse(meta) as { mimeType: string; fetchedAt: number }
    if (Date.now() - parsed.fetchedAt > FAVICON_TTL_MS) return null
    if (bin.length === 0) return null
    return { buffer: bin, mimeType: parsed.mimeType }
  } catch {
    return null
  }
}

async function writeCached(host: string, buffer: Buffer, mimeType: string) {
  await ensureCacheDir()
  await Promise.all([
    fs.writeFile(cacheFilePath(host), buffer),
    fs.writeFile(metaFilePath(host), JSON.stringify({ mimeType, fetchedAt: Date.now() })),
  ])
}

/**
 * Fetch the favicon for a host via Google's favicon service, with disk cache.
 * Returns the cached binary on subsequent calls until the TTL expires.
 */
export async function resolveFavicon(host: string): Promise<FaviconResolution> {
  if (!host || !isSafeHost(host)) {
    return { ok: false, reason: "invalid-host" }
  }

  const cached = await readCached(host)
  if (cached) {
    return { ok: true, mimeType: cached.mimeType, buffer: cached.buffer, cached: true }
  }

  const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FAVICON_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" })
    if (!res.ok) return { ok: false, reason: "fetch-failed" }
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length === 0) return { ok: false, reason: "empty" }
    const mimeType = res.headers.get("content-type") ?? "image/png"
    await writeCached(host, buffer, mimeType)
    return { ok: true, mimeType, buffer, cached: false }
  } catch {
    return { ok: false, reason: "fetch-failed" }
  } finally {
    clearTimeout(timer)
  }
}
