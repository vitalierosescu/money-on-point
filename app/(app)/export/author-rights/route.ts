import { getCurrentUser } from "@/lib/auth"
import { type AuthorRightsData } from "@/lib/author-rights"
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
      invoiceMode: "author_rights",
      status: { notIn: ["draft", "cancelled"] },
      issuedAt: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    },
    include: { customer: true },
    orderBy: { issuedAt: "asc" },
  })

  const rows = invoices.map((invoice) => {
    const data = (invoice.authorRightsData as AuthorRightsData | null) ?? null
    return {
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: new Intl.DateTimeFormat("nl-BE").format(new Date(invoice.issuedAt)),
      customer: invoice.customer?.name ?? "",
      contractReference: data?.contractReference ?? "",
      agreementDate: data?.agreementDate ?? "",
      professionalGross: ((data?.professionalGrossCents ?? 0) / 100).toFixed(2),
      authorRightsGross: ((data?.authorRightsGrossCents ?? 0) / 100).toFixed(2),
      serviceVat: ((data?.serviceVatAmountCents ?? 0) / 100).toFixed(2),
      rightsVat: ((data?.rightsVatAmountCents ?? 0) / 100).toFixed(2),
      withholding: ((data?.withholdingAmountCents ?? 0) / 100).toFixed(2),
      rightsNet: ((data?.rightsNetAmountCents ?? 0) / 100).toFixed(2),
      netPayable: ((data?.netPayableCents ?? 0) / 100).toFixed(2),
      splitMode: data?.splitMode ?? "",
      ruleYear: data?.sourceRuleYear ?? "",
    }
  })

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
      "Content-Disposition": `attachment; filename="author-rights-${year}.csv"`,
    },
  })
}
