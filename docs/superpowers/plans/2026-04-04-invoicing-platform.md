# Invoicing Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add customer management, full invoice lifecycle, and separate income/expense views to TaxHacker.

**Architecture:** Separate Invoice and Customer models linked to existing Transaction model. Invoice manages its own lifecycle (draft/sent/paid/overdue/cancelled). When an invoice is marked as paid, it creates a linked Transaction record so income flows into existing dashboard/reporting. Expenses page is a filtered view of existing transactions.

**Tech Stack:** Next.js 15, Prisma 6, PostgreSQL 17, React 19, Radix UI, Tailwind CSS, @react-pdf/renderer

**Spec:** `docs/superpowers/specs/2026-04-04-invoicing-platform-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `prisma/migrations/XXXXXX_add_customers_invoices/migration.sql` | DB migration for Customer, Invoice, Payment tables + Transaction.customerId |
| `models/customers.ts` | Customer CRUD operations |
| `models/invoices.ts` | Invoice CRUD, lifecycle helpers, auto-numbering |
| `models/payments.ts` | Payment CRUD, partial payment logic |
| `forms/customers.ts` | Customer form validation schema (Zod) |
| `forms/invoices.ts` | Invoice form validation schema (Zod) |
| `app/(app)/customers/page.tsx` | Customer list page (server component) |
| `app/(app)/customers/[id]/page.tsx` | Customer detail page |
| `app/(app)/customers/actions.ts` | Customer server actions |
| `app/(app)/invoices/page.tsx` | Invoice list page (server component) |
| `app/(app)/invoices/new/page.tsx` | Create invoice page |
| `app/(app)/invoices/[id]/page.tsx` | Invoice detail page |
| `app/(app)/invoices/[id]/edit/page.tsx` | Edit draft invoice |
| `app/(app)/invoices/actions.ts` | Invoice server actions |
| `app/(app)/expenses/page.tsx` | Expense list (filtered transactions, server component) |
| `app/(app)/expenses/actions.ts` | Expense-specific actions (reuses transaction actions) |
| `app/(app)/expenses/layout.tsx` | Expenses layout with metadata |
| `app/(app)/expenses/loading.tsx` | Loading state |
| `components/customers/customer-list.tsx` | Customer table component |
| `components/customers/customer-summary-cards.tsx` | Summary cards (most active, inactive, etc.) |
| `components/customers/customer-edit-panel.tsx` | Slide-out edit panel (Sheet) |
| `components/customers/customer-picker.tsx` | Customer selector with tabs (existing/new) for invoice form |
| `components/invoices/invoice-list.tsx` | Invoice table grouped by month |
| `components/invoices/invoice-status-badge.tsx` | Status badge component |
| `components/invoices/invoice-form.tsx` | Invoice creation/edit form |
| `components/invoices/invoice-actions.tsx` | Status action buttons |
| `components/invoices/payment-dialog.tsx` | Record payment dialog |

### Modified files

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add Customer, Invoice, Payment models; add customerId to Transaction |
| `components/sidebar/sidebar.tsx` | Update nav items: add Invoices, Expenses, Customers; remove Transactions |
| `components/sidebar/mobile-menu.tsx` | Mirror sidebar nav changes |
| `app/(app)/layout.tsx` | No changes needed (sidebar handles nav) |
| `models/defaults.ts` | Add `invoice_starting_number` and `invoice_default_payment_terms` to DEFAULT_SETTINGS |
| `app/(app)/apps/invoices/components/invoice-pdf.tsx` | Accept customer data for "Bill To" instead of free text |

---

## Tasks

### Task 1: Database Schema - Customer, Invoice, Payment models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Customer model to schema**

Add after the `Currency` model in `prisma/schema.prisma`:

```prisma
model Customer {
  id              String        @id @default(uuid()) @db.Uuid
  userId          String        @map("user_id") @db.Uuid
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  name            String
  email           String?
  billingEmails   Json?         @map("billing_emails")
  phone           String?
  website         String?
  contactPerson   String?       @map("contact_person")

  street          String?
  houseNumber     String?       @map("house_number")
  bus             String?
  zipCode         String?       @map("zip_code")
  city            String?
  country         String?       @default("Belgium")

  vatNumber       String?       @map("vat_number")
  peppolId        String?       @map("peppol_id")
  defaultRate     Decimal?      @map("default_rate")
  defaultCurrency String?       @default("EUR") @map("default_currency")
  note            String?

  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  invoices        Invoice[]
  transactions    Transaction[]

  @@unique([userId, id])
  @@map("customers")
}
```

- [ ] **Step 2: Add Invoice model to schema**

Add after Customer model:

```prisma
model Invoice {
  id               String    @id @default(uuid()) @db.Uuid
  userId           String    @map("user_id") @db.Uuid
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  customerId       String    @map("customer_id") @db.Uuid
  customer         Customer  @relation(fields: [customerId], references: [id])

  invoiceNumber    String    @map("invoice_number")
  status           String    @default("draft")

  issuedAt         DateTime  @map("issued_at")
  dueDate          DateTime  @map("due_date")
  paidAt           DateTime? @map("paid_at")

  currency         String    @default("EUR")
  subtotal         Int       @default(0)
  taxTotal         Int       @default(0) @map("tax_total")
  total            Int       @default(0)
  paidAmount       Int       @default(0) @map("paid_amount")

  items            Json      @default("[]")
  taxes            Json?
  fees             Json?

  paymentReference String?   @map("payment_reference")
  poNumber         String?   @map("po_number")
  subject          String?
  notes            String?
  paymentTerms     String?   @map("payment_terms")
  isVatReversed    Boolean   @default(false) @map("is_vat_reversed")

  templateData     Json?     @map("template_data")
  pdfPath          String?   @map("pdf_path")

  transactionId    String?   @unique @map("transaction_id") @db.Uuid
  transaction      Transaction? @relation(fields: [transactionId], references: [id])

  payments         Payment[]

  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  @@unique([userId, invoiceNumber])
  @@index([userId])
  @@index([status])
  @@index([customerId])
  @@map("invoices")
}
```

- [ ] **Step 3: Add Payment model to schema**

Add after Invoice model:

```prisma
model Payment {
  id         String   @id @default(uuid()) @db.Uuid
  invoiceId  String   @map("invoice_id") @db.Uuid
  invoice    Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  amount     Int
  paidAt     DateTime @map("paid_at")
  note       String?

  createdAt  DateTime @default(now()) @map("created_at")

  @@map("payments")
}
```

- [ ] **Step 4: Add customerId to Transaction model**

In the existing Transaction model, add after the `text` field:

```prisma
  customerId        String?   @map("customer_id") @db.Uuid
  customer          Customer? @relation(fields: [customerId], references: [id])
  invoice           Invoice?
```

- [ ] **Step 5: Add relations to User model**

In the existing User model, add after the `progress` relation:

```prisma
  customers         Customer[]
  invoices          Invoice[]
```

- [ ] **Step 6: Run migration**

Run: `npx prisma migrate dev --name add_customers_invoices`

Expected: Migration creates customers, invoices, payments tables and adds customer_id to transactions.

- [ ] **Step 7: Generate Prisma client**

Run: `npx prisma generate`

Expected: Prisma Client regenerated with new types.

- [ ] **Step 8: Commit**

```bash
git add prisma/
git commit -m "feat: add Customer, Invoice, Payment models to schema"
```

---

### Task 2: Customer Model Layer

**Files:**
- Create: `models/customers.ts`
- Create: `forms/customers.ts`

- [ ] **Step 1: Create customer form validation**

Create `forms/customers.ts`:

```typescript
import { z } from "zod"

export const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  billingEmails: z.array(z.string().email()).optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  contactPerson: z.string().optional(),
  street: z.string().optional(),
  houseNumber: z.string().optional(),
  bus: z.string().optional(),
  zipCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  vatNumber: z.string().optional(),
  peppolId: z.string().optional(),
  defaultRate: z.number().optional(),
  defaultCurrency: z.string().optional(),
  note: z.string().optional(),
})

export type CustomerFormData = z.infer<typeof customerSchema>
```

- [ ] **Step 2: Create customer model**

Create `models/customers.ts`:

```typescript
import { prisma } from "@/lib/db"
import { Customer, Prisma } from "@/prisma/client"
import { cache } from "react"

export type CustomerData = {
  name: string
  email?: string | null
  billingEmails?: string[] | null
  phone?: string | null
  website?: string | null
  contactPerson?: string | null
  street?: string | null
  houseNumber?: string | null
  bus?: string | null
  zipCode?: string | null
  city?: string | null
  country?: string | null
  vatNumber?: string | null
  peppolId?: string | null
  defaultRate?: number | null
  defaultCurrency?: string | null
  note?: string | null
}

export const getCustomers = cache(
  async (userId: string, search?: string): Promise<Customer[]> => {
    const where: Prisma.CustomerWhereInput = { userId }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { contactPerson: { contains: search, mode: "insensitive" } },
      ]
    }

    return prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
    })
  }
)

export const getCustomerById = cache(
  async (id: string, userId: string): Promise<Customer | null> => {
    return prisma.customer.findFirst({
      where: { id, userId },
    })
  }
)

export const createCustomer = async (
  userId: string,
  data: CustomerData
): Promise<Customer> => {
  return prisma.customer.create({
    data: {
      ...data,
      billingEmails: data.billingEmails ?? [],
      userId,
    },
  })
}

export const updateCustomer = async (
  id: string,
  userId: string,
  data: CustomerData
): Promise<Customer> => {
  return prisma.customer.update({
    where: { id },
    data: {
      ...data,
      billingEmails: data.billingEmails ?? [],
    },
  })
}

export const deleteCustomer = async (
  id: string,
  userId: string
): Promise<Customer> => {
  return prisma.customer.delete({
    where: { id },
  })
}

export const getCustomerStats = cache(async (userId: string) => {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const customers = await prisma.customer.findMany({
    where: { userId },
    include: {
      invoices: {
        select: { id: true, total: true, status: true, issuedAt: true },
      },
    },
  })

  const newCustomers = customers.filter(
    (c) => c.createdAt >= thirtyDaysAgo
  ).length

  const activeCustomers = customers.filter((c) =>
    c.invoices.some((inv) => inv.issuedAt >= thirtyDaysAgo)
  )

  const mostActive = activeCustomers.sort(
    (a, b) =>
      b.invoices.filter((i) => i.issuedAt >= thirtyDaysAgo).length -
      a.invoices.filter((i) => i.issuedAt >= thirtyDaysAgo).length
  )[0]

  const topRevenue = customers.sort(
    (a, b) =>
      b.invoices
        .filter((i) => i.issuedAt >= thirtyDaysAgo && i.status === "paid")
        .reduce((sum, i) => sum + i.total, 0) -
      a.invoices
        .filter((i) => i.issuedAt >= thirtyDaysAgo && i.status === "paid")
        .reduce((sum, i) => sum + i.total, 0)
  )[0]

  const inactiveCount = customers.filter(
    (c) => !c.invoices.some((inv) => inv.issuedAt >= thirtyDaysAgo)
  ).length

  return { mostActive, topRevenue, inactiveCount, newCustomers }
})
```

- [ ] **Step 3: Commit**

```bash
git add models/customers.ts forms/customers.ts
git commit -m "feat: add customer model layer and validation"
```

---

### Task 3: Invoice Model Layer

**Files:**
- Create: `models/invoices.ts`
- Create: `models/payments.ts`
- Create: `forms/invoices.ts`
- Modify: `models/defaults.ts`

- [ ] **Step 1: Create invoice form validation**

Create `forms/invoices.ts`:

```typescript
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
```

- [ ] **Step 2: Create invoice model**

Create `models/invoices.ts`:

```typescript
import { prisma } from "@/lib/db"
import { Invoice, Prisma } from "@/prisma/client"
import { cache } from "react"

export type InvoiceFilters = {
  status?: string
  customerId?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}

export const getInvoices = cache(
  async (userId: string, filters?: InvoiceFilters): Promise<Invoice[]> => {
    const where: Prisma.InvoiceWhereInput = { userId }

    if (filters?.status) {
      where.status = filters.status
    }
    if (filters?.customerId) {
      where.customerId = filters.customerId
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.issuedAt = {
        gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
      }
    }
    if (filters?.search) {
      where.OR = [
        { invoiceNumber: { contains: filters.search, mode: "insensitive" } },
        { customer: { name: { contains: filters.search, mode: "insensitive" } } },
        { subject: { contains: filters.search, mode: "insensitive" } },
      ]
    }

    // Auto-detect overdue invoices
    const now = new Date()
    await prisma.invoice.updateMany({
      where: {
        userId,
        status: { in: ["sent", "partially_paid"] },
        dueDate: { lt: now },
      },
      data: { status: "overdue" },
    })

    return prisma.invoice.findMany({
      where,
      include: { customer: true, payments: true },
      orderBy: { issuedAt: "desc" },
    })
  }
)

export const getInvoiceById = cache(
  async (id: string, userId: string): Promise<Invoice | null> => {
    return prisma.invoice.findFirst({
      where: { id, userId },
      include: { customer: true, payments: true, transaction: true },
    })
  }
)

export const getNextInvoiceNumber = cache(
  async (userId: string): Promise<string> => {
    const year = new Date().getFullYear()
    const prefix = `${year}-`

    const latest = await prisma.invoice.findFirst({
      where: {
        userId,
        invoiceNumber: { startsWith: prefix },
      },
      orderBy: { invoiceNumber: "desc" },
    })

    if (latest) {
      const currentNum = parseInt(latest.invoiceNumber.split("-")[1], 10)
      return `${year}-${String(currentNum + 1).padStart(3, "0")}`
    }

    // Check settings for starting number
    const setting = await prisma.setting.findFirst({
      where: { userId, code: "invoice_starting_number" },
    })
    const startNum = setting?.value ? parseInt(setting.value, 10) : 1
    return `${year}-${String(startNum).padStart(3, "0")}`
  }
)

export type CreateInvoiceData = {
  customerId: string
  invoiceNumber: string
  status?: string
  issuedAt: Date
  dueDate: Date
  currency: string
  subtotal: number
  taxTotal: number
  total: number
  items: unknown
  taxes?: unknown
  fees?: unknown
  paymentReference?: string | null
  poNumber?: string | null
  subject?: string | null
  notes?: string | null
  paymentTerms?: string | null
  isVatReversed?: boolean
  templateData?: unknown
  pdfPath?: string | null
}

export const createInvoice = async (
  userId: string,
  data: CreateInvoiceData
): Promise<Invoice> => {
  return prisma.invoice.create({
    data: {
      ...data,
      items: data.items as Prisma.InputJsonValue,
      taxes: data.taxes as Prisma.InputJsonValue,
      fees: data.fees as Prisma.InputJsonValue,
      templateData: data.templateData as Prisma.InputJsonValue,
      userId,
    },
    include: { customer: true },
  })
}

export const updateInvoice = async (
  id: string,
  userId: string,
  data: Partial<CreateInvoiceData>
): Promise<Invoice> => {
  const updateData: Prisma.InvoiceUpdateInput = { ...data }
  if (data.items) updateData.items = data.items as Prisma.InputJsonValue
  if (data.taxes) updateData.taxes = data.taxes as Prisma.InputJsonValue
  if (data.fees) updateData.fees = data.fees as Prisma.InputJsonValue
  if (data.templateData)
    updateData.templateData = data.templateData as Prisma.InputJsonValue

  return prisma.invoice.update({
    where: { id },
    data: updateData,
    include: { customer: true },
  })
}

export const updateInvoiceStatus = async (
  id: string,
  userId: string,
  status: string,
  extra?: { paidAt?: Date; transactionId?: string }
): Promise<Invoice> => {
  return prisma.invoice.update({
    where: { id },
    data: {
      status,
      paidAt: extra?.paidAt,
      transactionId: extra?.transactionId,
    },
  })
}

export const deleteInvoice = async (
  id: string,
  userId: string
): Promise<Invoice> => {
  return prisma.invoice.delete({
    where: { id },
  })
}

export const getInvoiceCountByCustomer = cache(
  async (customerId: string): Promise<number> => {
    return prisma.invoice.count({ where: { customerId } })
  }
)
```

- [ ] **Step 3: Create payment model**

Create `models/payments.ts`:

```typescript
import { prisma } from "@/lib/db"
import { Payment } from "@/prisma/client"
import { createTransaction } from "./transactions"

export const getPaymentsByInvoice = async (
  invoiceId: string
): Promise<Payment[]> => {
  return prisma.payment.findMany({
    where: { invoiceId },
    orderBy: { paidAt: "desc" },
  })
}

export const recordPayment = async (
  invoiceId: string,
  userId: string,
  data: { amount: number; paidAt: Date; note?: string }
): Promise<{ payment: Payment; invoiceFullyPaid: boolean }> => {
  const payment = await prisma.payment.create({
    data: {
      invoiceId,
      amount: data.amount,
      paidAt: data.paidAt,
      note: data.note,
    },
  })

  // Update invoice paid amount
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { customer: true, payments: true },
  })

  const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0)
  const invoiceFullyPaid = totalPaid >= invoice.total

  if (invoiceFullyPaid) {
    // Create income transaction
    const transaction = await createTransaction(userId, {
      name: `Invoice ${invoice.invoiceNumber} - ${invoice.customer.name}`,
      total: invoice.total,
      currencyCode: invoice.currency,
      type: "income",
      issuedAt: data.paidAt,
      categoryCode: "invoice",
      customerId: invoice.customerId,
    })

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "paid",
        paidAt: data.paidAt,
        paidAmount: totalPaid,
        transactionId: transaction.id,
      },
    })
  } else {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "partially_paid",
        paidAmount: totalPaid,
      },
    })
  }

  return { payment, invoiceFullyPaid }
}
```

- [ ] **Step 4: Add invoice settings to defaults**

In `models/defaults.ts`, add to the `DEFAULT_SETTINGS` array:

```typescript
  {
    code: "invoice_starting_number",
    name: "Invoice Starting Number",
    description: "Starting number for auto-increment invoice numbering (for the current year)",
    value: "1",
  },
  {
    code: "invoice_default_payment_terms",
    name: "Default Payment Terms",
    description: "Default payment terms text for new invoices",
    value: "30 dagen netto",
  },
```

- [ ] **Step 5: Add customerId to TransactionData type**

In `models/transactions.ts`, add `customerId` to the `TransactionData` type:

```typescript
  customerId?: string | null
```

And in the `createTransaction` function's `data` spread, ensure `customerId` is included.

- [ ] **Step 6: Commit**

```bash
git add models/invoices.ts models/payments.ts forms/invoices.ts models/defaults.ts models/transactions.ts
git commit -m "feat: add invoice and payment model layers"
```

---

### Task 4: Sidebar Navigation Update

**Files:**
- Modify: `components/sidebar/sidebar.tsx`
- Modify: `components/sidebar/mobile-menu.tsx`

- [ ] **Step 1: Update sidebar nav items**

In `components/sidebar/sidebar.tsx`, add imports:

```typescript
import { Receipt, CreditCard, Users } from "lucide-react"
```

Replace the nav menu items section (lines 71-126) with:

```tsx
<SidebarMenuItemWithHighlight href="/dashboard">
  <SidebarMenuButton asChild>
    <Link href="/dashboard">
      <House />
      <span>Home</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItemWithHighlight>

<SidebarMenuItemWithHighlight href="/invoices">
  <SidebarMenuButton asChild>
    <Link href="/invoices">
      <Receipt />
      <span>Invoices</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItemWithHighlight>

<SidebarMenuItemWithHighlight href="/expenses">
  <SidebarMenuButton asChild>
    <Link href="/expenses">
      <CreditCard />
      <span>Expenses</span>
      {notification && notification.code === "sidebar.transactions" && notification.message && (
        <Blinker />
      )}
    </Link>
  </SidebarMenuButton>
</SidebarMenuItemWithHighlight>

<SidebarMenuItemWithHighlight href="/unsorted">
  <SidebarMenuButton asChild>
    <Link href="/unsorted">
      <ClockArrowUp />
      <span>Unsorted</span>
      {unsortedFilesCount > 0 && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
          {unsortedFilesCount}
        </span>
      )}
      {notification && notification.code === "sidebar.unsorted" && notification.message && <Blinker />}
      <span></span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItemWithHighlight>

<SidebarMenuItemWithHighlight href="/customers">
  <SidebarMenuButton asChild>
    <Link href="/customers">
      <Users />
      <span>Customers</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItemWithHighlight>

<SidebarMenuItemWithHighlight href="/apps">
  <SidebarMenuButton asChild>
    <Link href="/apps">
      <LayoutDashboard />
      <span>Apps</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItemWithHighlight>

<SidebarMenuItemWithHighlight href="/settings">
  <SidebarMenuButton asChild>
    <Link href="/settings">
      <Settings />
      <span>Settings</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItemWithHighlight>
```

- [ ] **Step 2: Update mobile menu**

Read `components/sidebar/mobile-menu.tsx` and mirror the same navigation changes (add Invoices, Expenses, Customers links; remove standalone Transactions link).

- [ ] **Step 3: Verify sidebar renders**

Run dev server, navigate to http://localhost:7331. Verify sidebar shows: Home, Invoices, Expenses, Unsorted, Customers, Apps, Settings.

- [ ] **Step 4: Commit**

```bash
git add components/sidebar/
git commit -m "feat: update sidebar navigation with invoices, expenses, customers"
```

---

### Task 5: Customer Pages - List, CRUD, Edit Panel

**Files:**
- Create: `app/(app)/customers/page.tsx`
- Create: `app/(app)/customers/actions.ts`
- Create: `app/(app)/customers/[id]/page.tsx`
- Create: `components/customers/customer-list.tsx`
- Create: `components/customers/customer-summary-cards.tsx`
- Create: `components/customers/customer-edit-panel.tsx`

- [ ] **Step 1: Create customer server actions**

Create `app/(app)/customers/actions.ts`:

```typescript
"use server"

import { getCurrentUser } from "@/lib/auth"
import { createCustomer, updateCustomer, deleteCustomer, CustomerData } from "@/models/customers"
import { revalidatePath } from "next/cache"

export async function createCustomerAction(data: CustomerData) {
  const user = await getCurrentUser()
  const customer = await createCustomer(user.id, data)
  revalidatePath("/customers")
  return { success: true, data: customer }
}

export async function updateCustomerAction(id: string, data: CustomerData) {
  const user = await getCurrentUser()
  const customer = await updateCustomer(id, user.id, data)
  revalidatePath("/customers")
  revalidatePath(`/customers/${id}`)
  return { success: true, data: customer }
}

export async function deleteCustomerAction(id: string) {
  const user = await getCurrentUser()
  await deleteCustomer(id, user.id)
  revalidatePath("/customers")
  return { success: true }
}
```

- [ ] **Step 2: Create customer summary cards component**

Create `components/customers/customer-summary-cards.tsx`:

A row of 4 cards showing: Most Active Client (name + invoice count last 30d), Inactive Clients (count), Top Revenue Client (name + amount), New Customers (count last 30d). Uses the `getCustomerStats` function from `models/customers.ts`. Style with `border rounded-lg p-4` cards in a `grid grid-cols-4 gap-4` layout.

- [ ] **Step 3: Create customer edit panel component**

Create `components/customers/customer-edit-panel.tsx`:

A `"use client"` component using `Sheet` from `@/components/ui/sheet`. Two collapsible sections (General, Details). 2-column grid layout using `grid grid-cols-2 gap-4` where appropriate. Calls `createCustomerAction` or `updateCustomerAction` on submit. Fields match the `CustomerFormData` schema.

- [ ] **Step 4: Create customer list component**

Create `components/customers/customer-list.tsx`:

A `"use client"` component rendering a searchable table. Columns: Name, Contact Person, Email, Invoices (count from props), Actions (...). Search input filters client-side. Each row has an actions dropdown (Edit, Delete). Clicking Edit opens the `CustomerEditPanel` sheet. Uses existing `DropdownMenu` from `@/components/ui/dropdown-menu`.

- [ ] **Step 5: Create customer list page**

Create `app/(app)/customers/page.tsx`:

```typescript
import { CustomerList } from "@/components/customers/customer-list"
import { CustomerSummaryCards } from "@/components/customers/customer-summary-cards"
import { getCurrentUser } from "@/lib/auth"
import { getCustomers, getCustomerStats } from "@/models/customers"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Customers",
  description: "Manage your customers",
}

export default async function CustomersPage() {
  const user = await getCurrentUser()
  const customers = await getCustomers(user.id)
  const stats = await getCustomerStats(user.id)

  return (
    <>
      <header className="flex items-center justify-between gap-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Customers</h2>
      </header>
      <CustomerSummaryCards stats={stats} />
      <CustomerList customers={customers} />
    </>
  )
}
```

- [ ] **Step 6: Create customer detail page**

Create `app/(app)/customers/[id]/page.tsx`:

Server component that fetches customer by ID, lists their invoices and linked expenses (transactions with customerId). Two tabs using simple conditional rendering or a client tab component.

- [ ] **Step 7: Verify customers page**

Navigate to http://localhost:7331/customers. Create a customer, edit it, delete it. Verify summary cards render (with zero data initially).

- [ ] **Step 8: Commit**

```bash
git add app/(app)/customers/ components/customers/
git commit -m "feat: add customer management pages with CRUD and edit panel"
```

---

### Task 6: Expenses Page (Filtered Transactions)

**Files:**
- Create: `app/(app)/expenses/page.tsx`
- Create: `app/(app)/expenses/layout.tsx`
- Create: `app/(app)/expenses/loading.tsx`

- [ ] **Step 1: Create expenses layout**

Create `app/(app)/expenses/layout.tsx`:

```typescript
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Expenses",
  description: "Manage your expenses",
}

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

- [ ] **Step 2: Create expenses loading state**

Create `app/(app)/expenses/loading.tsx` - copy from `app/(app)/transactions/loading.tsx`.

- [ ] **Step 3: Create expenses page**

Create `app/(app)/expenses/page.tsx`:

This is essentially a copy of `app/(app)/transactions/page.tsx` with these changes:
- Title: "Expenses" instead of "Transactions"
- Add `type: "expense"` to the filters passed to `getTransactions`
- Replace `NewTransactionDialog` button with just `+ Add Expense` that opens the same dialog but with type pre-set to "expense"
- Keep all existing filter, search, pagination, upload, and bulk action functionality
- Header shows "Expenses" with count

- [ ] **Step 4: Verify expenses page**

Navigate to http://localhost:7331/expenses. Verify only expense-type transactions show. Upload flow still works.

- [ ] **Step 5: Commit**

```bash
git add app/(app)/expenses/
git commit -m "feat: add dedicated expenses page with filtered transaction view"
```

---

### Task 7: Invoice Status Badge Component

**Files:**
- Create: `components/invoices/invoice-status-badge.tsx`

- [ ] **Step 1: Create status badge**

Create `components/invoices/invoice-status-badge.tsx`:

```tsx
"use client"

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-700",
  },
  sent: {
    label: "Sent",
    className: "bg-blue-100 text-blue-700",
  },
  paid: {
    label: "Paid",
    className: "bg-green-100 text-green-700",
  },
  partially_paid: {
    label: "Partial",
    className: "bg-yellow-100 text-yellow-700",
  },
  overdue: {
    label: "Overdue",
    className: "bg-red-100 text-red-700",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-gray-100 text-gray-400 line-through",
  },
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/invoices/invoice-status-badge.tsx
git commit -m "feat: add invoice status badge component"
```

---

### Task 8: Customer Picker Component

**Files:**
- Create: `components/customers/customer-picker.tsx`

- [ ] **Step 1: Create customer picker**

Create `components/customers/customer-picker.tsx`:

A `"use client"` component with two tabs: "Existing Customer" and "New Customer".

**Existing tab:** A searchable dropdown (using `Popover` + `Command` pattern or a filterable select) listing all customers. When selected, calls `onSelect(customer)` callback with the full customer object.

**New tab:** A compact inline form with fields: Name (required), Country (default Belgium), Street, House Number, Bus, ZIP, City, VAT Number, Email. On submit, calls `createCustomerAction` then `onSelect(newCustomer)`.

Props: `customers: Customer[]`, `selectedCustomer: Customer | null`, `onSelect: (customer: Customer) => void`

Uses `Tabs` from Radix for the tab switching. Follows Cashfeed reference style.

- [ ] **Step 2: Commit**

```bash
git add components/customers/customer-picker.tsx
git commit -m "feat: add customer picker component with existing/new tabs"
```

---

### Task 9: Invoice Server Actions

**Files:**
- Create: `app/(app)/invoices/actions.ts`

- [ ] **Step 1: Create invoice server actions**

Create `app/(app)/invoices/actions.ts`:

```typescript
"use server"

import { getCurrentUser } from "@/lib/auth"
import {
  createInvoice,
  updateInvoice,
  updateInvoiceStatus,
  deleteInvoice,
  CreateInvoiceData,
} from "@/models/invoices"
import { recordPayment } from "@/models/payments"
import { createTransaction } from "@/models/transactions"
import { generateInvoicePDF } from "@/app/(app)/apps/invoices/actions"
import { revalidatePath } from "next/cache"

export async function createInvoiceAction(data: CreateInvoiceData) {
  const user = await getCurrentUser()
  const invoice = await createInvoice(user.id, data)
  revalidatePath("/invoices")
  return { success: true, data: invoice }
}

export async function updateInvoiceAction(
  id: string,
  data: Partial<CreateInvoiceData>
) {
  const user = await getCurrentUser()
  const invoice = await updateInvoice(id, user.id, data)
  revalidatePath("/invoices")
  revalidatePath(`/invoices/${id}`)
  return { success: true, data: invoice }
}

export async function markInvoiceSentAction(id: string) {
  const user = await getCurrentUser()
  await updateInvoiceStatus(id, user.id, "sent")
  revalidatePath("/invoices")
  revalidatePath(`/invoices/${id}`)
  return { success: true }
}

export async function markInvoicePaidAction(
  id: string,
  paidAt: Date
) {
  const user = await getCurrentUser()
  // Get invoice to create transaction
  const { getInvoiceById } = await import("@/models/invoices")
  const invoice = await getInvoiceById(id, user.id)
  if (!invoice) return { success: false, error: "Invoice not found" }

  // Create income transaction
  const customer = (invoice as any).customer
  const transaction = await createTransaction(user.id, {
    name: `Invoice ${invoice.invoiceNumber} - ${customer?.name || "Unknown"}`,
    total: invoice.total,
    currencyCode: invoice.currency,
    type: "income",
    issuedAt: paidAt,
    categoryCode: "invoice",
    customerId: invoice.customerId,
  })

  await updateInvoiceStatus(id, user.id, "paid", {
    paidAt,
    transactionId: transaction.id,
  })

  // Update paidAmount
  await import("@/lib/db").then(({ prisma }) =>
    prisma.invoice.update({
      where: { id },
      data: { paidAmount: invoice.total },
    })
  )

  revalidatePath("/invoices")
  revalidatePath(`/invoices/${id}`)
  revalidatePath("/dashboard")
  return { success: true }
}

export async function recordPaymentAction(
  invoiceId: string,
  data: { amount: number; paidAt: Date; note?: string }
) {
  const user = await getCurrentUser()
  const result = await recordPayment(invoiceId, user.id, data)
  revalidatePath("/invoices")
  revalidatePath(`/invoices/${invoiceId}`)
  if (result.invoiceFullyPaid) {
    revalidatePath("/dashboard")
  }
  return { success: true, data: result }
}

export async function cancelInvoiceAction(id: string) {
  const user = await getCurrentUser()
  await updateInvoiceStatus(id, user.id, "cancelled")
  revalidatePath("/invoices")
  revalidatePath(`/invoices/${id}`)
  return { success: true }
}

export async function deleteInvoiceAction(id: string) {
  const user = await getCurrentUser()
  await deleteInvoice(id, user.id)
  revalidatePath("/invoices")
  return { success: true }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(app)/invoices/actions.ts
git commit -m "feat: add invoice server actions for lifecycle management"
```

---

### Task 10: Invoice List Page

**Files:**
- Create: `app/(app)/invoices/page.tsx`
- Create: `components/invoices/invoice-list.tsx`

- [ ] **Step 1: Create invoice list component**

Create `components/invoices/invoice-list.tsx`:

A `"use client"` component that:
- Groups invoices by month (using `date-fns` `format(date, "MMMM yyyy")`)
- Renders each month group with a header and table
- Table columns: Invoice #, Customer name, Date, Due Date, Total (formatted with currency), Status (using `InvoiceStatusBadge`), Actions (dropdown: View, Edit if draft, Delete if draft)
- Links invoice number to `/invoices/[id]`
- Filter bar at top: Status dropdown, Customer dropdown, Date range picker (reuse `DateRangePicker` from `components/forms/date-range-picker.tsx`)

Props: `invoices: Invoice[]`, `customers: Customer[]`

- [ ] **Step 2: Create invoice list page**

Create `app/(app)/invoices/page.tsx`:

```typescript
import { InvoiceList } from "@/components/invoices/invoice-list"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth"
import { getCustomers } from "@/models/customers"
import { getInvoices, InvoiceFilters } from "@/models/invoices"
import { Plus } from "lucide-react"
import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Invoices",
  description: "Manage your invoices",
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<InvoiceFilters>
}) {
  const filters = await searchParams
  const user = await getCurrentUser()
  const invoices = await getInvoices(user.id, filters)
  const customers = await getCustomers(user.id)

  return (
    <>
      <header className="flex items-center justify-between gap-2 mb-8">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">Invoices</span>
          <span className="text-3xl tracking-tight opacity-20">
            {invoices.length}
          </span>
        </h2>
        <Link href="/invoices/new">
          <Button>
            <Plus /> New Invoice
          </Button>
        </Link>
      </header>

      <InvoiceList invoices={invoices} customers={customers} />
    </>
  )
}
```

- [ ] **Step 3: Verify invoice list page**

Navigate to http://localhost:7331/invoices. Should show empty state initially. Verify filters render.

- [ ] **Step 4: Commit**

```bash
git add app/(app)/invoices/page.tsx components/invoices/invoice-list.tsx
git commit -m "feat: add invoice list page with monthly grouping and filters"
```

---

### Task 11: Invoice Creation Page

**Files:**
- Create: `app/(app)/invoices/new/page.tsx`
- Create: `components/invoices/invoice-form.tsx`

- [ ] **Step 1: Create invoice form component**

Create `components/invoices/invoice-form.tsx`:

A `"use client"` component that adapts the existing invoice generator pattern (`useReducer` from `invoice-generator.tsx`). Key differences from the old form:

- **Customer picker** at top instead of free-text "Bill To" - uses `CustomerPicker` component
- **Auto-filled invoice number** from `getNextInvoiceNumber`
- **Payment reference** field (gestructureerde mededeling)
- **PO number** and **Subject** fields
- **BTW verlegd / vrijgesteld** checkbox
- **2-column layout** for date fields: Invoice Date | Due Date, Invoice Number | Currency
- **Line items** with tax rate per item (default 21%)
- **Actions**: "Save as Draft" button, "Save & Send" button, "Download PDF" button
- **Live PDF preview** on right side (reuse `InvoicePDF` component)

The form state maps to `CreateInvoiceData`. On save, calls `createInvoiceAction`.

Amounts stored as integers (cents) - multiply by 100 before saving, divide by 100 for display.

- [ ] **Step 2: Create invoice new page**

Create `app/(app)/invoices/new/page.tsx`:

```typescript
import { InvoiceForm } from "@/components/invoices/invoice-form"
import { getCurrentUser } from "@/lib/auth"
import { getCustomers } from "@/models/customers"
import { getCurrencies } from "@/models/currencies"
import { getNextInvoiceNumber } from "@/models/invoices"
import { getSettings } from "@/models/settings"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "New Invoice",
  description: "Create a new invoice",
}

export default async function NewInvoicePage() {
  const user = await getCurrentUser()
  const customers = await getCustomers(user.id)
  const currencies = await getCurrencies(user.id)
  const nextNumber = await getNextInvoiceNumber(user.id)
  const settings = await getSettings(user.id)

  return (
    <InvoiceForm
      customers={customers}
      currencies={currencies}
      nextInvoiceNumber={nextNumber}
      settings={settings}
      user={user}
    />
  )
}
```

- [ ] **Step 3: Verify invoice creation**

Navigate to http://localhost:7331/invoices/new. Create a test invoice with a customer. Verify it appears in the invoice list. Verify PDF preview renders.

- [ ] **Step 4: Commit**

```bash
git add app/(app)/invoices/new/ components/invoices/invoice-form.tsx
git commit -m "feat: add invoice creation page with customer picker and PDF preview"
```

---

### Task 12: Invoice Detail Page with Actions

**Files:**
- Create: `app/(app)/invoices/[id]/page.tsx`
- Create: `components/invoices/invoice-actions.tsx`
- Create: `components/invoices/payment-dialog.tsx`

- [ ] **Step 1: Create payment dialog**

Create `components/invoices/payment-dialog.tsx`:

A `"use client"` dialog component with fields: Amount (number input, pre-filled with remaining balance), Date (date picker, default today), Note (optional textarea). On submit, calls `recordPaymentAction`. Shows toast on success.

- [ ] **Step 2: Create invoice actions component**

Create `components/invoices/invoice-actions.tsx`:

A `"use client"` component that renders action buttons based on invoice status:

| Status | Buttons |
|--------|---------|
| draft | Edit (link to /invoices/[id]/edit), Mark as Sent, Delete |
| sent | Record Payment, Mark as Paid, Cancel |
| partially_paid | Record Payment, Mark as Paid, Cancel |
| overdue | Record Payment, Mark as Paid, Cancel |
| paid | Download PDF |
| cancelled | Duplicate as New (link to /invoices/new?from=[id]) |

"Record Payment" opens `PaymentDialog`. "Mark as Paid" calls `markInvoicePaidAction`. "Mark as Sent" calls `markInvoiceSentAction`. "Cancel" calls `cancelInvoiceAction` with confirmation dialog. "Delete" calls `deleteInvoiceAction` with confirmation.

- [ ] **Step 3: Create invoice detail page**

Create `app/(app)/invoices/[id]/page.tsx`:

```typescript
import { InvoiceActions } from "@/components/invoices/invoice-actions"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"
import { getCurrentUser } from "@/lib/auth"
import { getInvoiceById } from "@/models/invoices"
import { Metadata } from "next"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Invoice Details",
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  const invoice = await getInvoiceById(id, user.id)

  if (!invoice) notFound()

  const customer = (invoice as any).customer
  const payments = (invoice as any).payments || []

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Left: PDF Preview */}
      <div className="flex-1">
        {invoice.pdfPath ? (
          <iframe
            src={`/files/static/${invoice.pdfPath}`}
            className="w-full h-[800px] border rounded-lg"
          />
        ) : (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            PDF preview not available
          </div>
        )}
      </div>

      {/* Right: Details & Actions */}
      <div className="w-full lg:w-96 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            Invoice {invoice.invoiceNumber}
          </h2>
          <InvoiceStatusBadge status={invoice.status} />
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Customer</span>
            <span>{customer?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <span>{new Date(invoice.issuedAt).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Due Date</span>
            <span>{new Date(invoice.dueDate).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold">
              {invoice.currency} {(invoice.total / 100).toFixed(2)}
            </span>
          </div>
          {invoice.paidAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span>
                {invoice.currency} {(invoice.paidAmount / 100).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <InvoiceActions invoice={invoice} />

        {payments.length > 0 && (
          <div>
            <h3 className="font-medium mb-2">Payment History</h3>
            <div className="space-y-2">
              {payments.map((p: any) => (
                <div
                  key={p.id}
                  className="flex justify-between text-sm border-b pb-2"
                >
                  <span>{new Date(p.paidAt).toLocaleDateString()}</span>
                  <span>
                    {invoice.currency} {(p.amount / 100).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify invoice detail**

Create a test invoice, navigate to its detail page. Test status transitions: mark as sent, record payment, mark as paid. Verify transaction is created when paid.

- [ ] **Step 5: Commit**

```bash
git add app/(app)/invoices/[id]/ components/invoices/invoice-actions.tsx components/invoices/payment-dialog.tsx
git commit -m "feat: add invoice detail page with status actions and payment tracking"
```

---

### Task 13: Update Invoice PDF to Use Customer Data

**Files:**
- Modify: `app/(app)/apps/invoices/components/invoice-pdf.tsx`

- [ ] **Step 1: Read current invoice-pdf.tsx**

Read the full file to understand the current "Bill To" rendering.

- [ ] **Step 2: Update InvoicePDF to accept customer data**

The `InvoiceFormData` type currently has `billTo: string` (free text). For the new invoice form, we need to also support rendering customer data. Two approaches:

Option: Keep `billTo` as a computed string. In `invoice-form.tsx`, when a customer is selected, format their data into the `billTo` string:

```typescript
const billTo = [
  customer.name,
  customer.street && customer.houseNumber
    ? `${customer.street} ${customer.houseNumber}${customer.bus ? ` ${customer.bus}` : ""}`
    : "",
  customer.zipCode && customer.city
    ? `${customer.zipCode} ${customer.city}`
    : "",
  customer.country || "",
  customer.vatNumber ? `BTW: ${customer.vatNumber}` : "",
].filter(Boolean).join("\n")
```

This way the existing PDF renderer continues to work unchanged. The old Apps > Invoice Generator also continues to work.

- [ ] **Step 3: Commit**

```bash
git add app/(app)/apps/invoices/components/invoice-pdf.tsx
git commit -m "feat: support customer data in invoice PDF bill-to field"
```

---

### Task 14: Invoice Settings Page

**Files:**
- Modify: `app/(app)/settings/page.tsx` or create new settings sub-page

- [ ] **Step 1: Add invoice settings to settings page**

Add invoice numbering settings to the existing settings flow. In `models/defaults.ts`, the settings are already added (Task 3 Step 4). The existing `GlobalSettingsForm` should pick them up automatically if they follow the same pattern. Verify the settings page shows the new invoice settings.

If not auto-displayed, add a section in the settings layout for invoice defaults, or add to the existing General settings form.

- [ ] **Step 2: Verify settings**

Navigate to /settings. Verify "Invoice Starting Number" and "Default Payment Terms" settings appear and can be modified.

- [ ] **Step 3: Commit**

```bash
git add app/(app)/settings/ models/defaults.ts
git commit -m "feat: add invoice numbering and payment terms settings"
```

---

### Task 15: End-to-End Verification

- [ ] **Step 1: Full lifecycle test**

1. Go to /customers, create a new customer (e.g., "Test Client BV", email, VAT number, address)
2. Go to /invoices/new, select the customer, fill in line items, save as draft
3. Verify invoice appears in /invoices list with "Draft" badge
4. Open invoice detail, mark as sent
5. Verify status changes to "Sent"
6. Record a partial payment (e.g., 30% of total)
7. Verify status changes to "Partially Paid"
8. Record remaining payment
9. Verify status auto-transitions to "Paid"
10. Verify income transaction created in /expenses (should NOT appear) and dashboard (SHOULD appear)
11. Go to /customers/[id], verify invoice history shows

- [ ] **Step 2: Verify navigation**

1. Sidebar shows correct items
2. /invoices page loads and filters work
3. /expenses page shows only expenses
4. /customers page shows customer list with summary cards
5. Dashboard still shows correct stats

- [ ] **Step 3: Verify existing features unchanged**

1. Upload a receipt via /unsorted - AI analysis still works
2. Export transactions - still works
3. Apps > Invoice Generator - still works (legacy, but not broken)
4. Settings pages all still work

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete invoicing platform - customers, invoices, expenses, payments"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Database schema | `prisma/schema.prisma` |
| 2 | Customer model layer | `models/customers.ts`, `forms/customers.ts` |
| 3 | Invoice & payment models | `models/invoices.ts`, `models/payments.ts`, `forms/invoices.ts` |
| 4 | Sidebar navigation | `components/sidebar/sidebar.tsx` |
| 5 | Customer pages & CRUD | `app/(app)/customers/`, `components/customers/` |
| 6 | Expenses page | `app/(app)/expenses/` |
| 7 | Invoice status badge | `components/invoices/invoice-status-badge.tsx` |
| 8 | Customer picker | `components/customers/customer-picker.tsx` |
| 9 | Invoice server actions | `app/(app)/invoices/actions.ts` |
| 10 | Invoice list page | `app/(app)/invoices/page.tsx` |
| 11 | Invoice creation page | `app/(app)/invoices/new/page.tsx`, `components/invoices/invoice-form.tsx` |
| 12 | Invoice detail & actions | `app/(app)/invoices/[id]/page.tsx`, `components/invoices/` |
| 13 | PDF customer data | `app/(app)/apps/invoices/components/invoice-pdf.tsx` |
| 14 | Invoice settings | `models/defaults.ts`, `app/(app)/settings/` |
| 15 | E2E verification | All files |
