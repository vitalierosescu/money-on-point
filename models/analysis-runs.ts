import {
  ANALYSIS_RUN_ACTIVE_STATUSES,
  ANALYSIS_RUN_KIND,
  ANALYSIS_RUN_MODE_PENDING_ONLY,
  type AnalysisRunSummary,
} from "@/lib/analysis-runs"
import { prisma } from "@/lib/db"
import type { Prisma } from "@/prisma/client"

const analysisRunWithItems = {
  items: {
    orderBy: {
      position: "asc",
    },
  },
} satisfies Prisma.AnalysisRunInclude

type AnalysisRunWithItems = Prisma.AnalysisRunGetPayload<{
  include: typeof analysisRunWithItems
}>

export function serializeAnalysisRun(run: AnalysisRunWithItems): AnalysisRunSummary {
  const currentItem =
    run.items.find((item) => item.state === "running") ??
    run.items.find((item) => item.state === "queued") ??
    null

  return {
    id: run.id,
    kind: ANALYSIS_RUN_KIND,
    mode: ANALYSIS_RUN_MODE_PENDING_ONLY,
    status: run.status as AnalysisRunSummary["status"],
    total: run.total,
    processed: run.processed,
    autoSaved: run.autoSaved,
    needsReview: run.needsReview,
    failedCount: run.failedCount,
    skipped: run.skipped,
    currentFileId: currentItem?.fileId ?? null,
    currentFilename: currentItem?.fileNameSnapshot ?? null,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    lastHeartbeatAt: run.lastHeartbeatAt?.toISOString() ?? null,
    lastError: run.lastError ?? null,
    items: run.items.map((item) => ({
      id: item.id,
      fileId: item.fileId,
      fileName: item.fileNameSnapshot,
      position: item.position,
      state: item.state as AnalysisRunSummary["items"][number]["state"],
      attempts: item.attempts,
      transactionId: item.transactionId ?? null,
      errorCode: item.errorCode ?? null,
      errorMessage: item.errorMessage ?? null,
      startedAt: item.startedAt?.toISOString() ?? null,
      finishedAt: item.finishedAt?.toISOString() ?? null,
    })),
  }
}

export async function getAnalysisRunById(userId: string, runId: string): Promise<AnalysisRunSummary | null> {
  const run = await prisma.analysisRun.findFirst({
    where: {
      id: runId,
      userId,
      kind: ANALYSIS_RUN_KIND,
    },
    include: analysisRunWithItems,
  })

  return run ? serializeAnalysisRun(run) : null
}

export async function getActiveAnalysisRun(userId: string): Promise<AnalysisRunSummary | null> {
  const run = await prisma.analysisRun.findFirst({
    where: {
      userId,
      kind: ANALYSIS_RUN_KIND,
      status: {
        in: [...ANALYSIS_RUN_ACTIVE_STATUSES],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    include: analysisRunWithItems,
  })

  return run ? serializeAnalysisRun(run) : null
}

export async function getRawActiveAnalysisRun(userId: string): Promise<AnalysisRunWithItems | null> {
  return prisma.analysisRun.findFirst({
    where: {
      userId,
      kind: ANALYSIS_RUN_KIND,
      status: {
        in: [...ANALYSIS_RUN_ACTIVE_STATUSES],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    include: analysisRunWithItems,
  })
}

export async function getRawAnalysisRunById(userId: string, runId: string): Promise<AnalysisRunWithItems | null> {
  return prisma.analysisRun.findFirst({
    where: {
      userId,
      id: runId,
      kind: ANALYSIS_RUN_KIND,
    },
    include: analysisRunWithItems,
  })
}
