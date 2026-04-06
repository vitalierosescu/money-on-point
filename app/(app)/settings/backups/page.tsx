"use client"

import { FormError } from "@/components/forms/error"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { Section } from "@/components/ui/section"
import { useDownload } from "@/hooks/use-download"
import { useProgress } from "@/hooks/use-progress"
import { Download, Loader2 } from "lucide-react"
import { useActionState } from "react"
import { restoreBackupAction } from "./actions"

export default function BackupSettingsPage() {
  const [restoreState, restoreBackup, restorePending] = useActionState(restoreBackupAction, null)

  const { isLoading, startProgress, progress } = useProgress({
    onError: (error) => {
      console.error("Backup progress error:", error)
    },
  })

  const { download, isDownloading } = useDownload({
    onError: (error) => {
      console.error("Download error:", error)
    },
  })

  const handleDownload = async () => {
    try {
      const progressId = await startProgress("backup")
      const downloadUrl = `/settings/backups/data?progressId=${progressId || ""}`
      await download(downloadUrl, "taxhacker-backup.zip")
    } catch (error) {
      console.error("Failed to start backup:", error)
    }
  }

  return (
    <div className="container space-y-space-8">
      <PageHeader
        title="Backups"
        description="Download or restore your data archive."
        size="md"
      />

      <Section
        title="Download backup"
        actions={
          <Button onClick={handleDownload} disabled={isLoading || isDownloading}>
            {isLoading ? (
              progress?.current ? (
                `Archiving ${progress.current}/${progress.total} files`
              ) : (
                "Preparing backup. Don't close the page..."
              )
            ) : isDownloading ? (
              "Archive is created. Downloading..."
            ) : (
              <>
                <Download className="mr-2" /> Download Data Archive
              </>
            )}
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground max-w-xl">
          Inside the archive you will find all the uploaded files, as well as JSON files for transactions, categories,
          projects, fields, currencies, and settings. You can view, edit or migrate your data to another service.
        </p>
      </Section>

      <Section
        title="Restore from a backup"
        description="This action is irreversible. Restoring from a backup will delete all existing data from your current database and remove all uploaded files."
      >
        <Card className="flex flex-col gap-2 p-space-5 bg-destructive/10 max-w-xl">
          <form action={restoreBackup}>
            <div className="flex flex-col gap-4">
              <label>
                <input type="file" name="file" required />
              </label>
              <label className="flex flex-row gap-2 items-center">
                <input type="checkbox" name="removeExistingData" required />
                <span className="text-destructive">I undestand that it will permanently delete all existing data</span>
              </label>
              <Button type="submit" variant="destructive" disabled={restorePending}>
                {restorePending ? (
                  <>
                    <Loader2 className="animate-spin" /> Restoring from backup... (it can take a while)
                  </>
                ) : (
                  "Restore from backup"
                )}
              </Button>
            </div>
          </form>
          {restoreState?.error && <FormError>{restoreState.error}</FormError>}
        </Card>
      </Section>

      {restoreState?.success && (
        <Section
          title="Backup restored successfully"
          description="You can now continue using the app. Import stats:"
        >
          <Card className="flex flex-col gap-2 p-space-5 bg-success/10 max-w-xl">
            <ul className="list-disc list-inside">
              {Object.entries(restoreState.data?.counters || {}).map(([key, value]) => (
                <li key={key}>
                  <span className="font-bold">{key}</span>: {value} items
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}
    </div>
  )
}
