"use client"

import { uploadAndAttachFileToInvoiceAction } from "@/app/(app)/invoices/actions"
import { FormError } from "@/components/forms/error"
import { Button } from "@/components/ui/button"
import { Download, Eye, Loader2, Paperclip, Upload } from "lucide-react"
import Link from "next/link"
import { useRef, useState, useTransition } from "react"
import type { File as StoredFile } from "@/prisma/client"

export function InvoiceDocumentsPanel({
  invoiceId,
  files,
}: {
  invoiceId: string
  files: StoredFile[]
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return

    setError("")
    const formData = new FormData()
    for (const file of Array.from(fileList)) {
      formData.append("files", file)
    }

    startTransition(async () => {
      const result = await uploadAndAttachFileToInvoiceAction(invoiceId, formData)
      if (!result.success) {
        setError(result.error ?? "Could not upload files")
      }
    })
  }

  return (
    <div id="documents" className="border-t pt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="font-medium">Documents</h3>
          <p className="text-sm text-muted-foreground">
            Attach supporting documents to this invoice and keep them linked to the accounting record.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Add files
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(event) => handleFilesSelected(event.target.files)}
      />

      {files.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No documents attached yet.
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div key={file.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{file.filename}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{file.mimetype}</span>
                  <span>{new Date(file.createdAt).toLocaleDateString("nl-BE")}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/files/preview/${file.id}`} target="_blank">
                    <Eye className="h-4 w-4" />
                    Preview
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/files/download/${file.id}`}>
                    <Download className="h-4 w-4" />
                    Download
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Paperclip className="h-3.5 w-3.5" />
        <span>{files.length} linked {files.length === 1 ? "document" : "documents"}</span>
      </div>

      {error && <FormError className="mt-3 w-full">{error}</FormError>}
    </div>
  )
}
