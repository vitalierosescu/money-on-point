import * as React from "react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type StatCardTone = "default" | "success" | "warning" | "destructive" | "info"

const TONE_LABEL_CLASS: Record<StatCardTone, string> = {
  default: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
}

const TONE_VALUE_CLASS: Record<StatCardTone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
}

type StatCardProps = {
  label: React.ReactNode
  value: React.ReactNode
  helper?: React.ReactNode
  /** Tone applied to the label. Defaults to "default" (muted). */
  tone?: StatCardTone
  /** When set, also tints the value. Use sparingly — reserve for cases where the value itself signals urgency (e.g. an overdue total). */
  valueTone?: StatCardTone
  className?: string
}

export function StatCard({ label, value, helper, tone = "default", valueTone, className }: StatCardProps) {
  return (
    <Card className={cn("rounded-card bg-card p-space-4", className)}>
      <div className="space-y-1">
        <div className={cn("text-xs font-medium uppercase tracking-[0.2em]", TONE_LABEL_CLASS[tone])}>{label}</div>
        <div
          className={cn(
            "text-title font-semibold font-heading tracking-[-0.02em]",
            TONE_VALUE_CLASS[valueTone ?? "default"]
          )}
        >
          {value}
        </div>
        {helper && <div className="text-body text-muted-foreground">{helper}</div>}
      </div>
    </Card>
  )
}
