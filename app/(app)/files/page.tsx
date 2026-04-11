import { FileLibrary } from "@/components/files/file-library"
import { PageHeader } from "@/components/ui/page-header"
import { PageShell } from "@/components/ui/page-shell"
import { getCurrentUser } from "@/lib/auth"
import { t } from "@/lib/i18n"
import { getUiLocale } from "@/lib/locale"
import { getFilesLibrary } from "@/models/files"
import { getSettings } from "@/models/settings"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Files",
}

export default async function FilesPage() {
  const user = await getCurrentUser()
  const [files, settings] = await Promise.all([getFilesLibrary(user.id), getSettings(user.id)])
  const locale = getUiLocale(settings)

  return (
    <PageShell>
      <PageHeader
        title={t(locale, "files.title")}
        count={files.length}
        description={t(locale, "files.description")}
        className="mb-space-6"
      />

      <FileLibrary files={files} locale={locale} />
    </PageShell>
  )
}
