"use client"

import { setFileReviewedAction } from "@/app/(app)/files/actions"
import { FormError } from "@/components/forms/error"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
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

function statusLabel(file: FileLibraryItem): string {
  return file.isReviewed ? "Reviewed" : "Unsorted"
}

export function FileLibrary({ files }: { files: FileLibraryItem[] }) {
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
        statusLabel(file).toLowerCase().includes(normalized) ||
        relatedText.includes(normalized)
      )
    })
  }, [files, query])

  const selectedFile = filteredFiles.find((file) => file.id === selectedId) ?? filteredFiles[0] ?? null

  function handleToggleReviewed(file: FileLibraryItem) {
    setError("")
    startTransition(async () => {
      const result = await setFileReviewedAction(file.id, !file.isReviewed)
      if (!result.success) {
        setError(result.error ?? "Could not update file state")
      }
    })
  }

  if (files.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-8 w-8" />}
        title="No documents yet."
        description="Upload a receipt or invoice to start building your library."
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
              placeholder="Search documents, types, or linked records..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          {filteredFiles.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No documents match this search."
                description="Try a different keyword or reset the filter."
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
                            Linked to {file.relatedRecords[0].title}
                            {file.relatedRecords.length > 1 ? ` +${file.relatedRecords.length - 1}` : ""}
                          </div>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          file.isReviewed
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {statusLabel(file)}
                      </span>
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
                  {selectedFile.isReviewed ? "Mark as Unsorted" : "Mark as Reviewed"}
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
                    Document State
                  </div>
                  <div
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      selectedFile.isReviewed
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {statusLabel(selectedFile)}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Related Records
                  </div>
                  {selectedFile.relatedRecords.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No invoice or expense is linked to this document yet.</p>
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
              title="Select a document to preview it."
              description="Choose a file from the list on the left."
              className="border-none bg-transparent p-0"
            />
          </div>
        )}
      </div>
    </div>
  )
}
