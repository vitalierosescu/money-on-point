import { FilePreview } from "@/components/files/preview"
import { UploadButton } from "@/components/files/upload-button"
import { PageShell } from "@/components/ui/page-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import AnalyzeForm from "@/components/unsorted/analyze-form"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { t } from "@/lib/i18n"
import { formatLocaleNumber, getUiLocale } from "@/lib/locale"
import { getCategories } from "@/models/categories"
import { getCurrencies } from "@/models/currencies"
import { getFields } from "@/models/fields"
import { getUnsortedFiles } from "@/models/files"
import { getProjects } from "@/models/projects"
import { getSettings } from "@/models/settings"
import { FileText, PartyPopper, Settings, Upload } from "lucide-react"
import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Unsorted",
  description: "Analyze unsorted files",
}

export default async function UnsortedPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const { saved } = await searchParams
  const user = await getCurrentUser()
  const files = await getUnsortedFiles(user.id)
  const categories = await getCategories(user.id)
  const projects = await getProjects(user.id)
  const currencies = await getCurrencies(user.id)
  const fields = await getFields(user.id)
  const settings = await getSettings(user.id)
  const locale = getUiLocale(settings)

  const currentFile = files[0] ?? null
  const currentIndex = currentFile ? 0 : -1
  const nextFile = currentIndex >= 0 ? files[currentIndex + 1] ?? null : null
  const remainingCount = currentFile ? Math.max(files.length - (currentIndex + 1), 0) : 0
  const fileCount = formatLocaleNumber(files.length, locale)
  const fileLabel = files.length === 1 ? t(locale, "unsorted.file") : t(locale, "unsorted.files")

  return (
    <PageShell maxWidth="page">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {t(locale, "unsorted.title", { count: fileCount, filesLabel: fileLabel })}
          </h2>
          {currentFile && files.length > 1 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {t(locale, "unsorted.queueLabel", {
                current: formatLocaleNumber(currentIndex + 1, locale),
                total: fileCount,
              })}
              {" · "}
              {t(locale, "unsorted.queueDescription", {
                remaining: formatLocaleNumber(remainingCount, locale),
              })}
            </p>
          )}
        </div>
      </header>

      {config.selfHosted.isEnabled &&
        !settings.openai_api_key &&
        !settings.google_api_key &&
        !settings.mistral_api_key &&
        !settings.openai_compatible_base_url && (
          <Alert>
            <Settings className="h-4 w-4 mt-2" />
            <div className="flex flex-row justify-between pt-2">
              <div className="flex flex-col">
                <AlertTitle>{t(locale, "unsorted.llmAlertTitle")}</AlertTitle>
                <AlertDescription>{t(locale, "unsorted.llmAlertDescription")}</AlertDescription>
              </div>
              <Link href="/settings/llm">
                <Button>{t(locale, "unsorted.goToSettings")}</Button>
              </Link>
            </div>
          </Alert>
        )}

      <main className="flex flex-col gap-5">
        {currentFile && (
          <Card
            key={currentFile.id}
            id={currentFile.id}
            className="flex flex-row flex-wrap md:flex-nowrap justify-center items-start gap-5 p-5 bg-gradient-to-br from-violet-50/80 via-indigo-50/80 to-white border-violet-200/60 rounded-2xl"
          >
            <div className="w-full max-w-[500px]">
              <Card>
                <FilePreview file={currentFile} locale={locale} />
              </Card>
            </div>

            <div className="w-full">
              <AnalyzeForm
                file={currentFile}
                categories={categories}
                projects={projects}
                currencies={currencies}
                fields={fields}
                settings={settings}
                locale={locale}
                hasNextFile={Boolean(nextFile)}
              />
            </div>
          </Card>
        )}
        {files.length == 0 && (
          <div className="flex flex-col items-center justify-center gap-2 h-full min-h-[600px]">
            <PartyPopper className="w-12 h-12 text-muted-foreground" />
            <p className="pt-4 text-muted-foreground">
              {saved === "1" ? t(locale, "unsorted.successTitle") : t(locale, "unsorted.emptyTitle")}
            </p>
            <p className="flex flex-row gap-2 text-muted-foreground">
              <span>{saved === "1" ? t(locale, "unsorted.successDescription") : t(locale, "unsorted.emptyDescription")}</span>
              <Upload />
            </p>

            <div className="flex flex-row gap-5 mt-8">
              <UploadButton>
                <Upload /> {t(locale, "unsorted.uploadNewFile")}
              </UploadButton>
              <Button variant="outline" asChild>
                <Link href="/invoices">
                  <FileText />
                  {t(locale, "unsorted.goToInvoices")}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </main>
    </PageShell>
  )
}
