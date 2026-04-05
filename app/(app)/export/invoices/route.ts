import { getInvoiceDeliveryMethod, normalizeCountryCode, normalizeInvoiceDeliveryStatus } from "@/lib/invoice-delivery"
import { isAuthorRightsMode, type AuthorRightsData } from "@/lib/author-rights"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { parseYearParam } from "@/lib/parse-year-param"
import { format as formatCsv } from "@fast-csv/format"
import { PassThrough } from "stream"

export async function GET(request: Request) {
  const user = await getCurrentUser()
  const url = new URL(request.url)
  const year = parseYearParam(url.searchParams.get("year"))

  const invoices = await prisma.invoice.findMany({
    where: {
      userId: user.id,
      issuedAt: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    },
    include: { customer: true },
    orderBy: { issuedAt: "asc" },
  })

  const rows = invoices.map((inv) => ({
    invoiceMode: inv.invoiceMode ?? "standard",
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    customer: inv.customer?.name ?? "",
    customerCountry: normalizeCountryCode(inv.customer?.country),
    vatNumber: inv.customer?.vatNumber ?? "",
    peppolId: inv.customer?.peppolId ?? "",
    issuedAt: inv.issuedAt
      ? new Intl.DateTimeFormat("nl-BE").format(new Date(inv.issuedAt))
      : "",
    dueDate: inv.dueDate
      ? new Intl.DateTimeFormat("nl-BE").format(new Date(inv.dueDate))
      : "",
    paidAt: inv.paidAt
      ? new Intl.DateTimeFormat("nl-BE").format(new Date(inv.paidAt))
      : "",
    currency: inv.currency,
    subtotal: ((inv.subtotal ?? 0) / 100).toFixed(2),
    taxTotal: ((inv.taxTotal ?? 0) / 100).toFixed(2),
    total: (inv.total / 100).toFixed(2),
    paidAmount: ((inv.paidAmount ?? 0) / 100).toFixed(2),
    reverseCharge: inv.isVatReversed ? "yes" : "no",
    deliveryMethod: getInvoiceDeliveryMethod(inv),
    deliveryStatus: normalizeInvoiceDeliveryStatus(inv.deliveryStatus),
    authorRightsContractReference: isAuthorRightsMode(inv.invoiceMode)
      ? ((inv.authorRightsData as AuthorRightsData | null)?.contractReference ?? "")
      : "",
    authorRightsGross: isAuthorRightsMode(inv.invoiceMode)
      ? (((inv.authorRightsData as AuthorRightsData | null)?.authorRightsGrossCents ?? 0) / 100).toFixed(2)
      : "",
    authorRightsWithholding: isAuthorRightsMode(inv.invoiceMode)
      ? (((inv.authorRightsData as AuthorRightsData | null)?.withholdingAmountCents ?? 0) / 100).toFixed(2)
      : "",
  }))

  const pass = new PassThrough()
  const csvStream = formatCsv({ headers: true, delimiter: ";" })
  csvStream.pipe(pass)
  for (const row of rows) csvStream.write(row)
  csvStream.end()

  const chunks: Buffer[] = []
  for await (const chunk of pass) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const csv = Buffer.concat([Buffer.from("\xEF\xBB\xBF"), ...chunks])

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="facturen-${year}.csv"`,
    },
  })
}
