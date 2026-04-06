import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const pageShellVariants = cva("flex flex-col", {
  variants: {
    padding: {
      md: "p-space-4",
      lg: "p-space-5",
    },
    gap: {
      md: "gap-space-4",
      lg: "gap-space-5",
    },
    maxWidth: {
      none:     "",
      page:     "w-full max-w-6xl mx-auto",
      wide:     "w-full max-w-7xl self-center",
    },
  },
  defaultVariants: {
    padding: "md",
    gap: "md",
    maxWidth: "none",
  },
})

type PageShellProps = VariantProps<typeof pageShellVariants> & {
  children: React.ReactNode
  className?: string
}

export function PageShell({ children, padding, gap, maxWidth, className }: PageShellProps) {
  return (
    <div className={cn(pageShellVariants({ padding, gap, maxWidth }), className)}>
      {children}
    </div>
  )
}
