// components/reports/reports-tabs.tsx
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface ReportsTabsProps {
  year: number
  userId: string
  defaultCurrency: string
}

export function ReportsTabs({ year, userId: _userId, defaultCurrency: _defaultCurrency }: ReportsTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setYear(y: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("year", String(y))
    router.push(`/reports?${params.toString()}`)
  }

  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2]

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              y === year
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      <Tabs defaultValue="omzet">
        <TabsList>
          <TabsTrigger value="omzet">Omzet</TabsTrigger>
          <TabsTrigger value="cashflow">Cashflow</TabsTrigger>
          <TabsTrigger value="openstaand">Openstaand</TabsTrigger>
          <TabsTrigger value="btw">BTW</TabsTrigger>
        </TabsList>
        <TabsContent value="omzet">
          <p className="text-muted-foreground text-sm py-8 text-center">Laden...</p>
        </TabsContent>
        <TabsContent value="cashflow">
          <p className="text-muted-foreground text-sm py-8 text-center">Laden...</p>
        </TabsContent>
        <TabsContent value="openstaand">
          <p className="text-muted-foreground text-sm py-8 text-center">Laden...</p>
        </TabsContent>
        <TabsContent value="btw">
          <p className="text-muted-foreground text-sm py-8 text-center">Laden...</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
