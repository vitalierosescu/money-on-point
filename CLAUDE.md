# TaxHacker

## Design Context

### Users
Solo freelancer — Vitalie, a Belgian Webflow developer. Uses TaxHacker daily to create invoices and track expenses for his own business. Speed and clarity over discoverability.

### Brand Personality
**Sharp, clean, confident.** Calm competence. The UI never competes with the data.

### Aesthetic Direction
**Reference: Linear / Vercel** — developer-grade tool aesthetics.
- Monochromatic base (charcoal, white, true grays)
- Borders over shadows for structure
- Monospace for IDs, amounts, invoice numbers (`font-mono tabular-nums`)
- Tight but breathable density
- Status indicators: small and precise, never loud
- **Light mode only** — dark mode has been removed

**Anti-patterns:** No gradients, no colorful cards, no decorative illustrations, no pastel SaaS look.

### Design Principles
1. **Data first.** Numbers, statuses, dates — immediately readable.
2. **Borders, not shadows.** Use `border` for separation. Shadows only for genuine elevation (modals, dropdowns).
3. **Mono for data, sans for everything else.** Invoice numbers, amounts, tabular dates → `font-mono`.
4. **Consistent density.** Row height, padding, and gaps are predictable and reused — never eyeballed.
5. **Status is never decorative.** Small, precise, minimal color. Paid = green dot, not a celebration.

### Status Color Convention
- Paid: `text-emerald-700 bg-emerald-50`
- Overdue: `text-red-600 bg-red-50`
- Sent/Pending: `text-blue-700 bg-blue-50`
- Draft: `text-muted-foreground bg-muted`
- Cancelled: strikethrough + `opacity-40`

### Spacing Conventions
- Section gap: `mb-8`
- Card padding: `p-5`
- Table cell: `px-3 py-3`
- Table header: `text-xs font-medium text-muted-foreground uppercase tracking-wide`
- Form field gap: `space-y-4`

### Table Pattern
```
rounded-lg border overflow-hidden
thead: bg-muted/20 border-b
tbody: divide-y
row: hover:bg-muted/30 transition-colors
```

Full design context in [.impeccable.md](.impeccable.md).

## Claude Working Files

All plans, specs, and reviews live in `.claude/`:
- `.claude/plans/` — implementation plans
- `.claude/specs/` — design specs
- `.claude/reviews/` — feature audits and review outputs
