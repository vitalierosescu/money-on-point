# Release

## Release Gates

- Confirm Node version matches `.nvmrc`
- Run `npm run typecheck`
- Run `npm run lint`
- Run `npm run build`
- Run `E2E_SMOKE_ENABLED=1 npm run test:e2e` against a working local instance when preparing a production release

## Accounting Sanity Checks

- Verify draft invoice edit, send/email, partial payment, and full payment flow
- Verify invoice PDF issuer and customer data rendering
- Verify expense edit, reclassify, duplicate, status changes, and file access
- Verify VAT report calculations against a known sample dataset

## Backup And Export Checks

- Export invoices and inspect CSV columns
- Export expenses and inspect CSV columns
- Download a full backup archive
- Restore into a disposable environment and verify round-trip data integrity
