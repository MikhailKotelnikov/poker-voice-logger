# Title

Sheets Append Retry Needs Idempotency Check

## Problem

Network failures during append requests can be ambiguous: the row may be inserted in Sheets even when the client receives `fetch failed`, so blind retries can create duplicates.

## Rule

When retrying failed append requests to Apps Script, then confirm whether the row was already inserted (or use an idempotency marker) before replaying the append, because append endpoints are not inherently idempotent.

## Examples

### Positive

- After `fetch failed`, verify sheet state for that payload or a unique marker, and only append if it is missing.

### Anti-pattern

- Treating every transport error as “not inserted” and re-appending the same payload immediately.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
