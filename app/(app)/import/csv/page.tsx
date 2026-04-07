import { ImportCSVTable } from "@/components/import/csv"
import { PageShell } from "@/components/ui/page-shell"
import { getCurrentUser } from "@/lib/auth"
import { getFields } from "@/models/fields"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Import from CSV",
  description: "Import transactions from a CSV file",
}

export default async function CSVImportPage() {
  const user = await getCurrentUser()
  const fields = await getFields(user.id)
  return (
    <PageShell>
      <ImportCSVTable fields={fields} />
    </PageShell>
  )
}
