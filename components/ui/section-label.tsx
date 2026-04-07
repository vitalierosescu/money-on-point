import * as React from "react"

import { cn } from "@/lib/utils"

type SectionLabelProps = React.HTMLAttributes<HTMLDivElement>

export function SectionLabel({ className, ...props }: SectionLabelProps) {
  return (
    <div
      className={cn("text-xs uppercase tracking-[0.22em] text-muted-foreground", className)}
      {...props}
    />
  )
}
