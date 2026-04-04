# TaxHacker Invoicing Platform - Design Spec

## Context

Vitalie (Awwwocado) uses TaxHacker as a self-hosted expense tracker. The expense/cost side works well (upload, AI parsing, categories, multi-currency). However, the invoicing side is severely lacking - invoices are one-off PDF generators with no persistence, no customer database, no lifecycle tracking, and no payment management.

This spec adds a full invoicing and customer management layer to TaxHacker, turning it from an expense tracker into a complete freelance accounting tool. The goal is to consolidate Cashfeed/Midday and other fragmented tools into one self-hosted platform with full data ownership.

**This is a personal tool for Awwwocado only** - no multi-tenant, no onboarding, no SaaS features needed.

---

## Phase 1 Scope (this spec)

1. Customer database with CRUD and Midday-style UI
2. Invoice model with full lifecycle (draft/sent/paid/partial/overdue/cancelled)
3. Invoice creation, list, and detail pages
4. Separate /expenses page
5. Updated sidebar navigation
6. Payment tracking with partial payment support
7. Invoice numbering settings

### Out of scope (Phase 2+)

- Peppol integration (Recommand API + UBL XML)
- KBO/CBE company lookup
- Draft reminder emails for overdue invoices
- Full reports page (revenue, cashflow, aging, BTW)
- Design overhaul (Cashfeed-style, light theme)
- Auteursrechten split
- Bulk UBL XML export, BTW rapport CSV

---

## Database Schema

### New: Customer

```prisma
model Customer {
  id              String   @id @default(uuid())
  userId          String   @map("user_id")
  user            User     @relation(fields: [userId], references: [id])

  name            String
  email           String?
  billingEmails   Json?    // String[] - BCC emails for invoice sending
  phone           String?
  website         String?
  contactPerson   String?

  street          String?
  houseNumber     String?
  bus             String?
  zipCode         String?
  city            String?
  country         String?  @default("Belgium")

  vatNumber       String?
  peppolId        String?  // For phase 2
  defaultRate     Decimal? // Default hourly rate for this client
  defaultCurrency String?  @default("EUR")
  note            String?

  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  invoices        Invoice[]
  transactions    Transaction[]

  @@unique([userId, id])
  @@map("customers")
}
```

### New: Invoice

```prisma
model Invoice {
  id               String   @id @default(uuid())
  userId           String   @map("user_id")
  user             User     @relation(fields: [userId], references: [id])

  customerId       String   @map("customer_id")
  customer         Customer @relation(fields: [customerId], references: [id])

  invoiceNumber    String   @map("invoice_number")
  status           String   @default("draft") // draft, sent, paid, partially_paid, overdue, cancelled

  issuedAt         DateTime @map("issued_at")
  dueDate          DateTime @map("due_date")
  paidAt           DateTime? @map("paid_at")

  currency         String   @default("EUR")
  subtotal         Decimal  @default(0)
  taxTotal         Decimal  @default(0) @map("tax_total")
  total            Decimal  @default(0)
  paidAmount       Decimal  @default(0) @map("paid_amount")

  items            Json     // Array of { name, subtitle?, quantity, unitPrice, taxRate, subtotal }
  taxes            Json?    // Array of { name, rate, amount }
  fees             Json?    // Array of { name, amount }

  paymentReference String?  @map("payment_reference") // Gestructureerde mededeling
  poNumber         String?  @map("po_number")
  subject          String?
  notes            String?
  paymentTerms     String?  @map("payment_terms")
  isVatReversed    Boolean  @default(false) @map("is_vat_reversed")

  templateData     Json?    @map("template_data") // Labels, formatting from template system
  pdfPath          String?  @map("pdf_path")

  transactionId    String?  @unique @map("transaction_id")
  transaction      Transaction? @relation(fields: [transactionId], references: [id])

  payments         Payment[]

  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  @@unique([userId, invoiceNumber])
  @@map("invoices")
}
```

### New: Payment

```prisma
model Payment {
  id         String   @id @default(uuid())
  invoiceId  String   @map("invoice_id")
  invoice    Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  amount     Decimal
  paidAt     DateTime @map("paid_at")
  note       String?

  createdAt  DateTime @default(now()) @map("created_at")

  @@map("payments")
}
```

### Modified: Transaction

Add optional customer link:

```prisma
// Add to existing Transaction model:
customerId    String?   @map("customer_id")
customer      Customer? @relation(fields: [customerId], references: [id])
invoiceId     // Already linked via Invoice.transactionId inverse
```

### Modified: User

Add relations:

```prisma
// Add to existing User model:
customers     Customer[]
invoices      Invoice[]
```

---

## Navigation

### Current sidebar
Home, Transactions, Unsorted, Apps, Settings

### New sidebar
Home, **Invoices**, **Expenses**, Unsorted, **Customers**, Apps, Settings

- **Transactions** removed from main nav (still accessible from dashboard as "all transactions" view)
- **Invoices** = outgoing invoices with full lifecycle
- **Expenses** = current transactions page filtered to type=expense
- **Customers** = new customer management page

---

## Pages

### /customers - Customer List

**Layout:** Midday-style with summary cards + searchable table

**Summary cards (top):**
- Most Active Client (most invoices in last 30 days)
- Inactive Clients (no invoices or time tracked in 30 days)
- Top Revenue Client (highest invoice total in 30 days)
- New Customers (added in last 30 days)

**Table columns:** Name, Contact Person, Email, Invoices (count), Projects, Actions (...)

**Search:** Filter by name, email, contact person

**Actions menu:** Edit, View Invoices, Delete

**Add customer:** "+" button opens slide-out panel

### Customer Edit Panel (slide-out)

2-column compact layout where possible. Collapsible sections.

**General section:**
- Name | Email (2-col)
- Billing Emails (tag input for BCC)
- Phone | Website (2-col)
- Contact Person | Default Rate (2-col)

**Details section (collapsible):**
- Street | House Number + Bus (2-col)
- ZIP Code | City (2-col)
- Country (dropdown, default Belgium)
- VAT Number | Default Currency (2-col)
- Note (textarea)

### /customers/[id] - Customer Detail

Customer info card + tabs:
- **Invoices tab:** List of invoices for this customer with status badges
- **Expenses tab:** Transactions linked to this customer (type=expense)

---

### /invoices - Invoice List

**Layout:** List grouped by month (e.g., "April 2026", "March 2026")

**Status badges with colors:**
- Draft (gray)
- Sent (blue)
- Paid (green)
- Partially Paid (yellow)
- Overdue (red)
- Cancelled (gray, strikethrough)

**Columns:** Invoice #, Customer, Date, Due Date, Total, Status, Actions

**Filters:** Status dropdown, Customer dropdown, Date range picker

**Header actions:** "+ New Invoice" button

### /invoices/new - Create Invoice

Replaces current Apps > Invoice Generator. Same left-right split layout (form left, PDF preview right).

**Customer section (top):**
Tabs: "Existing Customer" / "New Customer"
- Existing: searchable dropdown of saved customers. Selecting auto-fills address/VAT on the invoice.
- New: minimal inline form (name, country, street, house number, bus, zip, city, VAT, email). Creates customer record on save.

**Document info (2-column where possible):**
- Invoice Number (auto-filled, editable) | Currency (dropdown, default EUR)
- Invoice Date (default today) | Due Date (default +30 days)
- Payment Reference (gestructureerde mededeling) | PO Number
- Subject

**Line items:**
- Dynamic rows: Description, Quantity, Unit Price, Tax % (default 21%), Subtotal
- "Add item" button
- Live totals: Subtotal, Tax breakdown, Total

**Options:**
- BTW verlegd / vrijgesteld checkbox
- Notes / payment terms textarea

**Actions:**
- Save as Draft
- Download PDF
- Save & Mark as Sent

**Live PDF preview** on the right side (existing react-pdf renderer, adapted to use customer data instead of free-text "Bill To").

### /invoices/[id] - Invoice Detail

**Left side:** PDF preview (rendered or stored PDF)

**Right side:** Invoice metadata + actions

**Status bar** at top showing current status with color

**Actions (context-dependent):**
| Status | Actions |
|--------|---------|
| Draft | Edit, Send, Delete |
| Sent | Record Payment, Mark Paid, Cancel, Download PDF |
| Partially Paid | Record Payment, Mark Paid, Cancel |
| Overdue | Record Payment, Mark Paid, Cancel |
| Paid | Download PDF |
| Cancelled | Duplicate as New |

**Payment history:** List of recorded payments with date, amount, note

**Record Payment dialog:** Amount, Date, Note fields

---

### /expenses - Expense List

Essentially the current /transactions page with `type=expense` filter pre-applied.

**Reuses:** TransactionList, TransactionSearchAndFilters, Pagination components
**Adds:** Customer filter dropdown (link expenses to customers)
**Removes:** Income transactions from this view

---

## Invoice Lifecycle

### Status transitions

```
Draft -----> Sent ---------> Paid
  |            |                ^
  |            v                |
  |        Partially Paid -----+
  |            |
  |            v
  |          Overdue --------> Paid
  |            |
  v            v
Cancelled  Cancelled
```

### Auto-overdue detection

Computed on page load / list render. When status is "sent" or "partially_paid" and `dueDate < now()`, display as "overdue". No cron job needed.

Implementation: query helper that checks dueDate and overrides displayed status. Persist the status change to the DB when detected (update on read) so that filters on status=overdue work correctly.

### When invoice is marked as Paid

1. Set `paidAt` to payment date
2. Set `paidAmount` to total
3. Create a Transaction record:
   - type: "income"
   - total: invoice total
   - currency: invoice currency
   - name: "Invoice {invoiceNumber} - {customer.name}"
   - customerId: invoice.customerId
   - issuedAt: paidAt
   - categoryCode: "invoice"
4. Link transaction to invoice via `Invoice.transactionId`
5. Income now appears in dashboard stats and reports

### Partial payments

1. Record Payment: creates Payment record, adds to `paidAmount`
2. If `paidAmount >= total`: auto-transition to "paid" (triggers transaction creation)
3. If `paidAmount < total`: status = "partially_paid"

---

## Invoice Numbering

**Format:** `YYYY-NNN` (e.g., 2026-001, 2026-014)

**Auto-increment:** On new invoice creation, query max invoice number for current year, increment by 1.

**Settings:** Add "invoice_starting_number" setting in /settings to configure where numbering starts (for users migrating from another system mid-year).

**Override:** Invoice number is editable on the form for manual cases.

---

## Key Files to Modify

### New files
- `prisma/migrations/XXXXXX_add_customers_invoices/migration.sql`
- `models/customers.ts` - Customer CRUD
- `models/invoices.ts` - Invoice CRUD + lifecycle helpers
- `models/payments.ts` - Payment CRUD
- `app/(app)/customers/page.tsx` - Customer list
- `app/(app)/customers/[id]/page.tsx` - Customer detail
- `app/(app)/customers/actions.ts` - Server actions
- `app/(app)/invoices/page.tsx` - Invoice list
- `app/(app)/invoices/new/page.tsx` - Create invoice
- `app/(app)/invoices/[id]/page.tsx` - Invoice detail
- `app/(app)/invoices/actions.ts` - Server actions
- `app/(app)/expenses/page.tsx` - Expense list (filtered transactions)
- `components/customers/` - Customer list, edit panel, picker
- `components/invoices/` - Invoice list, form, status badges, payment dialog

### Modified files
- `prisma/schema.prisma` - Add Customer, Invoice, Payment models + Transaction.customerId
- `app/(app)/layout.tsx` - Update sidebar navigation
- `components/sidebar/` - Add new nav items
- `app/(app)/apps/invoices/` - Rewire invoice generator to use Customer picker and new Invoice model
- `models/defaults.ts` - Add invoice_starting_number to DEFAULT_SETTINGS
- `app/(app)/settings/` - Add invoice numbering setting

### Existing code to reuse
- `app/(app)/apps/invoices/components/invoice-pdf.tsx` - PDF renderer (adapt to use Customer data)
- `app/(app)/apps/invoices/components/invoice-page.tsx` - Invoice form layout (adapt)
- `app/(app)/apps/invoices/components/invoice-generator.tsx` - Form state management (adapt)
- `app/(app)/apps/invoices/default-templates.ts` - Template system
- `app/(app)/apps/invoices/actions.ts` - PDF generation action (reuse)
- `components/transactions/` - Reuse list, filters, pagination for /expenses
- `components/forms/` - Reuse form components (select, date picker, etc.)
- `lib/llm-providers.ts`, `ai/` - Reuse for any AI features on expenses

---

## Verification Plan

### Database
- [ ] Run `npx prisma migrate dev` - migration applies cleanly
- [ ] Verify Customer, Invoice, Payment tables created
- [ ] Verify Transaction has customerId column

### Customers
- [ ] Create customer via /customers with all fields
- [ ] Edit customer via slide-out panel
- [ ] Delete customer (check cascade behavior)
- [ ] Search customers by name/email
- [ ] Summary cards show correct counts

### Invoices
- [ ] Create invoice with existing customer - auto-fills details
- [ ] Create invoice with new customer inline - creates customer record
- [ ] Invoice number auto-increments correctly (YYYY-NNN)
- [ ] PDF preview renders with customer data (not free-text)
- [ ] Save as draft - persists, appears in /invoices list
- [ ] Mark as sent - status updates
- [ ] Record partial payment - status becomes partially_paid, paidAmount updates
- [ ] Record full payment - status becomes paid, Transaction created, appears in dashboard
- [ ] Overdue detection works when due date passes
- [ ] Cancel invoice - status updates
- [ ] Duplicate cancelled invoice as new draft
- [ ] Download PDF works from detail page
- [ ] Filters work: by status, customer, date range

### Expenses
- [ ] /expenses shows only type=expense transactions
- [ ] Customer filter dropdown works
- [ ] Existing upload/AI analysis flow still works from /expenses
- [ ] All existing transaction features (edit, delete, export) work

### Navigation
- [ ] Sidebar shows: Home, Invoices, Expenses, Unsorted, Customers, Apps, Settings
- [ ] All links navigate correctly
- [ ] Unsorted badge count still works

### Integration
- [ ] Paid invoice creates income transaction
- [ ] Income transaction shows in dashboard stats
- [ ] Income transaction linked to customer
- [ ] Existing CSV/ZIP export includes income transactions
