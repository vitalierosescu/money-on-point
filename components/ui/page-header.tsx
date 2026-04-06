import * as React from "react"

import { cn } from "@/lib/utils"

type PageHeaderProps = {
  title: React.ReactNode
  count?: number
  description?: React.ReactNode
  actions?: React.ReactNode
  size?: "md" | "lg"
  className?: string
}

export function PageHeader({
  title,
  count,
  description,
  actions,
  size = "lg",
  className,
}: PageHeaderProps) {
  const titleClass = size === "lg" ? "text-display" : "text-title"
  const countClass = size === "lg" ? "text-display" : "text-title"

  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-space-4", className)}>
      <div className="min-w-0 space-y-1">
        <div className="flex items-baseline gap-space-3">
          <h1 className={cn("font-bold tracking-tight", titleClass)}>{title}</h1>
          {typeof count === "number" && (
            <span className={cn("text-muted-foreground/40", countClass)}>{count}</span>
          )}
        </div>
        {description && <p className="text-body text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-space-2">{actions}</div>}
    </header>
  )
}
