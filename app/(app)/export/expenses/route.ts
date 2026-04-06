import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { parseYearParam } from "@/lib/parse-year-param"
import { format as formatCsv } from "@fast-csv/format"
import { PassThrough } from "stream"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const user = await getCurrentUser()
  const url = new URL(request.url)
  const year = parseYearParam(url.searchParams.get("year"))

  const expenses = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      type: "expense",
      issuedAt: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    },
    orderBy: { issuedAt: "asc" },
  })

  const rows = expenses.map((exp) => ({
    date: exp.issuedAt
      ? new Intl.DateTimeFormat("nl-BE").format(new Date(exp.issuedAt))
      : "",
    merchant: exp.merchant ?? exp.name ?? "",
    category: exp.categoryCode ?? "",
    status: exp.status ?? "",
    currency: exp.currencyCode ?? "",
    total: ((exp.total ?? 0) / 100).toFixed(2),
    taxAmount: exp.taxAmount !== null && exp.taxAmount !== undefined
      ? (exp.taxAmount / 100).toFixed(2)
      : "",
    note: exp.note ?? "",
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
      "Content-Disposition": `attachment; filename="uitgaven-${year}.csv"`,
    },
  })
}
