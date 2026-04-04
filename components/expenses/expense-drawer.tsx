"use client"

import { useState, useTransition } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Category, Transaction } from "@/prisma/client"
import {
  markExpensePaidAction,
  markExpenseToPayAction,
  markExpenseUnpaidAction,
  updateExpenseAction,
  duplicateExpenseAction,
  deleteExpenseAction,
} from "@/app/(app)/expenses/actions"
import { Loader2, Pencil, Copy, CreditCard, Trash2, Download, CheckCircle } from "lucide-react"

type ExpenseDrawerProps = {
  expense: Transaction & { category?: Category | null }
  open: boolean
  onClose: () => void
  categories: Category[]
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  unpaid:  { label: "Nieuw",         className: "bg-yellow-100 text-yellow-800" },
  to_pay:  { label: "Te betalen",    className: "bg-blue-100 text-blue-800" },
  paid:    { label: "Betaald",       className: "bg-green-100 text-green-800" },
  overdue: { label: "Achterstallig", className: "bg-red-100 text-red-800" },
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

  const files = Array.isArray(expense.files) ? (expense.files as string[]) : []
  const status = expense.status ?? "unpaid"
  const statusInfo = STATUS_LABELS[status] ?? STATUS_LABELS.unpaid

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
            <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
            {!isEditing && (
              <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex flex-1 overflow-hidden">
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
          <div className="flex-1 bg-muted/30 flex flex-col items-center justify-center p-4 gap-4 overflow-y-auto">
            {files.length > 0 ? (
              files.map((fileId) => (
                <div key={fileId} className="w-full max-w-2xl">
                  <iframe
                    src={`/files/preview/${fileId}`}
                    className="w-full h-[700px] border rounded-lg bg-white"
                    title="Document preview"
                  />
                </div>
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
