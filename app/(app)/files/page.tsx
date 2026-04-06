import { FileLibrary } from "@/components/files/file-library"
import { PageShell } from "@/components/ui/page-shell"
import { getCurrentUser } from "@/lib/auth"
import { getFilesLibrary } from "@/models/files"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Files",
}

export default async function FilesPage() {
  const user = await getCurrentUser()
  const files = await getFilesLibrary(user.id)

  return (
    <PageShell>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Files</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Search uploaded documents, preview them, and jump back to the linked invoice or expense.
          </p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3 text-right">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Library</div>
          <div className="text-2xl font-semibold tabular-nums">{files.length}</div>
        </div>
      </header>

      <FileLibrary files={files} />
    </PageShell>
  )
}
