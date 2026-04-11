"use client"

import { setFileReviewedAction } from "@/app/(app)/files/actions"
import { FormError } from "@/components/forms/error"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { t } from "@/lib/i18n"
import type { UiLocale } from "@/lib/locale"
import type { FileLibraryItem } from "@/models/files"
import { CheckCircle2, Download, ExternalLink, FileText, Search } from "lucide-react"
import Link from "next/link"
import { useMemo, useState, useTransition } from "react"

function getFileSize(file: FileLibraryItem): number {
  return file.metadata && typeof file.metadata === "object" && "size" in file.metadata
    ? Number(file.metadata.size)
    : 0
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B"
  const sizes = ["B", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${sizes[index]}`
}

function getReviewStateLabel(file: FileLibraryItem, locale: UiLocale): string {
  return file.isReviewed ? t(locale, "files.stateReviewed") : t(locale, "files.stateUnsorted")
}

function getLinkStateLabel(file: FileLibraryItem, locale: UiLocale): string {
  return file.relatedRecords.length > 0 ? t(locale, "files.stateLinked") : t(locale, "files.stateNeedsLink")
}

function getReviewBadgeClass(file: FileLibraryItem) {
  return file.isReviewed ? "bg-success/15 text-success" : "bg-info/12 text-info"
}

function getLinkBadgeClass(file: FileLibraryItem) {
  return file.relatedRecords.length > 0 ? "bg-secondary text-foreground" : "bg-warning/15 text-warning"
}

export function FileLibrary({ files, locale }: { files: FileLibraryItem[]; locale: UiLocale }) {
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState(files[0]?.id ?? "")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const filteredFiles = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return files

    return files.filter((file) => {
      const relatedText = file.relatedRecords
        .map((record) => `${record.title} ${record.subtitle ?? ""} ${record.status ?? ""}`)
        .join(" ")
        .toLowerCase()

      return (
        file.filename.toLowerCase().includes(normalized) ||
        file.mimetype.toLowerCase().includes(normalized) ||
        getReviewStateLabel(file, locale).toLowerCase().includes(normalized) ||
        getLinkStateLabel(file, locale).toLowerCase().includes(normalized) ||
        relatedText.includes(normalized)
      )
    })
  }, [files, locale, query])

  const selectedFile = filteredFiles.find((file) => file.id === selectedId) ?? filteredFiles[0] ?? null

  function handleToggleReviewed(file: FileLibraryItem) {
    setError("")
    startTransition(async () => {
      const result = await setFileReviewedAction(file.id, !file.isReviewed)
      if (!result.success) {
        setError(result.error ?? t(locale, "files.updateStateFailed"))
      }
    })
  }

  if (files.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-8 w-8" />}
        title={t(locale, "files.emptyTitle")}
        description={t(locale, "files.emptyDescription")}
      />
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]">
      <div className="rounded-lg border overflow-hidden">
        <div className="border-b p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t(locale, "files.searchPlaceholder")}
              className="pl-9"
            />
          </div>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          {filteredFiles.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title={t(locale, "files.noResultsTitle")}
                description={t(locale, "files.noResultsDescription")}
                className="border-none bg-transparent p-0"
              />
            </div>
          ) : (
            <div className="divide-y">
              {filteredFiles.map((file) => {
                const active = selectedFile?.id === file.id
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => setSelectedId(file.id)}
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      active ? "bg-muted/40" : "hover:bg-muted/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{file.filename}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{file.mimetype}</span>
                          <span>{formatBytes(getFileSize(file))}</span>
                          <span>{new Date(file.createdAt).toLocaleDateString("nl-BE")}</span>
                        </div>
                        {file.relatedRecords[0] && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {t(locale, "files.linkedTo", { title: file.relatedRecords[0].title })}
                            {file.relatedRecords.length > 1 ? ` +${file.relatedRecords.length - 1}` : ""}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getReviewBadgeClass(file)}`}>
                          {getReviewStateLabel(file, locale)}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getLinkBadgeClass(file)}`}>
                          {getLinkStateLabel(file, locale)}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden bg-card">
        {selectedFile ? (
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold">{selectedFile.filename}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{selectedFile.mimetype}</span>
                  <span>{formatBytes(getFileSize(selectedFile))}</span>
                  <span>{new Date(selectedFile.createdAt).toLocaleString("nl-BE")}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleToggleReviewed(selectedFile)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {selectedFile.isReviewed ? t(locale, "files.markAsUnsorted") : t(locale, "files.markAsReviewed")}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/files/download/${selectedFile.id}`}>
                    <Download className="h-4 w-4" />
                    Download
                  </a>
                </Button>
              </div>
            </div>

            <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <iframe
                src={`/files/preview/${selectedFile.id}`}
                className="min-h-[520px] w-full rounded-lg border bg-white"
                title={selectedFile.filename}
              />

              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t(locale, "files.reviewState")}
                  </div>
                  <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getReviewBadgeClass(selectedFile)}`}>
                    {getReviewStateLabel(selectedFile, locale)}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t(locale, "files.linksState")}
                  </div>
                  <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getLinkBadgeClass(selectedFile)}`}>
                    {getLinkStateLabel(selectedFile, locale)}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t(locale, "files.linkedRecordsTitle")}
                  </div>
                  {selectedFile.relatedRecords.length === 0 ? (
                    <div className="space-y-2 rounded-card border border-warning/30 bg-warning/5 p-3">
                      <p className="text-sm font-medium text-foreground">{t(locale, "files.needsLinkTitle")}</p>
                      <p className="text-sm text-muted-foreground">{t(locale, "files.needsLinkDescription")}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedFile.relatedRecords.map((record) => (
                        <Link
                          key={`${record.kind}-${record.id}`}
                          href={record.href}
                          className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm hover:bg-muted/20"
                        >
                          <div className="min-w-0">
                            <div className="font-medium">{record.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {record.kind}
                              {record.subtitle ? ` · ${record.subtitle}` : ""}
                              {record.status ? ` · ${record.status}` : ""}
                            </div>
                          </div>
                          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {error && <FormError className="w-full">{error}</FormError>}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8">
            <EmptyState
              title={t(locale, "files.selectToPreview")}
              description={t(locale, "files.selectToPreviewDescription")}
              className="border-none bg-transparent p-0"
            />
          </div>
        )}
      </div>
    </div>
  )
}
