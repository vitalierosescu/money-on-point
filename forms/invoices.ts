import { z } from "zod"

export const invoiceItemSchema = z.object({
  name: z.string().min(1),
  subtitle: z.string().optional(),
  quantity: z.number().min(0),
  unitPrice: z.number(),
  taxRate: z.number().default(21),
  subtotal: z.number(),
})

export const invoiceSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  issuedAt: z.string().min(1, "Invoice date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  currency: z.string().default("EUR"),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
  taxes: z
    .array(z.object({ name: z.string(), rate: z.number(), amount: z.number() }))
    .optional(),
  fees: z
    .array(z.object({ name: z.string(), amount: z.number() }))
    .optional(),
  paymentReference: z.string().optional(),
  poNumber: z.string().optional(),
  subject: z.string().optional(),
  notes: z.string().optional(),
  paymentTerms: z.string().optional(),
  isVatReversed: z.boolean().default(false),
})

export type InvoiceFormInput = z.infer<typeof invoiceSchema>
