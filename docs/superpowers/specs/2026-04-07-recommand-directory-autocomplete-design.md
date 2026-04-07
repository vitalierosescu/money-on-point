# Recommand directory autocomplete in Customer Picker

**Date:** 2026-04-07
**Status:** Approved, in implementation

## Goal

When creating a new customer in the invoice flow, let the user search the Peppol directory by company name or VAT/enterprise number. Pick a hit and we prefill the form, verify Peppol document support, and persist a "verified" flag.

Inspired by Cashfeed's flow: type → list of matches → click → prefilled & verified, with manual entry always available as a fallback.

## Endpoints used (Recommand)

- `GET /recipients/search-directory` — fuzzy search by name/country
- `GET /recipients/verify` — exact lookup by enterprise/VAT number, returns canonical company data
- `GET /recipients/verify-document-support` — checks whether the recipient can receive invoices over Peppol

## Architecture

### 1. Recommand client (`lib/recommand-companies.ts`)

Add three functions reusing the existing `recommandRequest` helper:

- `searchRecommandDirectory(settings, { query, country, limit })`
- `verifyRecommandRecipient(settings, { enterpriseNumber, country })`
- `verifyRecommandDocumentSupport(settings, { enterpriseNumber, country, documentType })`

Add types: `RecommandDirectoryHit`, `RecommandRecipientVerification`, `RecommandDocumentSupport`.

### 2. Server actions (`app/(app)/customers/actions.ts`)

- `searchRecommandDirectoryAction({ query, country })` — auth checked, min 3 chars, returns `{ success, data: hits[], error }`.
- `verifyRecommandRecipientAction({ enterpriseNumber, country })` — used both for VAT fast-path and "click to confirm". Eagerly chains `verify-document-support` and returns `{ recipient, peppolReachable }`.

Both follow the existing action shape used by `createCustomerAction`.

### 3. UI (`components/customers/customer-picker.tsx`)

In the **New Customer** tab, insert a `<DirectorySearch>` block above the manual form.

Behavior:
- Single search input bound to the same `name` field. Detect VAT shape via regex `^[A-Z]{2}?\s*\d[\d\s.]{8,}$` → route to `verifyRecommandRecipientAction` directly. Otherwise debounce 300ms, min 3 chars, call `searchRecommandDirectoryAction`.
- Show suggestion rows: avatar circle, name, VAT, address. Loading = skeleton 3 rows.
- Click row → call verify + document-support eagerly → prefill all manual fields → focus email input.
- Peppol badge: green "Peppol invoice ready" or amber "Found, not Peppol-reachable".
- "Handmatig aanmaken" / "Create manually" button always present below the suggestion list.
- AbortController on every new query; ignore stale responses.
- Country select drives `country` param; switching country re-runs search.
- Local duplicate guard: if a hit's VAT matches an existing customer in the picker list, switch to Existing tab and select that customer.

### 4. Persistence

Add nullable columns to `Customer`:
- `peppolVerified` (Boolean?)
- `peppolVerifiedAt` (DateTime?)
- `recommandDirectorySource` (String? — `"directory"` | `"manual"`)

Migration adds the columns. No backfill.

`createCustomerAction` accepts the new fields when present.

## Bulletproofing

- Recommand creds missing → action returns error → UI hides search row, manual form stays. No broken state.
- Network/5xx → caught, inline non-blocking banner above manual form.
- 429 → backoff message; client debounce already prevents most.
- Stale responses → AbortController, query-string match guard.
- Click race → row spinner, disabled while verify in flight.
- VAT normalization → strip spaces/dots, uppercase country prefix. New helper `normalizeVatNumber`.

## Out of scope

- Bulk re-verification of existing customers.
- Re-search button in the edit panel (only badge display).
- Country detection beyond what's already in the picker.

## Files touched

1. `lib/recommand-companies.ts` — 3 functions + types
2. `app/(app)/customers/actions.ts` — 2 server actions, extend `createCustomerAction`
3. `prisma/schema.prisma` + migration — 3 columns
4. `components/customers/customer-picker.tsx` — `<DirectorySearch>` subcomponent
5. `components/customers/customer-edit-panel.tsx` — read-only Peppol verified badge
