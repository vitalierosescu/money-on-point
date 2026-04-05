import { getCurrentUser } from "@/lib/auth"
import { getAuthorRightsYearReport } from "@/models/author-rights"
import { parseYearParam } from "@/lib/parse-year-param"
import { format as formatCsv } from "@fast-csv/format"
import { PassThrough } from "stream"

export async function GET(request: Request) {
  const user = await getCurrentUser()
  const url = new URL(request.url)
  const year = parseYearParam(url.searchParams.get("year"))
  const report = await getAuthorRightsYearReport(user.id, year)

  const pass = new PassThrough()
  const csvStream = formatCsv({ headers: true, delimiter: ";" })
  csvStream.pipe(pass)
  for (const row of report.customerTotals) {
    csvStream.write({
      customer: row.customerName,
      invoiceCount: row.invoiceCount,
      authorRightsGross: row.authorRightsGross.toFixed(2),
      withholding: row.withholding.toFixed(2),
      netRights: row.netRights.toFixed(2),
    })
  }
  csvStream.end()

  const chunks: Buffer[] = []
  for await (const chunk of pass) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const csv = Buffer.concat([Buffer.from("\xEF\xBB\xBF"), ...chunks])

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="author-rights-customers-${year}.csv"`,
    },
  })
}
