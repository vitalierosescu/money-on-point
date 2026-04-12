"use client"

import {
  analyzeFileByIdAction,
  listUnanalyzedUnsortedFileIdsAction,
} from "@/app/(app)/unsorted/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  const [isPreparing, setIsPreparing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  async function handleClick() {
    if (progress || isPreparing) return

    setIsPreparing(true)
    try {
      const list = await listUnanalyzedUnsortedFileIdsAction()
      if (!list.success) {
        toast.error(list.error)
        return
      }
      if (list.ids.length === 0) {
        toast.info(t(locale, "unsorted.bulkAnalyzeAllCached"))
        return
      }

      setPendingIds(list.ids)
      setConfirmOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to prepare bulk analysis")
    } finally {
      if (isMountedRef.current) {
        setIsPreparing(false)
      }
    }
  }

  async function runBulkAnalyze(ids: string[]) {
    const total = ids.length
    setProgress({ current: 0, total })
    let autoSaved = 0
    let needsReview = 0
    let failed = 0
    let balanceExhausted = false

    for (let i = 0; i < ids.length; i++) {
      const result = await analyzeFileByIdAction(ids[i])

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
    setPendingIds([])

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

  async function handleConfirm() {
    if (pendingIds.length === 0 || progress || isPreparing) return
    setConfirmOpen(false)

    try {
      await runBulkAnalyze(pendingIds)
    } catch (error) {
      if (!isMountedRef.current) return
      setProgress(null)
      setPendingIds([])
      toast.error(error instanceof Error ? error.message : "Failed to analyze files")
    }
  }

  const isRunning = progress !== null
  const isBusy = isRunning || isPreparing
  const confirmTitle =
    locale === "nl" ? "Alle niet-geanalyseerde bestanden analyseren?" : "Analyze all pending files?"
  const cancelLabel = locale === "nl" ? "Annuleren" : "Cancel"
  const confirmLabel = locale === "nl" ? "Analyseren" : "Analyze"

  return (
    <>
      <Button
        type="button"
        onClick={handleClick}
        disabled={isBusy}
        variant="outline"
        className="flex items-center gap-2"
      >
        {isBusy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {isRunning
              ? t(locale, "unsorted.bulkAnalyzeProgress", {
                  current: String(progress.current),
                  total: String(progress.total),
                })
              : t(locale, "unsorted.bulkAnalyze")}
          </>
        ) : (
          <>
            <Brain className="h-4 w-4" />
            {t(locale, "unsorted.bulkAnalyze")}
          </>
        )}
      </Button>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open)
          if (!open && !isRunning) {
            setPendingIds([])
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription>
              {t(locale, "unsorted.bulkAnalyzeConfirm", { count: String(pendingIds.length) })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {cancelLabel}
            </Button>
            <Button onClick={handleConfirm}>{confirmLabel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
