"use client"

import {
  analyzeFileByIdAction,
  listUnanalyzedUnsortedFileIdsAction,
} from "@/app/(app)/unsorted/actions"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"
import type { UiLocale } from "@/lib/locale"
import { Brain, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

type Props = { locale: UiLocale }

export function BulkAnalyzeButton({ locale }: Props) {
  const router = useRouter()
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  async function handleClick() {
    if (progress) return // already running

    const list = await listUnanalyzedUnsortedFileIdsAction()
    if (!list.success) {
      toast.error(list.error)
      return
    }
    if (list.ids.length === 0) {
      toast.info(t(locale, "unsorted.bulkAnalyzeAllCached"))
      return
    }

    const total = list.ids.length
    const confirmed = window.confirm(
      t(locale, "unsorted.bulkAnalyzeConfirm", { count: String(total) })
    )
    if (!confirmed) return

    setProgress({ current: 0, total })
    let autoSaved = 0
    let needsReview = 0
    let failed = 0
    let balanceExhausted = false

    for (let i = 0; i < list.ids.length; i++) {
      const result = await analyzeFileByIdAction(list.ids[i])

      if (!isMountedRef.current) return // user navigated away

      if (!result.success) {
        failed++
        const errMsg = (result.error || "").toLowerCase()
        if (errMsg.includes("ai scans") || errMsg.includes("subscription")) {
          balanceExhausted = true
          setProgress({ current: i + 1, total })
          break
        }
      } else if (result.data?.autoSaved) {
        autoSaved++
      } else {
        needsReview++
      }
      setProgress({ current: i + 1, total })
    }

    if (!isMountedRef.current) return
    setProgress(null)

    // Compose the result toast. Priority: balance exhausted → has failures → mixed
    // → all auto-saved → all need review.
    if (balanceExhausted) {
      toast.warning(
        t(locale, "unsorted.bulkAnalyzeBalanceExhausted", {
          count: String(autoSaved + needsReview),
        })
      )
    } else if (failed > 0) {
      toast.warning(
        t(locale, "unsorted.bulkAnalyzeWithFailures", {
          autoSaved: String(autoSaved),
          needsReview: String(needsReview),
          failed: String(failed),
        })
      )
    } else if (autoSaved > 0 && needsReview > 0) {
      toast.info(
        t(locale, "unsorted.bulkAnalyzeMixed", {
          autoSaved: String(autoSaved),
          needsReview: String(needsReview),
        })
      )
    } else if (autoSaved > 0) {
      toast.success(t(locale, "unsorted.bulkAnalyzeAutoSaved", { count: String(autoSaved) }))
    } else if (needsReview > 0) {
      toast.info(t(locale, "unsorted.bulkAnalyzeNeedReview", { count: String(needsReview) }))
    }

    router.refresh()
  }

  const isRunning = progress !== null

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={isRunning}
      variant="outline"
      className="flex items-center gap-2"
    >
      {isRunning ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t(locale, "unsorted.bulkAnalyzeProgress", {
            current: String(progress.current),
            total: String(progress.total),
          })}
        </>
      ) : (
        <>
          <Brain className="h-4 w-4" />
          {t(locale, "unsorted.bulkAnalyze")}
        </>
      )}
    </Button>
  )
}
