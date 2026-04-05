import { getBelgianAuthorRightsRule, type AuthorRightsData } from "@/lib/author-rights"
import { prisma } from "@/lib/db"
import { cache } from "react"

export type AuthorRightsCustomerTotal = {
  customerId: string | null
  customerName: string
  invoiceCount: number
  authorRightsGross: number
  withholding: number
  netRights: number
}

export type AuthorRightsYearReport = {
  year: number
  invoiceCount: number
  authorRightsGross: number
  withholding: number
  netRights: number
  professionalGross: number
  thresholdAmount: number | null
  thresholdUsedPct: number | null
  thresholdRemaining: number | null
  rulesConfigured: boolean
  customerTotals: AuthorRightsCustomerTotal[]
}

export const getAuthorRightsYearReport = cache(
  async (userId: string, year: number): Promise<AuthorRightsYearReport> => {
    const invoices = await prisma.invoice.findMany({
      where: {
        userId,
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

    let invoiceCount = 0
    let authorRightsGross = 0
    let withholding = 0
    let netRights = 0
    let professionalGross = 0
    const customerTotals = new Map<string, AuthorRightsCustomerTotal>()

    for (const invoice of invoices) {
      const data = invoice.authorRightsData as AuthorRightsData | null
      if (!data) continue

      invoiceCount++
      authorRightsGross += data.authorRightsGrossCents
      withholding += data.withholdingAmountCents
      netRights += data.rightsNetAmountCents
      professionalGross += data.professionalGrossCents

      const customerKey = invoice.customerId ?? "unknown"
      const existing = customerTotals.get(customerKey) ?? {
        customerId: invoice.customerId,
        customerName: invoice.customer?.name ?? "Unknown customer",
        invoiceCount: 0,
        authorRightsGross: 0,
        withholding: 0,
        netRights: 0,
      }

      existing.invoiceCount += 1
      existing.authorRightsGross += data.authorRightsGrossCents
      existing.withholding += data.withholdingAmountCents
      existing.netRights += data.rightsNetAmountCents
      customerTotals.set(customerKey, existing)
    }

    const rule = getBelgianAuthorRightsRule(year)
    const thresholdAmount = rule ? rule.maxAuthorRightsCompensationCents / 100 : null
    const thresholdUsedPct = rule
      ? Number(((authorRightsGross / rule.maxAuthorRightsCompensationCents) * 100).toFixed(1))
      : null
    const thresholdRemaining = rule ? (rule.maxAuthorRightsCompensationCents - authorRightsGross) / 100 : null

    return {
      year,
      invoiceCount,
      authorRightsGross: authorRightsGross / 100,
      withholding: withholding / 100,
      netRights: netRights / 100,
      professionalGross: professionalGross / 100,
      thresholdAmount,
      thresholdUsedPct,
      thresholdRemaining,
      rulesConfigured: Boolean(rule),
      customerTotals: Array.from(customerTotals.values())
        .map((row) => ({
          ...row,
          authorRightsGross: row.authorRightsGross / 100,
          withholding: row.withholding / 100,
          netRights: row.netRights / 100,
        }))
        .sort((a, b) => b.authorRightsGross - a.authorRightsGross),
    }
  }
)
