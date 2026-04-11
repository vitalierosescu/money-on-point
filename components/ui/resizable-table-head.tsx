"use client"

import { useCallback } from "react"

import { TableHead } from "@/components/ui/table"
import { clampColumnWidth } from "@/lib/table-column-order"
import { cn } from "@/lib/utils"

export function ResizableTableHead({
  width,
  minWidth = 96,
  maxWidth = 640,
  onWidthChange,
  onWidthCommit,
  children,
  className,
  contentClassName,
  resizeHandleLabel = "Resize column",
}: {
  width: number
  minWidth?: number
  maxWidth?: number
  onWidthChange: (width: number) => void
  onWidthCommit?: (width: number) => void
  children: React.ReactNode
  className?: string
  contentClassName?: string
  resizeHandleLabel?: string
}) {
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()

      const startX = event.clientX
      const startWidth = width
      const previousUserSelect = document.body.style.userSelect
      const previousCursor = document.body.style.cursor

      document.body.style.userSelect = "none"
      document.body.style.cursor = "col-resize"

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const nextWidth = clampColumnWidth(startWidth + (moveEvent.clientX - startX), minWidth, maxWidth)
        onWidthChange(nextWidth)
      }

      const handleMouseUp = (upEvent: MouseEvent) => {
        const nextWidth = clampColumnWidth(startWidth + (upEvent.clientX - startX), minWidth, maxWidth)
        onWidthChange(nextWidth)
        onWidthCommit?.(nextWidth)
        document.body.style.userSelect = previousUserSelect
        document.body.style.cursor = previousCursor
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
      }

      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    },
    [maxWidth, minWidth, onWidthChange, onWidthCommit, width]
  )

  return (
    <TableHead
      className={cn("relative", className)}
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <div className={cn("flex items-center gap-2", contentClassName)}>{children}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={resizeHandleLabel}
        onMouseDown={handleMouseDown}
        className="absolute inset-y-0 right-0 w-3 cursor-col-resize touch-none"
      >
        <div className="absolute inset-y-2 right-1 w-px bg-border opacity-0 transition-opacity group-hover/header:opacity-100" />
      </div>
    </TableHead>
  )
}
