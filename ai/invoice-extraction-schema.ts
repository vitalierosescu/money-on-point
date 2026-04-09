/**
 * JSON Schema describing the shape we want the LLM to extract from an
 * uploaded invoice PDF. Hand-written (not derived from `fieldsToJsonSchema`
 * in `ai/schema.ts`, which is transaction-field specific) so we can tune
 * field descriptions for invoice semantics.
 *
 * The LLM is called via Langchain's `withStructuredOutput`, which enforces
 * this schema. Every property is required + nullable rather than optional,
 * because some providers (notably OpenAI's strict JSON schema mode) only
 * accept schemas where every property in `required` is present on every
 * response. Using `type: ["string", "null"]` keeps the schema strict while
 * letting the model omit fields it cannot confidently extract.
 */

export const INVOICE_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    invoiceNumber: {
      type: ["string", "null"],
      description: "The invoice number as it appears on the document, verbatim.",
    },
    issuedAt: {
      type: ["string", "null"],
      description: "Issue date in ISO format YYYY-MM-DD.",
    },
    dueDate: {
      type: ["string", "null"],
      description: "Due date in ISO format YYYY-MM-DD. If the invoice has no due date, use null.",
    },
    currency: {
      type: ["string", "null"],
      description: "3-letter ISO currency code (EUR, USD, GBP). Default to EUR if not explicitly stated.",
    },
    customer: {
      type: "object",
      description: "The recipient (bill-to) of the invoice.",
      properties: {
        name: { type: ["string", "null"], description: "Customer legal name" },
        email: { type: ["string", "null"], description: "Customer email if present" },
        vatNumber: { type: ["string", "null"], description: "VAT number (e.g. BE0123456789)" },
        country: { type: ["string", "null"], description: "2-letter ISO country code (BE, NL, FR)" },
        street: { type: ["string", "null"], description: "Street address line" },
        zipCode: { type: ["string", "null"], description: "Postal code" },
        city: { type: ["string", "null"], description: "City" },
      },
      required: ["name", "email", "vatNumber", "country", "street", "zipCode", "city"],
      additionalProperties: false,
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
        additionalProperties: false,
      },
    },
    subtotal: {
      type: ["number", "null"],
      description: "Subtotal (excl. VAT) as a decimal in the invoice currency.",
    },
    taxTotal: {
      type: ["number", "null"],
      description: "Total VAT/tax amount as a decimal in the invoice currency.",
    },
    total: {
      type: ["number", "null"],
      description: "Grand total (incl. VAT) as a decimal in the invoice currency.",
    },
    notes: {
      type: ["string", "null"],
      description: "Any free-text notes or terms at the bottom of the invoice.",
    },
    paymentReference: {
      type: ["string", "null"],
      description: "Structured communication or payment reference (OGM, BBA, etc.) if present.",
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
  additionalProperties: false,
}

export type ExtractedInvoice = {
  invoiceNumber: string | null
  issuedAt: string | null
  dueDate: string | null
  currency: string | null
  customer: {
    name: string | null
    email: string | null
    vatNumber: string | null
    country: string | null
    street: string | null
    zipCode: string | null
    city: string | null
  }
  items: Array<{
    name: string
    quantity: number
    unitPrice: number
    taxRate: number
  }>
  subtotal: number | null
  taxTotal: number | null
  total: number | null
  notes: string | null
  paymentReference: string | null
}
