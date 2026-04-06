"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { File } from "@/prisma/client"
import { ArrowRight, FilePlus, Inbox } from "lucide-react"
import Link from "next/link"

export default function DashboardUnsortedWidget({ files }: { files: File[] }) {
  return (
    <Card className="w-full bg-card">
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center justify-between gap-3">
          <span>{files.length > 0 ? `${files.length} files waiting` : "Unsorted is clear"}</span>
          <Link href="/unsorted" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Open
          </Link>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Recently uploaded documents land here first so you can review, classify, and attach them properly.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {files.slice(0, 3).map((file) => (
            <Link
              href={`/unsorted/#${file.id}`}
              key={file.id}
              className="rounded-xl border p-3 transition-colors hover:bg-muted/40"
            >
              <div className="flex flex-row gap-2">
                <FilePlus className="h-8 w-8" />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-xs font-semibold">{file.filename}</span>
                  <span className="truncate text-xs">{file.mimetype}</span>
                </div>
                <ArrowRight className="h-4 w-4 self-center text-muted-foreground" />
              </div>
            </Link>
          ))}
          {files.length === 0 && (
            <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center text-sm text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <div>No new uploads are waiting for review.</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
