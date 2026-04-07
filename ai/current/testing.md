# Testing

## Required Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`

## E2E

- `E2E_SMOKE_ENABLED=1 npm run test:e2e`
- Smoke tests require a runnable local instance and prepared environment

## Manual QA Priority Paths

- Dashboard
- Invoices
- Expenses
- Customers
- Files
- Reports
- Settings
- Backups

## Known Current Caveat

`npm run typecheck` is not currently clean. As of the latest known state, Archie-related files and `app/(app)/apps/invoices/manifest.ts` are contributing failures. Do not claim a fully clean typecheck without rerunning and verifying.
