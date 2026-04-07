# AI Knowledge Base

This directory contains both runtime AI code and canonical AI-readable project documentation.

Documentation lives under `ai/current/`, `ai/decisions/`, and `ai/work/`.

Runtime application code remains in files like `ai/prompt.ts`, `ai/schema.ts`, and `ai/providers/*`.

Read in this order:
1. `ai/index.json`
2. `ai/current/product.md`
3. `ai/current/design-system.md`
4. `ai/current/architecture.md`
5. Any relevant file under `ai/current/`

Rules:
- `ai/current/` is canonical.
- `ai/work/` is supporting context for active implementation and recent reviews.
- Top-level `ai/*.ts` files are application code, not project guidance docs.
- Root entrypoints (`CLAUDE.md`, `AGENTS.md`) should stay short and only point here.
- Do not use `.impeccable.md`, `.superpowers/`, or old `.claude/` planning docs as source of truth unless explicitly asked for historical context.
