# Design System

## Source Of Truth

- Tokens: `app/globals.css`
- Tailwind mapping: `tailwind.config.ts`
- Shared primitives: `components/ui/*`

## Visual Direction

The authenticated app currently follows a Recommand-influenced system:
- warm off-white page background
- dark forest-green primary actions
- restrained warm neutrals
- Rethink Sans for primary typography
- light mode only

## Core Rules

- Reuse shared UI primitives from `components/ui` before creating local variants.
- Cards are white surfaces with rounded corners by default.
- Borders are structural, not decorative.
- Shadows are minimal. Buttons keep a subtle shadow; most other surfaces do not.
- Muted text must remain readable. Prefer semantic tokens over hard-coded grays.

## Tokens

- Colors, spacing, typography, radii, and shadows must come from `app/globals.css`.
- Tailwind aliases must map back to those CSS variables in `tailwind.config.ts`.
- Do not scatter magic values across pages.

## State Colors

- Semantic meanings are shared app-wide:
  - green = completed / good
  - amber = caution / still needs action
  - red = problem / overdue / failed
  - blue = informational / verified / secondary process state
  - gray = neutral / inactive / unsent / draft
- Invoice payment states are the primary visual state language:
  - `Draft` = light neutral gray
  - `Unpaid` = stronger neutral gray, clearly distinct from `Draft`
  - `Partially paid` = amber
  - `Overdue` = red
  - `Paid` = green
  - `Cancelled` = gray with strikethrough
- Invoice delivery states are secondary to payment and must use lighter emphasis:
  - `Not sent` = muted gray
  - `Ready` = subtle amber if shown
  - `Verified` = muted blue
  - `Sent` = green
  - `Failed` = red
- Timing cues are not standalone invoice states:
  - `Due soon` means within 7 days of the deadline and appears only in due-date text/cues, not as a badge
- Summary cards stay restrained:
  - lightly tint labels/values only
  - badges remain the strongest color signal
- Environment chips remain separate from invoice state semantics:
  - `Prod` = green
  - `Playground` = amber

## Typography

- Primary family: Rethink Sans
- Headings use `font-heading` and tighter tracking
- Body copy should stay readable and not oversized in form controls
- Monospace stays reserved for amounts, invoice numbers, IDs, and tabular data

## Component Rules

- Buttons: use shared variants in `components/ui/button.tsx`
- Inputs/selects/textarea: use shared form primitives; keep control text around `text-base`
- Cards/stat cards: use white card surfaces with rounded corners
- Tables: use shared table primitives; avoid one-off wrappers unless necessary
- Section labels: use the shared small uppercase label pattern

## Select / Dropdown Pattern

All lookup-type selects (category, project, currency, transaction type, and any field with labelled options) use **`LookupSelect`** from `components/forms/lookup-select.tsx`. Do NOT use `NativeSelect` or `FormSelect` for these.

Rules:
- When a value is selected, the trigger renders as a coloured pill (no outer input box)
- The chevron lives inside the pill, right-aligned with extra right padding
- Search is auto-shown only when the option list has more than 5 items
- `getLookupPillStyle(color?)` drives pill colour; colourless items get the secondary neutral pill
- Wrapper components (`FormSelectCategory`, `FormSelectProject`, `FormSelectCurrency`, `FormSelectType`) already use `LookupSelect` — prefer those over calling `LookupSelect` directly
- Binary/config selects (enabled/disabled toggles, Peppol settings, field-type selectors) may stay as `NativeSelect`

## Interaction Rules

- Favor `transition-colors`
- Use border-color changes for hover where appropriate
- Avoid decorative motion, parallax, and gratuitous animation

## What To Avoid

- Do not reintroduce the older Linear/Vercel monochrome spec as source of truth
- Do not create page-specific ad hoc button/input/card variants when a shared primitive can be extended
- Do not add a second styling system
