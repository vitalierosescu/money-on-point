import * as React from "react"

import { cn } from "@/lib/utils"
import { SectionLabel } from "@/components/ui/section-label"

type SectionProps = {
  label?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Section({ label, title, description, actions, children, className }: SectionProps) {
  return (
    <section className={cn("space-y-space-4", className)}>
      {(label || title || description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-space-3">
          <div className="space-y-1">
            {label && <SectionLabel>{label}</SectionLabel>}
            {title && <h2 className="text-subtitle font-semibold font-heading tracking-[-0.02em]">{title}</h2>}
            {description && <p className="text-body text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-space-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
