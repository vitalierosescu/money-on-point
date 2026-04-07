"use client"

import { saveSettingsAction } from "@/app/(app)/settings/actions"
import { syncArchieInvoicesAction, type ArchieSyncResult } from "@/app/(app)/settings/integrations/actions"
import { FormError } from "@/components/forms/error"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { CircleCheckBig, RefreshCw } from "lucide-react"
import { useActionState, useState, useTransition } from "react"

const DEFAULT_STATUS: ArchieSyncResult | null = null

export default function IntegrationsSettingsForm({ settings }: { settings: Record<string, string> }) {
  const [saveState, saveAction, pending] = useActionState(saveSettingsAction, null)
  const [syncState, setSyncState] = useState<ArchieSyncResult | null>(DEFAULT_STATUS)
  const [isSyncing, startSync] = useTransition()

  const isEnabled = settings.archie_enabled === "true"

  const handleSync = () => {
    setSyncState(null)
    startSync(async () => {
      const result = await syncArchieInvoicesAction()
      setSyncState(result)
    })
  }

  return (
    <form action={saveAction} className="space-y-space-6 rounded-lg border bg-card p-space-5">
      <div>
        <h2 className="text-lg font-semibold">Archie</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sync Archie invoices into TaxHacker and send them via PEPPOL using your Recommand credentials.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="archie_enabled">Integration status</Label>
          <NativeSelect id="archie_enabled" name="archie_enabled" defaultValue={isEnabled ? "true" : "false"}>
            <option value="false">Disabled</option>
            <option value="true">Enabled</option>
          </NativeSelect>
        </div>
        <div className="text-sm text-muted-foreground">
          Keep this disabled until your credentials and webhook are configured.
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="archie_client_id">Client ID</Label>
          <Input id="archie_client_id" name="archie_client_id" defaultValue={settings.archie_client_id || ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="archie_client_secret">Client secret</Label>
          <Input
            id="archie_client_secret"
            name="archie_client_secret"
            type="password"
            autoComplete="new-password"
            defaultValue={settings.archie_client_secret || ""}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="archie_webhook_secret">Webhook secret</Label>
          <Input
            id="archie_webhook_secret"
            name="archie_webhook_secret"
            type="password"
            autoComplete="new-password"
            defaultValue={settings.archie_webhook_secret || ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="archie_webhook_target_url">Webhook target URL</Label>
          <Input
            id="archie_webhook_target_url"
            name="archie_webhook_target_url"
            placeholder="https://your-domain.com/api/webhooks/archie"
            defaultValue={settings.archie_webhook_target_url || ""}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="archie_space_domain">Space domain</Label>
          <Input id="archie_space_domain" name="archie_space_domain" defaultValue={settings.archie_space_domain || ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="archie_group_uuids">Group UUIDs</Label>
          <Textarea
            id="archie_group_uuids"
            name="archie_group_uuids"
            rows={3}
            placeholder="UUID-1, UUID-2 or one per line"
            defaultValue={settings.archie_group_uuids || ""}
          />
        </div>
      </div>

      {saveState && !saveState.success && <FormError message={saveState.error} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save Archie settings"}
        </Button>
        {saveState?.success && (
          <div className="inline-flex items-center gap-2 text-sm text-success">
            <CircleCheckBig className="h-4 w-4" />
            Saved
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Manual sync</div>
            <p className="text-xs text-muted-foreground">Pull open invoices from Archie on demand.</p>
          </div>
          <Button type="button" variant="outline" onClick={handleSync} disabled={!isEnabled || isSyncing}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {isSyncing ? "Syncing..." : "Sync now"}
          </Button>
        </div>

        {syncState && (
          <div className="mt-3 text-sm">
            {syncState.success ? (
              <div className="text-muted-foreground">
                Synced. Ingested {syncState.data.ingested}, sent {syncState.data.sent}, skipped {syncState.data.skipped}, failed {syncState.data.failed}.
              </div>
            ) : (
              <div className="text-warning">{syncState.error}</div>
            )}
          </div>
        )}
      </div>
    </form>
  )
}
