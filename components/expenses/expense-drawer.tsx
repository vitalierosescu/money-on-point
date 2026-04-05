"use client"

import { useState, useTransition } from "react"
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
} from "@/app/(app)/expenses/actions"
import { Loader2, Pencil, Copy, CreditCard, Trash2, Download, CheckCircle, FileX } from "lucide-react"
import { EXPENSE_STATUS_LABELS } from "@/lib/expense-status"

type ExpenseDrawerProps = {
  expense: Transaction & { category?: Category | null }
  open: boolean
  onClose: () => void
  categories: Category[]
}

export function ExpenseDrawer({ expense, open, onClose, categories }: ExpenseDrawerProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [merchant, setMerchant] = useState(expense.merchant ?? "")
  const [total, setTotal] = useState(expense.total !== null ? (expense.total / 100).toFixed(2) : "")
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
  const statusInfo = EXPENSE_STATUS_LABELS[status] ?? EXPENSE_STATUS_LABELS.unpaid

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
        total: total ? Math.round(parseFloat(total) * 100) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        categoryCode: categoryCode || null,
        note: note || null,
        taxAmount: taxAmount !== "" ? Math.round(parseFloat(taxAmount) * 100) : null,
      })
      setIsEditing(false)
    })
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
                        expense.total !== null
                          ? `${expense.currencyCode ?? ""} ${(expense.total / 100).toFixed(2)}`
                          : "—",
                      ],
                      [
                        "BTW/Belasting",
                        expense.taxAmount != null
                          ? `${expense.currencyCode ?? ""} ${(expense.taxAmount / 100).toFixed(2)}`
                          : "–",
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
                    className="w-full border-red-200 text-red-600 hover:bg-red-50"
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

          {/* Right panel: file preview */}
          <div className="flex-1 min-h-0 bg-muted/30 p-3 overflow-hidden">
            {files.length > 0 ? (
              files.map((fileId) => (
                <iframe
                  key={fileId}
                  src={`/files/preview/${fileId}`}
                  className="w-full h-full border rounded-lg bg-white"
                  title="Document preview"
                />
              ))
            ) : (
              <div className="text-center text-muted-foreground">
                <p>Geen bestanden gekoppeld</p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
