"use client"

import {
  archiveCustomerAction,
  deleteCustomerAction,
  getCustomerDeletionInfoAction,
  restoreCustomerAction,
} from "@/app/(app)/customers/actions"
import { CustomerAvatar } from "@/components/customers/customer-avatar"
import { CustomerEditPanel } from "@/components/customers/customer-edit-panel"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  getDefaultInvoiceDeliveryMethod,
  getInvoiceDeliveryMethodLabel,
  normalizeCustomerInvoiceDeliveryMethod,
} from "@/lib/invoice-delivery"
import { CustomerWithInvoiceStats } from "@/models/customers"
import { ArchiveRestore, Archive, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

const amountFormatter = new Intl.NumberFormat("nl-BE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatCurrencyTotals(totals: Record<string, number>) {
  const entries = Object.entries(totals).filter(([, amount]) => amount > 0)
  if (entries.length === 0) return "—"
  return entries
    .map(([currency, amount]) => `${currency} ${amountFormatter.format(amount / 100)}`)
    .join(" · ")
}

type StatusFilter = "all" | "active" | "inactive" | "no_invoices"
type DeliveryFilter = "all" | "manual_choice" | "email_pdf" | "peppol"
type ArchivedFilter = "active" | "archived" | "all"

type DeleteDialogState =
  | { open: false }
  | {
      open: true
      customerId: string
      customerName: string
      invoiceCount: number
      loading: boolean
      error: string | null
    }

export function CustomerList({ customers }: { customers: CustomerWithInvoiceStats[] }) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("all")
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>("active")
  const [items, setItems] = useState<CustomerWithInvoiceStats[]>(customers)
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({ open: false })

  useEffect(() => {
    setItems(customers)
  }, [customers])

  const filtered = useMemo(() => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    return items.filter((customer) => {
      if (archivedFilter === "active" && customer.archivedAt) return false
      if (archivedFilter === "archived" && !customer.archivedAt) return false

      const q = search.trim().toLowerCase()
      if (q) {
        const matches =
          customer.name.toLowerCase().includes(q) ||
          (customer.email ?? "").toLowerCase().includes(q) ||
          (customer.contactPerson ?? "").toLowerCase().includes(q) ||
          (customer.vatNumber ?? "").toLowerCase().includes(q) ||
          (customer.peppolId ?? "").toLowerCase().includes(q)
        if (!matches) return false
      }

      if (statusFilter !== "all") {
        const hasInvoices = customer.totalInvoicesCount > 0
        const lastInvoiceAt = customer.lastInvoiceAt ? new Date(customer.lastInvoiceAt) : null
        const isActive = Boolean(lastInvoiceAt && lastInvoiceAt >= thirtyDaysAgo)
        if (statusFilter === "no_invoices" && hasInvoices) return false
        if (statusFilter === "active" && (!hasInvoices || !isActive)) return false
        if (statusFilter === "inactive" && (!hasInvoices || isActive)) return false
      }

      if (deliveryFilter !== "all") {
        const preference = normalizeCustomerInvoiceDeliveryMethod(customer.invoiceDeliveryMethod)
        if (deliveryFilter === "manual_choice") {
          if (preference !== "manual_choice") return false
        } else {
          const method = getDefaultInvoiceDeliveryMethod(customer)
          if (method !== deliveryFilter) return false
        }
      }

      return true
    })
  }, [items, search, statusFilter, deliveryFilter, archivedFilter])

  const openDeleteDialog = async (id: string, name: string) => {
    setDeleteDialog({
      open: true,
      customerId: id,
      customerName: name,
      invoiceCount: 0,
      loading: true,
      error: null,
    })
    const result = await getCustomerDeletionInfoAction(id)
    const invoiceCount = result.success ? result.data.invoiceCount : 0
    setDeleteDialog((prev) =>
      prev.open && prev.customerId === id
        ? { ...prev, invoiceCount, loading: false }
        : prev
    )
  }

  const closeDeleteDialog = () => setDeleteDialog({ open: false })

  const handleConfirmArchive = async () => {
    if (!deleteDialog.open) return
    const { customerId } = deleteDialog
    setDeleteDialog({ ...deleteDialog, loading: true, error: null })
    const result = await archiveCustomerAction(customerId)
    if (!result.success) {
      setDeleteDialog({ ...deleteDialog, loading: false, error: "Failed to archive customer." })
      return
    }
    setItems((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, archivedAt: new Date() } : c))
    )
    closeDeleteDialog()
  }

  const handleConfirmDelete = async () => {
    if (!deleteDialog.open) return
    const { customerId } = deleteDialog
    setDeleteDialog({ ...deleteDialog, loading: true, error: null })
    const result = await deleteCustomerAction(customerId)
    if (!result.success) {
      setDeleteDialog({
        ...deleteDialog,
        loading: false,
        error: result.error ?? "Failed to delete customer.",
      })
      return
    }
    setItems((prev) => prev.filter((c) => c.id !== customerId))
    closeDeleteDialog()
  }

  const handleRestore = async (id: string) => {
    const result = await restoreCustomerAction(id)
    if (!result.success) return
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, archivedAt: null } : c)))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
          <SelectTrigger className="h-9 w-[170px] text-sm">
            <SelectValue placeholder="Activity filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            <SelectItem value="active">Active (30d)</SelectItem>
            <SelectItem value="inactive">Inactive (30d)</SelectItem>
            <SelectItem value="no_invoices">No invoices</SelectItem>
          </SelectContent>
        </Select>
        <Select value={archivedFilter} onValueChange={(value) => setArchivedFilter(value as ArchivedFilter)}>
          <SelectTrigger className="h-9 w-[150px] text-sm">
            <SelectValue placeholder="Archive filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={deliveryFilter} onValueChange={(value) => setDeliveryFilter(value as DeliveryFilter)}>
          <SelectTrigger className="h-9 w-[200px] text-sm">
            <SelectValue placeholder="Delivery method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All delivery methods</SelectItem>
            <SelectItem value="manual_choice">Choose automatically</SelectItem>
            <SelectItem value="email_pdf">Email + PDF</SelectItem>
            <SelectItem value="peppol">PEPPOL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && closeDeleteDialog()}>
        <DialogContent>
          {deleteDialog.open ? (
            deleteDialog.loading && deleteDialog.invoiceCount === 0 && !deleteDialog.error ? (
              <DialogHeader>
                <DialogTitle>Checking…</DialogTitle>
                <DialogDescription>Looking up related invoices.</DialogDescription>
              </DialogHeader>
            ) : deleteDialog.invoiceCount > 0 ? (
              <>
                <DialogHeader>
                  <DialogTitle>Archive {deleteDialog.customerName}?</DialogTitle>
                  <DialogDescription>
                    {deleteDialog.customerName} has {deleteDialog.invoiceCount}{" "}
                    {deleteDialog.invoiceCount === 1 ? "invoice" : "invoices"}. Invoices are kept as
                    legal records and can&apos;t be deleted. You can archive this customer instead —
                    they&apos;ll be hidden from your active list and dropdowns, but all invoices
                    remain accessible. You can restore them at any time.
                  </DialogDescription>
                </DialogHeader>
                {deleteDialog.error ? (
                  <p className="text-sm text-destructive">{deleteDialog.error}</p>
                ) : null}
                <DialogFooter>
                  <Button variant="ghost" onClick={closeDeleteDialog} disabled={deleteDialog.loading}>
                    Cancel
                  </Button>
                  <Button onClick={handleConfirmArchive} disabled={deleteDialog.loading}>
                    <Archive className="h-4 w-4 mr-2" />
                    Archive customer
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Delete {deleteDialog.customerName}?</DialogTitle>
                  <DialogDescription>
                    This customer has no invoices and can be permanently deleted. This cannot be
                    undone.
                  </DialogDescription>
                </DialogHeader>
                {deleteDialog.error ? (
                  <p className="text-sm text-destructive">{deleteDialog.error}</p>
                ) : null}
                <DialogFooter>
                  <Button variant="ghost" onClick={closeDeleteDialog} disabled={deleteDialog.loading}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteDialog.loading}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete permanently
                  </Button>
                </DialogFooter>
              </>
            )
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Last Invoice</TableHead>
              <TableHead>Open</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {search || statusFilter !== "all" || deliveryFilter !== "all"
                    ? "No customers match your filters."
                    : "No customers yet."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((customer) => (
                <TableRow key={customer.id} className={customer.archivedAt ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="inline-flex items-center gap-2 hover:underline"
                    >
                      <CustomerAvatar name={customer.name} website={customer.website} size="sm" />
                      <span>{customer.name}</span>
                    </Link>
                    {customer.archivedAt ? (
                      <span className="ml-2 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                        Archived
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{customer.email || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {customer.lastInvoiceAt
                      ? new Date(customer.lastInvoiceAt).toLocaleDateString("nl-BE", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-sm">
                        {customer.openInvoicesCount} open
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatCurrencyTotals(customer.openBalanceByCurrency)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{getInvoiceDeliveryMethodLabel(getDefaultInvoiceDeliveryMethod(customer))}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Link href={`/invoices/new?customerId=${customer.id}`}>
                        <Button variant="ghost" size="icon">
                          <Plus className="h-4 w-4" />
                          <span className="sr-only">New invoice</span>
                        </Button>
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <CustomerEditPanel
                            customer={customer}
                            onSuccess={(updated) =>
                              setItems((prev) =>
                                prev.map((item) =>
                                  item.id === updated.id ? { ...item, ...updated } : item
                                )
                              )
                            }
                            trigger={
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                            }
                          />
                          {customer.archivedAt ? (
                            <DropdownMenuItem onSelect={() => handleRestore(customer.id)}>
                              <ArchiveRestore className="h-4 w-4 mr-2" />
                              Restore
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => openDeleteDialog(customer.id, customer.name)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
