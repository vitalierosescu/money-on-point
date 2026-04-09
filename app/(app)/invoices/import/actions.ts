"use server"

import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createInvoice } from "@/models/invoices"
import { createTransaction } from "@/models/transactions"
import {
  parseInvoiceRow,
  resolveOrCreateCustomer,
  buildImportedInvoiceItems,
  type ParsedInvoiceRow,
  type RowParseError,
} from "@/models/invoice-import"
import { parse } from "@fast-csv/parse"
import { revalidatePath } from "next/cache"

/**
 * Parse the uploaded CSV file into a 2D array of strings. Mirrors
 * `parseCSVAction` in `app/(app)/import/csv/actions.tsx` so the expense
 * and invoice import flows stay consistent.
 */
export async function parseInvoiceCsvAction(
  _prevState: ActionState<string[][]> | null,
  formData: FormData
): Promise<ActionState<string[][]>> {
  const file = formData.get("file") as File
  if (!file) {
    return { success: false, error: "No file uploaded" }
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return { success: false, error: "Only CSV files are allowed" }
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const rows: string[][] = []

    const parser = parse()
      .on("data", (row) => rows.push(row))
      .on("error", (error) => {
        throw error
      })
    parser.write(buffer)
    parser.end()

    await new Promise((resolve) => parser.on("end", resolve))

    return { success: true, data: rows }
  } catch (error) {
    console.error("Error parsing invoice CSV:", error)
    return { success: false, error: "Failed to parse CSV file" }
  }
}

export type DryRunResult = {
  validRows: number
  invalidRows: RowParseError[]
  duplicateInvoiceNumbers: string[]
  newCustomerNames: string[]
}

/**
 * Walk the parsed rows without writing anything. Surfaces how many rows
 * will import cleanly, how many have invoice-number collisions, how many
 * new customers will be created, and which rows fail validation.
 *
 * The client calls this after column mapping so the user can review
 * before committing.
 */
export async function dryRunInvoiceImportAction(
  rows: Record<string, string>[]
): Promise<ActionState<DryRunResult>> {
  try {
    const user = await getCurrentUser()

    const parsed: ParsedInvoiceRow[] = []
    const invalidRows: RowParseError[] = []

    rows.forEach((raw, idx) => {
      const result = parseInvoiceRow(idx + 1, raw)
      if (result.ok) {
        parsed.push(result.row)
      } else {
        invalidRows.push(result.error)
      }
    })

    // Look up which invoice numbers already exist for this user
    const invoiceNumbers = parsed.map((p) => p.invoiceNumber)
    const existing = invoiceNumbers.length
      ? await prisma.invoice.findMany({
          where: { userId: user.id, invoiceNumber: { in: invoiceNumbers } },
          select: { invoiceNumber: true },
        })
      : []
    const existingSet = new Set(existing.map((e) => e.invoiceNumber))
    const duplicateInvoiceNumbers = parsed.filter((p) => existingSet.has(p.invoiceNumber)).map((p) => p.invoiceNumber)

    // Count how many distinct customers would need to be created. We use
    // a case-insensitive name+email dedupe so the same customer appearing
    // on 50 rows only shows as 1.
    const newCustomerNames = new Set<string>()
    const existingCustomerKeys = new Set<string>()
    for (const row of parsed) {
      const key = `${row.customerName.toLowerCase()}|${(row.customerEmail ?? "").toLowerCase()}`
      if (existingCustomerKeys.has(key) || newCustomerNames.has(row.customerName)) continue

      const match = await prisma.customer.findFirst({
        where: {
          userId: user.id,
          name: { equals: row.customerName, mode: "insensitive" },
          ...(row.customerEmail
            ? { email: { equals: row.customerEmail, mode: "insensitive" } }
            : {}),
        },
        select: { id: true },
      })
      if (match) {
        existingCustomerKeys.add(key)
      } else {
        newCustomerNames.add(row.customerName)
      }
    }

    return {
      success: true,
      data: {
        validRows: parsed.length - duplicateInvoiceNumbers.length,
        invalidRows,
        duplicateInvoiceNumbers,
        newCustomerNames: Array.from(newCustomerNames),
      },
    }
  } catch (error) {
    console.error("Error in invoice import dry run:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Dry run failed",
    }
  }
}

export type SaveInvoiceImportResult = {
  imported: number
  skipped: number
  failed: RowParseError[]
}

/**
 * Actually create the invoices. Bypasses `createInvoiceAction` because
 * imported historical data shouldn't be gated on current-state Peppol
 * readiness, and we do NOT want to auto-create linked income transactions
 * by default (that would double-book accounting the user already has in
 * their old system).
 *
 * When `createLinkedTransactions` is true, mirrors the transaction
 * creation from `createInvoiceAction` for users who want their imported
 * invoices reflected in Reports from day one.
 */
export async function saveImportedInvoicesAction(
  rows: Record<string, string>[],
  options: {
    duplicateHandling: "skip" | "abort"
    createLinkedTransactions: boolean
  }
): Promise<ActionState<SaveInvoiceImportResult>> {
  try {
    const user = await getCurrentUser()

    const parsed: ParsedInvoiceRow[] = []
    const failed: RowParseError[] = []

    rows.forEach((raw, idx) => {
      const result = parseInvoiceRow(idx + 1, raw)
      if (result.ok) {
        parsed.push(result.row)
      } else {
        failed.push(result.error)
      }
    })

    // Pre-check duplicates so we can abort before writing anything
    if (parsed.length > 0) {
      const existing = await prisma.invoice.findMany({
        where: {
          userId: user.id,
          invoiceNumber: { in: parsed.map((p) => p.invoiceNumber) },
        },
        select: { invoiceNumber: true },
      })
      const duplicates = new Set(existing.map((e) => e.invoiceNumber))

      if (options.duplicateHandling === "abort" && duplicates.size > 0) {
        return {
          success: false,
          error: `${duplicates.size} invoice number(s) already exist. Import aborted.`,
        }
      }

      // Filter out duplicates in skip mode
      if (options.duplicateHandling === "skip") {
        for (let i = parsed.length - 1; i >= 0; i--) {
          if (duplicates.has(parsed[i].invoiceNumber)) {
            failed.push({
              rowNumber: parsed[i].rowNumber,
              reason: `Skipped: invoice number ${parsed[i].invoiceNumber} already exists`,
            })
            parsed.splice(i, 1)
          }
        }
      }
    }

    let imported = 0

    for (const row of parsed) {
      try {
        const { customer } = await resolveOrCreateCustomer(user.id, {
          customerName: row.customerName,
          customerEmail: row.customerEmail,
          customerVatNumber: row.customerVatNumber,
          customerCountry: row.customerCountry,
        })

        const items = buildImportedInvoiceItems(
          row.description,
          row.totalCents,
          row.subtotalCents,
          row.taxTotalCents
        )

        const invoice = await createInvoice(user.id, {
          customerId: customer.id,
          invoiceNumber: row.invoiceNumber,
          status: row.status,
          issuedAt: row.issuedAt,
          dueDate: row.dueDate,
          currency: row.currency,
          subtotal: row.subtotalCents,
          taxTotal: row.taxTotalCents,
          total: row.totalCents,
          items,
          paymentReference: row.paymentReference,
          poNumber: row.poNumber,
          notes: row.notes,
          // Imported invoices were delivered outside TaxHacker, so don't
          // claim Peppol delivery or the env indicator will lie.
          deliveryMethod: "email_pdf",
          deliveryStatus: "not_sent",
          peppolEnvironment: null,
        })

        // Mark paidAt on the invoice row if the CSV provided it
        if (row.paidAt) {
          await prisma.invoice.update({
            where: { id: invoice.id, userId: user.id },
            data: {
              paidAt: row.paidAt,
              paidAmount: row.totalCents,
            },
          })
        }

        if (options.createLinkedTransactions) {
          const transaction = await createTransaction(user.id, {
            name: invoice.invoiceNumber,
            merchant: null,
            total: invoice.total,
            currencyCode: invoice.currency,
            type: "income",
            issuedAt: invoice.issuedAt,
            categoryCode: "invoice",
            customerId: invoice.customerId ?? null,
          })
          await prisma.invoice.update({
            where: { id: invoice.id, userId: user.id },
            data: { transactionId: transaction.id },
          })
        }

        imported += 1
      } catch (error) {
        console.error("Failed to import invoice row:", row.rowNumber, error)
        failed.push({
          rowNumber: row.rowNumber,
          reason: error instanceof Error ? error.message : "Unknown error during import",
        })
      }
    }

    const skipped = failed.filter((f) => f.reason.startsWith("Skipped")).length

    if (imported > 0) {
      revalidatePath("/invoices")
    }

    return {
      success: true,
      data: {
        imported,
        skipped,
        failed: failed.filter((f) => !f.reason.startsWith("Skipped")),
      },
    }
  } catch (error) {
    console.error("Error saving imported invoices:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save imported invoices",
    }
  }
}
