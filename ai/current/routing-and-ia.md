# Routing And IA

## Authenticated App Areas

Primary sections:
- Dashboard
- Invoices
- Expenses
- Unsorted
- Customers
- Files
- Reports
- Settings

## IA Rules

- Keep the current sidebar route structure unless there is a strong product reason to change it
- Favor consistency in page headers, section labels, card patterns, and filtering controls
- New features should fit into the existing authenticated app structure before creating new top-level areas

## Route Conventions

- Use `app/(app)/...` for authenticated product surfaces
- Keep feature-specific actions close to their route when appropriate
- Use shared UI wrappers like `PageShell`, `PageHeader`, and `Section` for layout consistency
