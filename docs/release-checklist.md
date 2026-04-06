# Release Checklist

Use this checklist before tagging a TaxHacker release.

## Accounting sanity

- Verify one draft invoice can be edited, saved, marked as sent, emailed, partially paid, and fully paid.
- Verify invoice PDF output shows the correct issuer name, address, bank details, dates, invoice number, VAT totals, and customer data.
- Verify one expense can be edited, reclassified, marked to-pay, marked paid, duplicated, and opened from the file library.
- Verify the VAT report for a Belgian sample dataset matches expected quarterly subtotal, collected VAT, paid VAT, and payable VAT.

## Exports and backups

- Export invoices for the current year and inspect columns for invoice number, dates, customer VAT, subtotal, VAT total, and total.
- Export expenses for the current year and inspect columns for merchant, category, status, due date, tax amount, and notes.
- Download a full backup archive and confirm it contains JSON datasets plus uploaded files.
- Restore the backup into a disposable environment and verify invoices, expenses, files, and settings round-trip correctly.

## Release gates

- Confirm Node matches `.nvmrc`.
- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `npm run test:e2e` with `E2E_SMOKE_ENABLED=1` against a runnable local instance when preparing a production release.
