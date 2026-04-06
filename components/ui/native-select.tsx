import * as React from "react"

import { cn } from "@/lib/utils"

const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "flex h-9 w-full min-w-[150px] rounded-md border border-input bg-background px-3 py-2 text-body shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
    )
  }
)
NativeSelect.displayName = "NativeSelect"

export { NativeSelect }
