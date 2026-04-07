# Data Model

## Primary Entities

- `Invoice`: outgoing billing document with lifecycle, preview/PDF, delivery, and payments
- `Transaction`: expense and accounting transaction record
- `Customer`: invoice customer and billing data
- `User` and `Setting`: business identity, locale, defaults, integration config
- `File`: uploaded document storage and attachment layer

## Practical Model Rules

- Invoices and expenses are separate user-facing concepts, even where accounting data overlaps underneath
- Invoice business workflows should remain invoice-centric, not generic transaction-centric
- Expense workflows should remain expense-centric, including statuses and document review
- Settings drive locale, defaults, and integrations and should be treated as configuration state, not presentation state

## Integration Model Notes

- Recommand/PEPPOL config lives in settings
- Invoice delivery metadata lives on invoices, including official delivery state, PEPPOL fallback exceptions, and courtesy-email audit fields
- Archie integration depends on settings plus webhook/manual sync flows

## Update Rule

If schema or workflow semantics change, update this file and the related ADR rather than leaving the repo to infer the new truth from implementation only.
