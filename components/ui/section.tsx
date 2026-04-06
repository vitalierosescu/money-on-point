import * as React from "react"

import { cn } from "@/lib/utils"

type SectionProps = {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <section className={cn("space-y-space-4", className)}>
      {(title || description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-space-3">
          <div className="space-y-1">
            {title && <h2 className="text-subtitle font-semibold">{title}</h2>}
            {description && <p className="text-body text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-space-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
