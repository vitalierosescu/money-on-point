# PEPPOL

## Status

- Outbound PEPPOL sending is supported
- Non-PEPPOL `Email + PDF` remains available through Resend
- Inbound PEPPOL sync is not implemented

## Environments

- `Playground` for testing
- `Production` for real live sending

## Operational Notes

- Configure production credentials in Business Settings before live sending
- Switch the active PEPPOL environment to `Production` for real invoices
- Keep Playground configured for regression testing
- Recommand is PEPPOL-only in the current app; direct invoice emails are sent through Resend

## Environment Tracking

Every PEPPOL send (successful or failed) writes the active Recommand environment to `Invoice.peppolEnvironment` via `lib/peppol-send.ts`. The invoices list renders a small color-coded chip next to the delivery method label: amber `Playground` or green `Prod`. Historical invoices sent before this field existed stay unlabeled (null), so only new sends show the chip.

## Current Limit

TaxHacker currently supports outbound PEPPOL only. Do not assume inbound collection, sync, or document ingestion exists.
