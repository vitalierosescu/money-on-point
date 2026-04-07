import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { ProjectStats } from "@/models/stats"
import { Project } from "@/prisma/client"
import { Plus } from "lucide-react"
import Link from "next/link"

export function ProjectsWidget({
  projects,
  statsPerProject,
}: {
  projects: Project[]
  statsPerProject: Record<string, ProjectStats>
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {projects.map((project) => (
        <Link key={project.code} href={`/invoices?projectCode=${project.code}`}>
          <Card className="bg-card border border-transparent hover:border-primary transition-colors group cursor-pointer">
            <CardHeader>
              <CardTitle>
                <Badge
                  className="text-base font-semibold"
                  style={{ backgroundColor: project.color }}
                >
                  {project.name}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 justify-between items-center">
                <div className="bg-secondary/60 p-3 rounded-card">
                  <div className="text-sm font-medium text-muted-foreground">Income</div>
                  <div className="text-2xl font-bold text-success">
                    {Object.entries(statsPerProject[project.code]?.totalIncomePerCurrency).map(([currency, total]) => (
                      <div
                        key={currency}
                        className="flex flex-col gap-2 font-bold text-success text-base first:text-2xl"
                      >
                        {formatCurrency(total, currency)}
                      </div>
                    ))}
                    {!Object.entries(statsPerProject[project.code]?.totalIncomePerCurrency).length && (
                      <div className="font-bold text-base first:text-2xl">0.00</div>
                    )}
                  </div>
                </div>
                <div className="bg-secondary/60 p-3 rounded-card">
                  <div className="text-sm font-medium text-muted-foreground">Expenses</div>
                  <div className="text-2xl font-bold text-destructive">
                    {Object.entries(statsPerProject[project.code]?.totalExpensesPerCurrency).map(
                      ([currency, total]) => (
                        <div
                          key={currency}
                          className="flex flex-col gap-2 font-bold text-destructive text-base first:text-2xl"
                        >
                          {formatCurrency(total, currency)}
                        </div>
                      )
                    )}
                    {!Object.entries(statsPerProject[project.code]?.totalExpensesPerCurrency).length && (
                      <div className="font-bold text-base first:text-2xl">0.00</div>
                    )}
                  </div>
                </div>
                <div className="bg-secondary/60 p-3 rounded-card">
                  <div className="text-sm font-medium text-muted-foreground">Profit</div>
                  <div className="text-2xl font-bold">
                    {Object.entries(statsPerProject[project.code]?.profitPerCurrency).map(([currency, total]) => (
                      <div
                        key={currency}
                        className={`flex flex-col gap-2 items-center text-2xl font-bold ${
                          total >= 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {formatCurrency(total, currency)}
                      </div>
                    ))}
                    {!Object.entries(statsPerProject[project.code]?.profitPerCurrency).length && (
                      <div className="text-2xl font-bold">0.00</div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
      <Link
        href="/settings/projects"
        className="flex items-center justify-center gap-2 rounded-card border-2 border-dashed border-border p-6 text-muted-foreground transition-colors hover:border-primary group"
      >
        <Plus className="h-5 w-5 group-hover:rotate-90 transition-transform duration-300" />
        <span className="font-medium">Create New Project</span>
      </Link>
    </div>
  )
}
