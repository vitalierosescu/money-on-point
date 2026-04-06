import * as React from "react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type StatCardProps = {
  label: React.ReactNode
  value: React.ReactNode
  helper?: React.ReactNode
  className?: string
}

export function StatCard({ label, value, helper, className }: StatCardProps) {
  return (
    <Card className={cn("rounded-xl border bg-card p-space-4 shadow-card", className)}>
      <div className="space-y-1">
        <div className="text-caption font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-title font-semibold text-foreground">{value}</div>
        {helper && <div className="text-body text-muted-foreground">{helper}</div>}
      </div>
    </Card>
  )
}
