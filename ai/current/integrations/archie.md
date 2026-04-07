# Archie

## Status

Archie integration exists in the app, but should be treated as `partial` until typecheck is clean and end-to-end behavior is verified.

## Intended Scope

- ingest Archie invoices into TaxHacker
- create or update customers from Archie billing data
- attempt PEPPOL delivery through Recommand when invoice data is PEPPOL-ready
- support webhook-driven ingest plus manual sync fallback

## Setup

- Archie client ID and client secret
- webhook secret
- webhook target URL
- Archie space domain
- one or more group UUIDs
- integration enabled in Settings

## Current Caution

Do not treat this integration as fully stable source-of-truth functionality until the Archie-related typecheck issues are resolved and the workflow is manually verified.
