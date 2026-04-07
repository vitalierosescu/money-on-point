# ADR-0003: Integration Status Must Be Explicit

## Decision

Integration docs must state whether a feature is `live`, `partial`, or `planned`.

## Reason

This prevents agents from treating in-progress code paths as production-stable behavior and avoids incorrect assumptions in future changes.
