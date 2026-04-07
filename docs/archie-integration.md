# Archie Integration

This integration ingests Archie invoices into TaxHacker and (when possible) sends them via PEPPOL through Recommand.

## Setup
1. Go to `Settings → Integrations`.
2. Fill in the Archie credentials:
   - `Client ID`
   - `Client secret`
3. Add the webhook secret from Archie.
4. Set `Webhook target URL` to your public endpoint:
   - Default: `https://your-domain.com/api/webhooks/archie`
5. Set `Space domain` (Archie space).
6. Add one or more `Group UUIDs` (comma-separated or one per line).
7. Toggle **Integration status** to **Enabled** and save.

## Webhooks
Archie sends encrypted webhooks with a signature. TaxHacker verifies:
1. Timestamp window (5 minutes).
2. Signature (`X-Archie-Signature`) using `secret + targetUrl + rawBody + timestamp`.
3. AES-256-GCM decryption of `event.data`.

Only invoice events are ingested. Non-invoice events are ignored.

## Manual Sync
Use the **Sync now** button to pull **open** invoices for each configured group. This is the fallback if webhooks are unavailable.

## Behavior
- Customers are created/updated based on Archie billing entity data.
- `PEPPOL` + VAT numbers are extracted from `billed_entity_tax_numbers`.
- Invoices are stored as `sent` with `deliveryStatus=not_sent`, then automatically sent via Recommand if PEPPOL-ready.
- If PEPPOL validation fails, the invoice remains in `deliveryStatus=failed` with the validation error.

## Troubleshooting
- If webhooks return `401`, confirm the webhook secret and target URL.
- If invoices are skipped, ensure the group UUID is included and the invoice state is `open`.
