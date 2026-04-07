"use server"

import { getCurrentUser } from "@/lib/auth"
import { syncArchieInvoicesForUser } from "@/lib/archie/ingest"
import { getSettings } from "@/models/settings"

export type ArchieSyncResult =
  | { success: true; data: { ingested: number; sent: number; skipped: number; failed: number } }
  | { success: false; error: string }

export async function syncArchieInvoicesAction(): Promise<ArchieSyncResult> {
  const user = await getCurrentUser()
  const settings = await getSettings(user.id)

  if (settings.archie_enabled !== "true") {
    return { success: false, error: "Enable the Archie integration first." }
  }

  const result = await syncArchieInvoicesForUser(user.id)
  return { success: true, data: result }
}
