# Features

Statuses:
- `live`: should work in the current app
- `partial`: present but has known limits or ongoing stabilization
- `planned`: not implemented yet

## Core App

- `live` Dashboard with hero, work queue, upload entry points, stats, and reports shortcuts
- `live` Invoices list, filters, drawer, create/edit flow, PDF generation, email sending, payment actions
- `live` Expenses list, status tabs, bulk actions, drawer, edit flow, file attachment handling
- `live` Customers list and customer detail pages
- `live` Files page and file library flows
- `live` Reports page with revenue, cashflow, outstanding, VAT, and author-rights reporting
- `live` Settings for general, business, profile, LLM, categories, projects, currencies, backups, danger zone
- `live` Backup export and restore

## Integrations

- `live` Outbound PEPPOL via Recommand Playground and Production configuration
- `partial` Archie invoice ingestion and webhook/manual sync
- `planned` Inbound PEPPOL sync

## Platform / Infra

- `live` Self-hosted deployment with Docker and PostgreSQL
- `live` Lint, build, and typecheck quality gates
- `partial` End-to-end smoke testing, depending on prepared local environment

## Known Current Caveats

- Archie-related code currently contributes typecheck failures and should not be treated as production-stable without verification.
- Historical docs and brainstorm artifacts still exist in the repo, but are not canonical.
