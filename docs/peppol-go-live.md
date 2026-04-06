# PEPPOL Go-Live Next Steps

Saved on 2026-04-05 so the production rollout steps stay easy to find again.

## Current State

- Outbound PEPPOL sending from TaxHacker works end to end with Recommand Playground.
- Non-PEPPOL `Email + PDF` invoicing remains available for US and other non-PEPPOL clients.
- Inbound PEPPOL sync into TaxHacker is not implemented yet.

## Next Steps

1. Add your real Recommand production credentials in Business Settings.
   Fields:
   - Production team ID
   - Production company ID
   - Production API key
   - Production API secret

2. Switch the active PEPPOL environment to `Production`.
   Path:
   - `Settings -> Business -> PEPPOL Sender Setup`

3. Send one low-risk real PEPPOL invoice first.
   Goal:
   - Confirm the production credentials are correct
   - Confirm the recipient is reachable in the live network
   - Confirm the provider reference is stored in TaxHacker

4. Keep Playground configured too.
   Reason:
   - Playground stays useful for regression testing without touching real recipients

5. Build inbound PEPPOL sync later if you want TaxHacker to receive supplier/customer documents directly.
   Scope for that later phase:
   - fetch incoming documents from Recommand
   - store them in TaxHacker
   - route them into files / expenses / review flow

## Important Limits

- `Playground` is for testing only.
- `Production` is required for real live PEPPOL sending.
- TaxHacker currently supports outbound PEPPOL only, not inbound collection/sync.
