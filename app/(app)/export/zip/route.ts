import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"
import { parseYearParam } from "@/lib/parse-year-param"
import { generateInvoicePDF } from "@/lib/invoice-pdf/generate"
import type { InvoiceFormData } from "@/lib/invoice-pdf/types"
import JSZip from "jszip"

export async function GET(request: Request) {
  const user = await getCurrentUser()
  const url = new URL(request.url)
  const year = parseYearParam(url.searchParams.get("year"))

  const invoices = await prisma.invoice.findMany({
    where: {
      userId: user.id,
      status: "paid",
      paidAt: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
      templateData: { not: Prisma.AnyNull },
    },
    select: { id: true, invoiceNumber: true, templateData: true },
    orderBy: { invoiceNumber: "asc" },
  })

  const zip = new JSZip()

  for (const inv of invoices) {
    try {
      const templateData = inv.templateData as unknown as InvoiceFormData
      const pdfBuffer = await generateInvoicePDF(templateData)
      zip.file(`${inv.invoiceNumber}.pdf`, pdfBuffer)
    } catch (err) {
      console.error(`PDF generation failed for invoice ${inv.invoiceNumber}:`, err)
      // Skip failed invoices — continue with rest
    }
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })

  return new Response(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="facturen-${year}.zip"`,
    },
  })
}
