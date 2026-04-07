"use client"

import { useState } from "react"

import { normalizeWebsiteToHost } from "@/lib/favicons-shared"
import { cn } from "@/lib/utils"

type CustomerAvatarProps = {
  name: string
  website?: string | null
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizeClasses: Record<NonNullable<CustomerAvatarProps["size"]>, string> = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-16 w-16 text-2xl",
}

/**
 * Round avatar for a customer. Renders the customer's website favicon when
 * available (via the on-disk-cached `/favicons/[host]` proxy route) and falls
 * back to initials in a muted circle when there's no website, the favicon
 * fetch fails, or the image is still loading.
 *
 * State machine for the favicon <img>:
 *   - "loading"  → initials shown, img is in the DOM but not yet visible
 *   - "loaded"   → initials hidden, img visible (covers the initial layer)
 *   - "error"    → img removed from DOM, initials shown
 */
export function CustomerAvatar({ name, website, size = "sm", className }: CustomerAvatarProps) {
  const host = normalizeWebsiteToHost(website)
  const initial = (name?.trim().charAt(0) || "?").toUpperCase()
  const [imgState, setImgState] = useState<"loading" | "loaded" | "error">("loading")

  const showInitial = !host || imgState !== "loaded"

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center text-muted-foreground font-semibold",
        sizeClasses[size],
        className
      )}
      aria-label={name}
    >
      {showInitial && <span aria-hidden>{initial}</span>}
      {host && imgState !== "error" && (
        <img
          src={`/favicons/${host}`}
          alt=""
          loading="lazy"
          className={cn(
            "absolute inset-0 h-full w-full object-contain bg-background p-0.5",
            imgState === "loaded" ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setImgState("loaded")}
          onError={() => setImgState("error")}
        />
      )}
    </div>
  )
}
