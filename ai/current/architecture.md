# Architecture

## App Structure

- `app/`: Next.js routes and server actions
- `components/ui/`: reusable primitives and layout components
- `components/<feature>/`: feature-level UI and interaction components
- `lib/`: integration helpers, formatting, shared utilities, cross-cutting logic
- `models/`: database-facing data access and query functions
- `forms/`: validation schemas and form-related shared definitions
- `prisma/`: schema and migrations

## Separation Rules

- Business logic belongs in `models/`, `lib/`, and server actions
- Presentation logic belongs in `components/ui/` and `components/<feature>/`
- Pages should mostly compose data fetching and shared components

## UI Composition Rules

- `components/ui` is the only place for reusable primitives
- Feature folders can compose primitives, but should not fork them without a clear reason
- Styling should reference semantic tokens and shared variants first

## Styling Rules

- Tailwind only
- Shared tokens in `app/globals.css`
- Tailwind token mapping in `tailwind.config.ts`
- CVA for shared component variants where it improves reuse

## Future Agent Rule

When in doubt, check `ai/current/design-system.md` before changing UI structure or styling. If a new reusable pattern is introduced, update that file and the corresponding primitive source.
