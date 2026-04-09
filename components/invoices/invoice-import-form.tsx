"use client"

import {
  dryRunInvoiceImportAction,
  parseInvoiceCsvAction,
  saveImportedInvoicesAction,
  type DryRunResult,
  type SaveInvoiceImportResult,
} from "@/app/(app)/invoices/import/actions"
import { FormError } from "@/components/forms/error"
import { Button } from "@/components/ui/button"
import {
  INVOICE_IMPORT_FIELDS,
  isInvoiceImportFieldCode,
  type InvoiceImportFieldCode,
} from "@/models/invoice-import"
import { AlertCircle, CheckCircle2, Loader2, Play, Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { startTransition, useActionState, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

const MAX_PREVIEW_ROWS = 100

type DuplicateHandling = "skip" | "abort"

/**
 * Bulk CSV import for historical sent invoices. Adapted from
 * `components/import/csv.tsx` (which imports expenses) with three
 * key differences: a fixed column schema, a dry-run preview step, and
 * an opt-in checkbox for creating linked income transactions.
 */
export function InvoiceImportForm() {
  const router = useRouter()
  const [parseState, parseAction, isParsing] = useActionState(parseInvoiceCsvAction, null)

  const [csvData, setCsvData] = useState<string[][]>([])
  const [skipHeader, setSkipHeader] = useState(true)
  const [columnMappings, setColumnMappings] = useState<string[]>([])
  const [duplicateHandling, setDuplicateHandling] = useState<DuplicateHandling>("skip")
  const [createLinkedTransactions, setCreateLinkedTransactions] = useState(false)

  const [dryRun, setDryRun] = useState<DryRunResult | null>(null)
  const [isDryRunning, setIsDryRunning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<SaveInvoiceImportResult | null>(null)

  useEffect(() => {
    if (parseState?.success && parseState.data) {
      const parsedData = parseState.data as string[][]
      setCsvData(parsedData)
      setDryRun(null)
      setSaveResult(null)
      setSaveError(null)
      if (parsedData.length > 0) {
        setColumnMappings(
          parsedData[0].map((value) => {
            const normalized = value?.toLowerCase().replace(/[\s_]+/g, "")
            const field = INVOICE_IMPORT_FIELDS.find(
              (f) =>
                f.code === value ||
                f.label.toLowerCase() === value?.toLowerCase() ||
                f.code.toLowerCase() === normalized
            )
            return field?.code || ""
          })
        )
      }
    }
  }, [parseState])

  const mappedRows = useMemo(() => {
    if (csvData.length === 0) return []
    const startIndex = skipHeader ? 1 : 0
    return csvData.slice(startIndex).map((row) => {
      const record: Record<string, string> = {}
      columnMappings.forEach((fieldCode, idx) => {
        if (fieldCode && isInvoiceImportFieldCode(fieldCode)) {
          record[fieldCode] = row[idx] ?? ""
        }
      })
      return record
    })
  }, [csvData, skipHeader, columnMappings])

  const mappedFieldCodes = useMemo(
    () => new Set(columnMappings.filter(Boolean) as InvoiceImportFieldCode[]),
    [columnMappings]
  )

  const missingRequiredFields = useMemo(
    () => INVOICE_IMPORT_FIELDS.filter((f) => f.required && !mappedFieldCodes.has(f.code)),
    [mappedFieldCodes]
  )

  const canRunDryRun = csvData.length > 0 && missingRequiredFields.length === 0

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append("file", file)

    startTransition(async () => {
      await parseAction(formData)
    })
  }

  const handleMappingChange = (columnIndex: number, fieldCode: string) => {
    setColumnMappings((prev) => {
      const state = [...prev]
      state[columnIndex] = fieldCode
      return state
    })
    setDryRun(null)
  }

  const handleDryRun = async () => {
    setIsDryRunning(true)
    setDryRun(null)
    setSaveError(null)
    try {
      const result = await dryRunInvoiceImportAction(mappedRows)
      if (result.success && result.data) {
        setDryRun(result.data)
      } else {
        toast.error(result.error ?? "Preview failed")
      }
    } finally {
      setIsDryRunning(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    setSaveResult(null)
    try {
      const result = await saveImportedInvoicesAction(mappedRows, {
        duplicateHandling,
        createLinkedTransactions,
      })
      if (result.success && result.data) {
        setSaveResult(result.data)
        const { imported, skipped, failed } = result.data
        if (imported > 0 && failed.length === 0 && skipped === 0) {
          toast.success(`Imported ${imported} invoice${imported === 1 ? "" : "s"}`)
          router.push("/invoices")
        } else if (imported > 0) {
          toast.success(`Imported ${imported}, skipped ${skipped}, failed ${failed.length}`)
        } else {
          toast.error("No invoices were imported")
        }
      } else {
        setSaveError(result.error ?? "Save failed")
      }
    } finally {
      setIsSaving(false)
    }
  }

  if (csvData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full min-h-[400px]">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold">Import invoices from CSV</h2>
          <p className="text-muted-foreground">
            Upload a CSV export from your previous invoicing tool to migrate historical invoices.
          </p>
        </div>
        <div className="mt-4">
          <input type="file" accept=".csv" className="hidden" id="invoice-csv-file" onChange={handleFileChange} />
          <Button type="button" onClick={() => document.getElementById("invoice-csv-file")?.click()}>
            {isParsing ? (
              <>
                <Loader2 className="animate-spin" /> Parsing…
              </>
            ) : (
              <>
                <Upload /> Choose CSV file
              </>
            )}
          </Button>
        </div>
        {parseState?.error && <FormError>{parseState.error}</FormError>}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Import {mappedRows.length} invoice{mappedRows.length === 1 ? "" : "s"} from CSV
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Map each column to an invoice field, then preview before importing.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={handleDryRun} disabled={!canRunDryRun || isDryRunning}>
            {isDryRunning ? <Loader2 className="animate-spin" /> : null}
            Preview
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!dryRun || dryRun.validRows === 0 || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="animate-spin" /> Importing…
              </>
            ) : (
              <>
                <Play /> Import {dryRun?.validRows ?? 0} invoice{dryRun?.validRows === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </div>
      </header>

      {missingRequiredFields.length > 0 && (
        <FormError>
          Map these required fields before importing: {missingRequiredFields.map((f) => f.label).join(", ")}
        </FormError>
      )}

      <div className="flex flex-wrap items-center gap-6 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={skipHeader}
            onChange={(e) => {
              setSkipHeader(e.target.checked)
              setDryRun(null)
            }}
          />
          <span>First row is a header</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <span>On duplicate invoice number:</span>
          <select
            className="p-1 border rounded-md bg-background"
            value={duplicateHandling}
            onChange={(e) => {
              setDuplicateHandling(e.target.value as DuplicateHandling)
              setDryRun(null)
            }}
          >
            <option value="skip">Skip</option>
            <option value="abort">Abort import</option>
          </select>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={createLinkedTransactions}
            onChange={(e) => setCreateLinkedTransactions(e.target.checked)}
          />
          <span>Also create linked income transactions</span>
        </label>
      </div>

      {dryRun && (
        <div className="rounded-md border p-4 space-y-2 bg-muted/20">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span>Preview</span>
          </div>
          <ul className="text-sm space-y-1">
            <li>
              <strong>{dryRun.validRows}</strong> invoice{dryRun.validRows === 1 ? "" : "s"} ready to import
            </li>
            {dryRun.newCustomerNames.length > 0 && (
              <li>
                <strong>{dryRun.newCustomerNames.length}</strong> new customer
                {dryRun.newCustomerNames.length === 1 ? "" : "s"} will be created:{" "}
                <span className="text-muted-foreground">
                  {dryRun.newCustomerNames.slice(0, 5).join(", ")}
                  {dryRun.newCustomerNames.length > 5 ? ", …" : ""}
                </span>
              </li>
            )}
            {dryRun.duplicateInvoiceNumbers.length > 0 && (
              <li className="text-warning">
                <strong>{dryRun.duplicateInvoiceNumbers.length}</strong> duplicate invoice number
                {dryRun.duplicateInvoiceNumbers.length === 1 ? "" : "s"} found: will{" "}
                {duplicateHandling === "skip" ? "be skipped" : "abort the import"}
              </li>
            )}
            {dryRun.invalidRows.length > 0 && (
              <li className="text-destructive">
                <strong>{dryRun.invalidRows.length}</strong> row
                {dryRun.invalidRows.length === 1 ? "" : "s"} have validation errors:
                <ul className="mt-1 ml-4 list-disc text-xs">
                  {dryRun.invalidRows.slice(0, 10).map((err) => (
                    <li key={err.rowNumber}>
                      Row {err.rowNumber}: {err.reason}
                    </li>
                  ))}
                  {dryRun.invalidRows.length > 10 && (
                    <li className="text-muted-foreground">
                      and {dryRun.invalidRows.length - 10} more…
                    </li>
                  )}
                </ul>
              </li>
            )}
          </ul>
        </div>
      )}

      {saveError && <FormError>{saveError}</FormError>}

      {saveResult && (saveResult.failed.length > 0 || saveResult.skipped > 0) && (
        <div className="rounded-md border p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="w-4 h-4 text-warning" />
            <span>Import finished with issues</span>
          </div>
          <ul className="text-sm space-y-1">
            <li>Imported: {saveResult.imported}</li>
            <li>Skipped: {saveResult.skipped}</li>
            <li>Failed: {saveResult.failed.length}</li>
          </ul>
          {saveResult.failed.length > 0 && (
            <ul className="mt-2 ml-4 list-disc text-xs text-muted-foreground">
              {saveResult.failed.slice(0, 20).map((err) => (
                <li key={err.rowNumber}>
                  Row {err.rowNumber}: {err.reason}
                </li>
              ))}
              {saveResult.failed.length > 20 && (
                <li>and {saveResult.failed.length - 20} more…</li>
              )}
            </ul>
          )}
        </div>
      )}

      <div className="rounded-md border">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-muted/50">
                {csvData[0].map((_, index) => (
                  <th key={index} className="h-12 min-w-[200px] px-4 text-left align-middle font-medium">
                    <select
                      className="w-full p-2 border rounded-md bg-background"
                      value={columnMappings[index] || ""}
                      onChange={(e) => handleMappingChange(index, e.target.value)}
                    >
                      <option value="">Skip column</option>
                      {INVOICE_IMPORT_FIELDS.map((field) => (
                        <option key={field.code} value={field.code}>
                          {field.label}
                          {field.required ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {csvData.slice(0, MAX_PREVIEW_ROWS).map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={`border-b transition-colors hover:bg-muted/50 ${
                    rowIndex === 0 && skipHeader ? "line-through text-muted-foreground" : ""
                  }`}
                >
                  {csvData[0].map((_, colIndex) => (
                    <td key={colIndex} className="p-4 align-middle">
                      {(row[colIndex] || "").toString().slice(0, 256)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {csvData.length > MAX_PREVIEW_ROWS && (
        <p className="text-muted-foreground text-sm">
          Showing first {MAX_PREVIEW_ROWS} rows. {csvData.length - MAX_PREVIEW_ROWS} more will also be imported.
        </p>
      )}
    </div>
  )
}
