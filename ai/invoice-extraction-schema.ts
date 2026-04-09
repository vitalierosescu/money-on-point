/**
 * JSON Schema describing the shape we want the LLM to extract from an
 * uploaded invoice PDF. Hand-written (not derived from `fieldsToJsonSchema`
 * in `ai/schema.ts`, which is transaction-field specific) so we can tune
 * field descriptions for invoice semantics.
 *
 * ## Compatibility notes
 *
 * This schema is passed through Langchain's `withStructuredOutput` to
 * whichever provider is configured in Settings → LLM. Each provider
 * enforces it differently:
 *
 * - **OpenAI (strict mode)** accepts JSON Schema Draft 2020-12 with
 *   `type: ["string", "null"]` unions for nullability.
 * - **Google Gemini** uses an OpenAPI 3.0 subset that ONLY accepts a
 *   single-value `type`. Arrays of types cause a 400 from the
 *   `generativelanguage.googleapis.com` endpoint: "Proto field is not
 *   repeating, cannot start list". See the session on 2026-04-09.
 * - **Mistral** is similar to OpenAI but less strict.
 *
 * To be compatible with all three, this schema uses SINGLE types only
 * (never `type: ["x", "null"]`) and treats "missing" values as empty
 * strings or 0. The prompt in `ai/invoice-prompt.ts` instructs the model
 * to do the same, and the downstream transform in
 * `components/invoices/new-invoice-client.tsx` maps empty/zero values
 * back to sensible defaults before they reach `InvoiceGenerator`.
 */

export const INVOICE_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    invoiceNumber: {
      type: "string",
      description: "The invoice number as it appears on the document, verbatim. Empty string if not present.",
    },
    issuedAt: {
      type: "string",
      description: "Issue date in ISO format YYYY-MM-DD. Empty string if not present.",
    },
    dueDate: {
      type: "string",
      description: "Due date in ISO format YYYY-MM-DD. Empty string if the invoice has no due date.",
    },
    currency: {
      type: "string",
      description: "3-letter ISO currency code (EUR, USD, GBP). Default to EUR if not explicitly stated.",
    },
    customer: {
      type: "object",
      description: "The recipient (bill-to) of the invoice. Not the sender / invoicing party.",
      properties: {
        name: { type: "string", description: "Customer legal name. Empty string if not found." },
        email: { type: "string", description: "Customer email if present, empty string otherwise." },
        vatNumber: { type: "string", description: "VAT number (e.g. BE0123456789), empty string otherwise." },
        country: { type: "string", description: "2-letter ISO country code (BE, NL, FR), empty string otherwise." },
        street: { type: "string", description: "Street address line, empty string otherwise." },
        zipCode: { type: "string", description: "Postal code, empty string otherwise." },
        city: { type: "string", description: "City, empty string otherwise." },
      },
      required: ["name", "email", "vatNumber", "country", "street", "zipCode", "city"],
    },
    items: {
      type: "array",
      description: "Line items on the invoice. One entry per product/service line.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Line item name or description" },
          quantity: { type: "number", description: "Quantity, default 1 if the invoice doesn't specify" },
          unitPrice: {
            type: "number",
            description: "Unit price in the invoice currency, as a decimal (e.g. 95.50). Excluding VAT.",
          },
          taxRate: {
            type: "number",
            description: "VAT rate as a percentage (e.g. 21 for 21%). Use 0 if the line is not taxed.",
          },
        },
        required: ["name", "quantity", "unitPrice", "taxRate"],
      },
    },
    subtotal: {
      type: "number",
      description: "Subtotal (excl. VAT) as a decimal in the invoice currency. 0 if not present.",
    },
    taxTotal: {
      type: "number",
      description: "Total VAT/tax amount as a decimal in the invoice currency. 0 if not present.",
    },
    total: {
      type: "number",
      description: "Grand total (incl. VAT) as a decimal in the invoice currency. 0 if not present.",
    },
    notes: {
      type: "string",
      description: "Any free-text notes or terms at the bottom of the invoice. Empty string if none.",
    },
    paymentReference: {
      type: "string",
      description: "Structured communication / payment reference (OGM, BBA, etc.). Empty string if none.",
    },
  },
  required: [
    "invoiceNumber",
    "issuedAt",
    "dueDate",
    "currency",
    "customer",
    "items",
    "subtotal",
    "taxTotal",
    "total",
    "notes",
    "paymentReference",
  ],
}

/**
 * The runtime shape we get back from the LLM. All scalars are concrete
 * (no `| null`) because the schema uses single types; "missing" is
 * represented as empty string or 0 and the caller is responsible for
 * treating those as absent where it matters.
 */
export type ExtractedInvoice = {
  invoiceNumber: string
  issuedAt: string
  dueDate: string
  currency: string
  customer: {
    name: string
    email: string
    vatNumber: string
    country: string
    street: string
    zipCode: string
    city: string
  }
  items: Array<{
    name: string
    quantity: number
    unitPrice: number
    taxRate: number
  }>
  subtotal: number
  taxTotal: number
  total: number
  notes: string
  paymentReference: string
}
