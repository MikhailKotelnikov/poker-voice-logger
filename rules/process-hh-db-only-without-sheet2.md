# Title

HH Pipeline Must Be DB-Only (No Sheet2 Coupling)

## Problem

When HH ingestion and visualization are coupled to Google Sheet2, profile counts drift after DB migration and production setup becomes fragile (webhook dependency for HH flows that should be local).

## Rule

When HH storage is migrated to SQLite, then HH write/read paths must use DB only (ingest, batch import, profile source `hh`) and must not require Sheet2/webhook, because mixed persistence introduces inconsistency and operational failures.

## Examples

### Positive

- `/api/record-hand-history*` writes HH rows to SQLite only.
- `/api/opponent-visual-profile?source=hh` reads from SQLite only.
- Voice (`source=voice`) still reads from Sheet1.

### Anti-pattern

- HH endpoints fail if `SHEETS_WEBHOOK_URL` is missing.
- HH profile reads part of rows from DB and part from Sheet2.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
