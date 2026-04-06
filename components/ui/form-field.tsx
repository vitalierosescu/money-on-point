import * as React from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type FormFieldProps = {
  label?: React.ReactNode
  description?: React.ReactNode
  error?: React.ReactNode
  required?: boolean
  htmlFor?: string
  className?: string
  children: React.ReactNode
}

export function FormField({
  label,
  description,
  error,
  required = false,
  htmlFor,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <Label htmlFor={htmlFor} className="text-body font-medium">
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
      )}
      {children}
      {description && <p className="text-caption text-muted-foreground">{description}</p>}
      {error && <p className="text-caption text-destructive">{error}</p>}
    </div>
  )
}
