# Product

## Summary

TaxHacker is a self-hosted accounting app used primarily as a focused solo-freelancer tool. The current working scope is the authenticated app: dashboard, invoices, expenses, customers, files, reports, settings, backups, and integrations.

## Primary User

Vitalie, a Belgian solo freelancer. The product is optimized for speed, repeat use, and clarity rather than onboarding-heavy discoverability.

## Core Product Rules

- Preserve accounting behavior unless there is a strong consistency or usability reason to change it.
- Keep business logic separate from presentation components.
- Reuse UI primitives before creating page-specific variants.
- Treat invoices and expenses as first-class app sections.
- Keep the authenticated app as the design priority over landing or marketing pages.

## Current Product Boundaries

- Light mode only.
- PEPPOL support is outbound only.
- Files, invoices, expenses, customers, reports, and settings are all active app areas.
- Archie integration exists in the codebase but should be treated as in-progress until typecheck is clean and the workflow is verified end to end.
