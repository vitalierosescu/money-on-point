import { NextResponse } from "next/server"
import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { decryptArchieWebhookData, getArchieWebhookTargetUrl, verifyArchieSignature } from "@/lib/archie/webhooks"
import { ingestArchieWebhookInvoice } from "@/lib/archie/ingest"
import { getSettings, type SettingsMap } from "@/models/settings"
import { getSelfHostedUser } from "@/models/users"

type ArchieWebhookCandidate = { userId: string; settings: SettingsMap; secret: string }

const ARCHIE_SETTING_CODES: string[] = [
  "archie_enabled",
  "archie_webhook_secret",
  "archie_webhook_target_url",
  "archie_group_uuids",
]

function parseList(value?: string | null): string[] {
  if (!value) return []
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function normalizeEventType(value: unknown): string | null {
  if (typeof value !== "string") return null
  return value.trim().toLowerCase()
}

function isInvoiceEvent(eventType: string | null, payload: unknown): boolean {
  if (eventType) {
    if (eventType.startsWith("invoices.") || eventType.startsWith("invoice.")) return true
  }

  if (!payload || typeof payload !== "object") return false
  return (
    "lines" in payload ||
    "invoice_date" in payload ||
    "billed_entity_name" in payload ||
    "price_with_discount_with_taxes" in payload
  )
}

function resolveEntity(payload: Record<string, unknown>, fallbackEntityId?: string | null): { entityType: string; entityId?: string } {
  const rawType = typeof payload.billed_entity_type === "string" ? payload.billed_entity_type : "group"
  const entityType = rawType.trim().toLowerCase()
  const candidates = [
    payload.billed_entity_uuid,
    payload.billed_entity_id,
    payload.entity_uuid,
    payload.group_uuid,
    payload.groupUuid,
    payload.user_uuid,
    payload.userUuid,
  ]
  const entityId = candidates.find((value) => typeof value === "string" && value.trim().length > 0) as string | undefined
  return { entityType, entityId: entityId?.trim() || fallbackEntityId || undefined }
}

async function resolveArchieWebhookCandidate(rawBody: string, timestamp: string, signature: string): Promise<ArchieWebhookCandidate | null> {
  if (config.selfHosted.isEnabled) {
    const user = await getSelfHostedUser()
    if (!user) return null

    const settings = await getSettings(user.id)
    if (settings.archie_enabled !== "true") return null

    const secret = settings.archie_webhook_secret?.trim()
    if (!secret) return null

    const targetUrl = getArchieWebhookTargetUrl(settings)
    const verification = verifyArchieSignature({ secret, targetUrl, rawBody, timestamp, signature })
    if (!verification.ok) return null

    return { userId: user.id, settings, secret }
  }

  const settingsRows = await prisma.setting.findMany({
    where: { code: { in: ARCHIE_SETTING_CODES } },
    select: { userId: true, code: true, value: true },
  })

  const settingsByUser = new Map<string, SettingsMap>()
  for (const row of settingsRows) {
    const map = settingsByUser.get(row.userId) ?? {}
    map[row.code] = row.value ?? ""
    settingsByUser.set(row.userId, map)
  }

  for (const [userId, settings] of settingsByUser.entries()) {
    if (settings.archie_enabled !== "true") continue
    const secret = settings.archie_webhook_secret?.trim()
    if (!secret) continue

    const targetUrl = getArchieWebhookTargetUrl(settings)
    const verification = verifyArchieSignature({ secret, targetUrl, rawBody, timestamp, signature })
    if (!verification.ok) continue

    return { userId, settings, secret }
  }

  return null
}

export async function POST(request: Request) {
  const signature = request.headers.get("X-Archie-Signature") ?? ""
  const timestamp = request.headers.get("X-Archie-Request-Timestamp") ?? ""
  const rawBody = await request.text()

  if (!signature || !timestamp) {
    return new NextResponse("Missing Archie signature headers.", { status: 400 })
  }

  const candidate = await resolveArchieWebhookCandidate(rawBody, timestamp, signature)
  if (!candidate) {
    return new NextResponse("Unauthorized.", { status: 401 })
  }

  let events: unknown
  try {
    events = JSON.parse(rawBody)
  } catch {
    return new NextResponse("Invalid JSON body.", { status: 400 })
  }

  if (!Array.isArray(events)) {
    return new NextResponse("Webhook payload must be an array.", { status: 400 })
  }

  const groupUuids = parseList(candidate.settings.archie_group_uuids)
  const fallbackEntityId = groupUuids.length === 1 ? groupUuids[0] : null

  let handled = 0
  let skipped = 0
  let failed = 0

  for (const event of events) {
    if (!event || typeof event !== "object") {
      skipped += 1
      continue
    }

    const eventRecord = event as Record<string, unknown>
    const eventType = normalizeEventType(eventRecord.event_type)
    const encrypted = eventRecord.data
    if (typeof encrypted !== "string") {
      skipped += 1
      continue
    }

    try {
      const decrypted = decryptArchieWebhookData(candidate.secret, encrypted)
      const payload = JSON.parse(decrypted) as Record<string, unknown>

      if (!isInvoiceEvent(eventType, payload)) {
        skipped += 1
        continue
      }

      const { entityType, entityId } = resolveEntity(payload, fallbackEntityId)
      if (!entityId) {
        skipped += 1
        continue
      }

      await ingestArchieWebhookInvoice(candidate.userId, payload, { entityType, entityId })
      handled += 1
    } catch (error) {
      console.error("Archie webhook event failed", error)
      failed += 1
    }
  }

  return NextResponse.json({ ok: true, handled, skipped, failed })
}
