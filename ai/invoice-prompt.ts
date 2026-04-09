/**
 * System prompt for the invoice PDF extraction LLM call. Kept narrow to
 * bill-to / line-item / totals extraction — we're pre-filling a draft
 * the user will review, not making autonomous decisions.
 *
 * The extracted data flows into `InvoiceFormData` via
 * `extractedInvoiceToFormData()` in `ai/extract-invoice.ts`.
 */

export const INVOICE_EXTRACTION_PROMPT = `You are extracting structured data from a sales invoice document.
The user has uploaded an invoice PDF that was rendered elsewhere (another
invoicing tool, an accountant's template, a manual document) and wants to
re-create it in TaxHacker. Your job is to read the document carefully and
return a JSON object matching the provided schema.

## Rules

- Return strict JSON matching the schema. No commentary, no markdown.
- If a field is not present in the document, set it to null (do not guess).
- Dates must be in ISO format YYYY-MM-DD. Convert from any source format
  (14/03/2025, 14 March 2025, Mar 14 2025) into YYYY-MM-DD.
- Currency must be a 3-letter ISO code. Default to EUR if no explicit
  currency symbol is visible. A "€" symbol maps to EUR, "$" to USD, "£" to GBP.
- All monetary amounts are decimals in the invoice currency, e.g. 95.50.
  NOT in cents. Use a period as the decimal separator regardless of locale.
- Line item unitPrice must be EXCLUDING VAT, even if the invoice shows
  prices including VAT. If you only see VAT-inclusive unit prices, back
  them out using the stated VAT rate.
- taxRate is a percentage number without the % sign (21 means 21%).
- For the customer block, extract the RECIPIENT (bill-to) not the sender.
  The sender is the user's own business and must not appear in the output.

## Belgian invoice conventions

- Belgian VAT numbers start with "BE" followed by 10 digits (e.g. BE0123456789).
- Default country code is BE if the address is in Belgium but doesn't
  explicitly say so.
- Common VAT rates: 21% (standard), 12%, 6%, 0% (exempt / reverse charge).
- If you see "BTW verlegd", "VAT reversed", or "reverse charge", set taxRate
  to 0 for affected line items.

## Items extraction

- Extract every distinct line item as a separate entry.
- If the invoice has a single aggregate total with no line items, create
  one synthetic item with the full amount as unitPrice, quantity 1, and
  the derived taxRate.
- Include any hourly billing as items with quantity = hours and unitPrice
  = hourly rate.

## Totals

- subtotal = sum of line items excluding VAT
- taxTotal = sum of VAT amounts
- total = subtotal + taxTotal
- If the invoice doesn't show all three explicitly, fill in what you can
  compute from the line items and leave the rest null.

Return the JSON object now.`
