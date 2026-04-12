export const ANALYSIS_RUN_KIND = "unsorted_bulk_analysis" as const
export const ANALYSIS_RUN_MODE_PENDING_ONLY = "pending_only" as const

export const ANALYSIS_RUN_ACTIVE_STATUSES = ["queued", "running"] as const
export const ANALYSIS_RUN_TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const

export type AnalysisRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

export type AnalysisRunItemState =
  | "queued"
  | "running"
  | "auto_saved"
  | "needs_review"
  | "failed"
  | "skipped"
  | "cancelled"

export type AnalysisRunItemView = {
  id: string
  fileId: string
  fileName: string
  position: number
  state: AnalysisRunItemState
  attempts: number
  transactionId: string | null
  errorCode: string | null
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
}

export type AnalysisRunSummary = {
  id: string
  kind: typeof ANALYSIS_RUN_KIND
  mode: typeof ANALYSIS_RUN_MODE_PENDING_ONLY
  status: AnalysisRunStatus
  total: number
  processed: number
  autoSaved: number
  needsReview: number
  failedCount: number
  skipped: number
  currentFileId: string | null
  currentFilename: string | null
  startedAt: string | null
  finishedAt: string | null
  lastHeartbeatAt: string | null
  lastError: string | null
  items: AnalysisRunItemView[]
}

export function isAnalysisRunActiveStatus(status: string): status is (typeof ANALYSIS_RUN_ACTIVE_STATUSES)[number] {
  return ANALYSIS_RUN_ACTIVE_STATUSES.includes(status as (typeof ANALYSIS_RUN_ACTIVE_STATUSES)[number])
}

export function isAnalysisRunTerminalStatus(
  status: string
): status is (typeof ANALYSIS_RUN_TERMINAL_STATUSES)[number] {
  return ANALYSIS_RUN_TERMINAL_STATUSES.includes(status as (typeof ANALYSIS_RUN_TERMINAL_STATUSES)[number])
}
