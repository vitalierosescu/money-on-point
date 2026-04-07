# PEPPOL

## Status

- Outbound PEPPOL sending is supported
- Non-PEPPOL `Email + PDF` remains available
- Inbound PEPPOL sync is not implemented

## Environments

- `Playground` for testing
- `Production` for real live sending

## Operational Notes

- Configure production credentials in Business Settings before live sending
- Switch the active PEPPOL environment to `Production` for real invoices
- Keep Playground configured for regression testing

## Current Limit

TaxHacker currently supports outbound PEPPOL only. Do not assume inbound collection, sync, or document ingestion exists.
