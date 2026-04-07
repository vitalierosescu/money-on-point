import * as React from "react"

import { cn } from "@/lib/utils"
import { SectionLabel } from "@/components/ui/section-label"

type PageHeaderProps = {
  label?: React.ReactNode
  title: React.ReactNode
  count?: number
  description?: React.ReactNode
  actions?: React.ReactNode
  size?: "md" | "lg" | "xl"
  className?: string
}

export function PageHeader({
  label,
  title,
  count,
  description,
  actions,
  size = "md",
  className,
}: PageHeaderProps) {
  const titleClass =
    size === "xl" ? "text-display" : size === "lg" ? "text-title" : "text-page"
  const countClass = titleClass

  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-space-4", className)}>
      <div className="min-w-0 space-y-1">
        {label && <SectionLabel>{label}</SectionLabel>}
        <div className="flex items-baseline gap-space-3">
          <h1 className={cn("font-semibold tracking-[-0.02em] font-heading text-foreground", titleClass)}>
            {title}
          </h1>
          {typeof count === "number" && (
            <span className={cn("text-muted-foreground/50 font-heading tabular-nums tracking-[-0.02em]", countClass)}>
              {count}
            </span>
          )}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-space-2">{actions}</div>}
    </header>
  )
}
