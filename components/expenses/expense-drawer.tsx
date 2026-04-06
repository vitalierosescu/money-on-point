"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { Category, Transaction } from "@/prisma/client"
import {
  markExpensePaidAction,
  markExpenseToPayAction,
  markExpenseUnpaidAction,
  updateExpenseAction,
  duplicateExpenseAction,
  createCreditNoteAction,
  deleteExpenseAction,
  uploadAndAttachFileToExpenseAction,
} from "@/app/(app)/expenses/actions"
import { Loader2, Pencil, Copy, CreditCard, Trash2, Download, CheckCircle, ExternalLink, FileX, Upload } from "lucide-react"
import Link from "next/link"
import { getExpenseStatusMeta } from "@/lib/expense-status"

type ExpenseDrawerProps = {
  expense: Transaction & { category?: Category | null }
  open: boolean
  onClose: () => void
  categories: Category[]
  defaultCurrency: string
}

function formatAmount(cents: number | null | undefined, currencyCode: string | null | undefined): string {
  if (cents === null || cents === undefined) return "—"
  const currency = currencyCode?.trim() || "EUR"
  try {
    return new Intl.NumberFormat("nl-BE", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100)
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`
  }
}

function parseAmountToCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".")
  if (!normalized) return null
  const parsed = parseFloat(normalized)
  if (Number.isNaN(parsed)) return null
  return Math.round(parsed * 100)
}

function normalizeCurrencyCode(value: string): string | null {
  const normalized = value.trim().toUpperCase()
  return normalized ? normalized : null
}

export function ExpenseDrawer({ expense, open, onClose, categories, defaultCurrency }: ExpenseDrawerProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [merchant, setMerchant] = useState(expense.merchant ?? "")
  const [total, setTotal] = useState(expense.total !== null ? (expense.total / 100).toFixed(2) : "")
  const [currencyCode, setCurrencyCode] = useState(expense.currencyCode ?? "")
  const [convertedTotal, setConvertedTotal] = useState(
    expense.convertedTotal !== null && expense.convertedTotal !== undefined
      ? (expense.convertedTotal / 100).toFixed(2)
      : ""
  )
  const [convertedCurrencyCode, setConvertedCurrencyCode] = useState(
    expense.convertedCurrencyCode ?? defaultCurrency
  )
  const [dueDate, setDueDate] = useState(
    expense.dueDate ? new Date(expense.dueDate as Date).toISOString().split("T")[0] : ""
  )
  const [categoryCode, setCategoryCode] = useState(expense.categoryCode ?? "")
  const [note, setNote] = useState(expense.note ?? "")
  const [taxAmount, setTaxAmount] = useState<string>(
    expense.taxAmount !== null && expense.taxAmount !== undefined
      ? (expense.taxAmount / 100).toFixed(2)
      : ""
  )

  const files = Array.isArray(expense.files) ? (expense.files as string[]) : []
  const status = expense.status ?? "unpaid"
  const statusInfo = getExpenseStatusMeta(status, "nl")

  useEffect(() => {
    setIsEditing(false)
    setMerchant(expense.merchant ?? "")
    setTotal(expense.total !== null ? (expense.total / 100).toFixed(2) : "")
    setCurrencyCode(expense.currencyCode ?? "")
    setConvertedTotal(
      expense.convertedTotal !== null && expense.convertedTotal !== undefined
        ? (expense.convertedTotal / 100).toFixed(2)
        : ""
    )
    setConvertedCurrencyCode(expense.convertedCurrencyCode ?? defaultCurrency)
    setDueDate(expense.dueDate ? new Date(expense.dueDate as Date).toISOString().split("T")[0] : "")
    setCategoryCode(expense.categoryCode ?? "")
    setNote(expense.note ?? "")
    setTaxAmount(
      expense.taxAmount !== null && expense.taxAmount !== undefined
        ? (expense.taxAmount / 100).toFixed(2)
        : ""
    )
  }, [defaultCurrency, expense])

  function run(action: () => Promise<{ success: boolean }>) {
    startTransition(async () => {
      await action()
      onClose()
    })
  }

  function handleSave() {
    startTransition(async () => {
      await updateExpenseAction(expense.id, {
        merchant: merchant || null,
        total: parseAmountToCents(total),
        currencyCode: normalizeCurrencyCode(currencyCode),
        convertedTotal: parseAmountToCents(convertedTotal),
        convertedCurrencyCode: normalizeCurrencyCode(convertedCurrencyCode),
        dueDate: dueDate ? new Date(dueDate) : null,
        categoryCode: categoryCode || null,
        note: note || null,
        taxAmount: parseAmountToCents(taxAmount),
      })
      setIsEditing(false)
      onClose()
    })
  }

  async function handleFileUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setUploadError("")
    setIsUploading(true)
    try {
      const formData = new FormData()
      for (let i = 0; i < fileList.length; i++) {
        formData.append("files", fileList[i])
      }
      const result = await uploadAndAttachFileToExpenseAction(expense.id, formData)
      if (result.success) {
        onClose()
      } else {
        setUploadError(result.error ?? "Upload mislukt")
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload mislukt")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-4xl p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b flex flex-row items-center justify-between">
          <SheetTitle className="text-base font-semibold">
            {expense.merchant ?? expense.name ?? "Expense"}
          </SheetTitle>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.className}`}>
              {statusInfo.label}
            </span>
            {!isEditing && (
              <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left panel: details */}
          <div className="w-72 border-r flex flex-col overflow-y-auto">
            <div className="flex-1 p-4 space-y-4">
              {isEditing ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">Merchant</Label>
                    <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={total}
                      onChange={(e) => setTotal(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">Currency</Label>
                    <Input
                      value={currencyCode}
                      onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                      maxLength={5}
                      placeholder="USD"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">BTW / Belasting</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={taxAmount}
                      onChange={(e) => setTaxAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">Converted Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={convertedTotal}
                      onChange={(e) => setConvertedTotal(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">Converted Currency</Label>
                    <Input
                      value={convertedCurrencyCode}
                      onChange={(e) => setConvertedCurrencyCode(e.target.value.toUpperCase())}
                      maxLength={5}
                      placeholder={defaultCurrency}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">Due Date</Label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">Category</Label>
                    <Select value={categoryCode} onValueChange={setCategoryCode}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground uppercase">Note</Label>
                    <Input value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  {(
                    [
                      ["Merchant", expense.merchant ?? "—"],
                      [
                        "Amount",
                        formatAmount(expense.total, expense.currencyCode),
                      ],
                      [
                        "BTW/Belasting",
                        formatAmount(expense.taxAmount, expense.currencyCode),
                      ],
                      [
                        "Converted",
                        formatAmount(expense.convertedTotal, expense.convertedCurrencyCode ?? defaultCurrency),
                      ],
                      [
                        "Date",
                        expense.issuedAt
                          ? new Date(expense.issuedAt).toLocaleDateString("nl-BE")
                          : "—",
                      ],
                      [
                        "Due Date",
                        expense.dueDate
                          ? new Date(expense.dueDate).toLocaleDateString("nl-BE")
                          : "—",
                      ],
                      ["Category", expense.category?.name ?? "—"],
                      ["Note", expense.note ?? "—"],
                    ] as [string, string][]
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="flex justify-between text-sm py-1.5 border-b last:border-0"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium text-right max-w-[55%] truncate">{value}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 border-t space-y-2">
              {isEditing ? (
                <>
                  <Button className="w-full" onClick={handleSave} disabled={isPending}>
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Opslaan
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setIsEditing(false)}
                  >
                    Annuleren
                  </Button>
                </>
              ) : (
                <>
                  {status !== "paid" && (
                    <Button
                      className="w-full"
                      onClick={() => run(() => markExpensePaidAction(expense.id))}
                      disabled={isPending}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Markeren als betaald
                    </Button>
                  )}
                  {status === "unpaid" && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => run(() => markExpenseToPayAction(expense.id))}
                      disabled={isPending}
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      Te betalen
                    </Button>
                  )}
                  {status === "to_pay" && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => run(() => markExpenseUnpaidAction(expense.id))}
                      disabled={isPending}
                    >
                      Terug naar nieuw
                    </Button>
                  )}
                  {files.length > 0 && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        files.forEach((fileId) => {
                          window.open(`/files/download/${fileId}`, "_blank")
                        })
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download PDF
                    </Button>
                  )}
                  {files.length > 0 && (
                    <Button variant="outline" className="w-full" asChild>
                      <Link href="/files">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open File Library
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => run(() => duplicateExpenseAction(expense.id))}
                    disabled={isPending}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Dupliceren
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => run(() => createCreditNoteAction(expense.id))}
                    disabled={isPending}
                  >
                    <FileX className="mr-2 h-4 w-4" />
                    Creditnota aanmaken
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full border-destructive/20 text-destructive hover:bg-destructive/5"
                    onClick={() => {
                      if (confirm("Expense verwijderen?")) {
                        run(() => deleteExpenseAction(expense.id))
                      }
                    }}
                    disabled={isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Verwijderen
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Right panel: file preview + upload zone */}
          <div className="flex-1 min-h-0 bg-muted/30 p-3 flex flex-col gap-3 overflow-y-auto">
            {files.length > 0 ? (
              files.map((fileId) => (
                <iframe
                  key={fileId}
                  src={`/files/preview/${fileId}`}
                  className="w-full flex-1 min-h-[400px] border rounded-lg bg-background"
                  title="Document preview"
                />
              ))
            ) : (
              <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
                <p>Geen bestanden gekoppeld</p>
              </div>
            )}

            {/* Upload zone */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragOver(false)
                handleFileUpload(e.dataTransfer.files)
              }}
              disabled={isUploading}
              className={`w-full border-2 border-dashed rounded-lg px-4 py-3 flex items-center justify-center gap-2 text-sm transition-colors cursor-pointer
                ${isDragOver
                  ? "border-foreground/40 bg-muted/60 text-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:bg-muted/50"
                }
                ${isUploading ? "opacity-50 cursor-not-allowed" : ""}
              `}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span>{isUploading ? "Uploaden..." : "Bestanden toevoegen"}</span>
            </button>
            {uploadError && (
              <p className="text-xs text-destructive">{uploadError}</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
