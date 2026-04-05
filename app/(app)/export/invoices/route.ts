import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { format as formatCsv } from "@fast-csv/format"
import { PassThrough } from "stream"

export async function GET(request: Request) {
  const user = await getCurrentUser()
  const url = new URL(request.url)
  const yearParam = url.searchParams.get("year") ?? ""
  const parsed = parseInt(yearParam, 10)
  const year = Number.isFinite(parsed) && parsed >= 2000 && parsed <= 2100
    ? parsed
    : new Date().getFullYear()

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
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    customer: inv.customer?.name ?? "",
    vatNumber: inv.customer?.vatNumber ?? "",
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
  const csv = Buffer.concat(chunks)

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="facturen-${year}.csv"`,
    },
  })
}
