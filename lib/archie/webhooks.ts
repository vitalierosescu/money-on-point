import crypto from "crypto"
import config from "@/lib/config"
import type { SettingsMap } from "@/models/settings"

const SIGNATURE_WINDOW_SECONDS = 5 * 60
const GCM_NONCE_SIZE = 12
const GCM_TAG_SIZE = 16

export function getArchieWebhookTargetUrl(settings: SettingsMap): string {
  const configured = settings.archie_webhook_target_url?.trim()
  if (configured) return configured
  return `${config.app.baseURL}/api/webhooks/archie`
}

export function verifyArchieSignature(options: {
  secret: string
  targetUrl: string
  rawBody: string
  timestamp: string
  signature: string
}): { ok: boolean; error?: string } {
  const { secret, targetUrl, rawBody, timestamp, signature } = options

  if (!timestamp || !signature) {
    return { ok: false, error: "Missing signature headers." }
  }

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) {
    return { ok: false, error: "Invalid timestamp." }
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (nowSeconds - ts > SIGNATURE_WINDOW_SECONDS) {
    return { ok: false, error: "Signature timestamp expired." }
  }

  const message = `${secret}${targetUrl}${rawBody}${timestamp}`
  const expected = crypto.createHmac("sha256", secret).update(message).digest("base64")

  const expectedBuffer = Buffer.from(expected)
  const signatureBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== signatureBuffer.length) {
    return { ok: false, error: "Signature length mismatch." }
  }

  const ok = crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  return ok ? { ok: true } : { ok: false, error: "Signature mismatch." }
}

export function decryptArchieWebhookData(secret: string, encrypted: string): string {
  const secretBytes = Buffer.from(secret)
  if (secretBytes.length < 32) {
    throw new Error("Webhook secret must be at least 32 bytes for AES-256-GCM.")
  }

  const key = secretBytes.subarray(0, 32)
  const payload = Buffer.from(encrypted, "base64")
  if (payload.length <= GCM_NONCE_SIZE + GCM_TAG_SIZE) {
    throw new Error("Encrypted payload is too short.")
  }

  const nonce = payload.subarray(0, GCM_NONCE_SIZE)
  const ciphertextWithTag = payload.subarray(GCM_NONCE_SIZE)
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - GCM_TAG_SIZE)
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - GCM_TAG_SIZE)

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString("utf8")
}
