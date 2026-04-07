import { NextResponse } from "next/server"

import { normalizeWebsiteToHost, resolveFavicon } from "@/lib/favicons"

export async function GET(_request: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host: rawHost } = await params
  const host = normalizeWebsiteToHost(decodeURIComponent(rawHost))
  if (!host) {
    return new NextResponse("Invalid host", { status: 400 })
  }

  const result = await resolveFavicon(host)
  if (!result.ok) {
    // 204 lets the calling <img> fail silently so the initials fallback shows.
    return new NextResponse(null, { status: 204 })
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": result.mimeType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
