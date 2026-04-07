import * as React from "react"

import { cn } from "@/lib/utils"

type EmptyStateProps = {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-space-3 rounded-card border border-border bg-card p-space-8 text-center text-body text-muted-foreground",
        className
      )}
    >
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <div className="space-y-1">
        <div className="text-subtitle font-semibold font-heading tracking-[-0.02em] text-foreground">{title}</div>
        {description && <div className="text-body text-muted-foreground">{description}</div>}
      </div>
      {action && <div className="mt-space-2">{action}</div>}
    </div>
  )
}
