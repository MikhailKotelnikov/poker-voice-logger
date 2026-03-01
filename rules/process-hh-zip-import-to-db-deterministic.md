# Title

HH Zip Backfill To DB Must Use Deterministic Parser Pipeline

## Problem

Archive backfills can fail or become expensive if they depend on semantic API calls. For historical HH import, the system needs stable repeatable output and predictable runtime.

## Rule

When importing HH archives into SQLite for backfill, then split hands locally and run `parseHandHistory -> canonicalizeHandHistoryUnits -> enrichHandHistoryParsed -> saveHhParsedRecord` without semantic API, because deterministic conversion is sufficient for bulk ingestion and avoids network/model variability.

## Examples

### Positive

- Extract `21.02.zip`, parse all `.txt/.hh/.log` hands, store to `hh.db`, and finish run with `hh_import_runs` counters.
- Use a fixed `parserVersion` tag for the whole import run to keep dedupe behavior explicit.

### Anti-pattern

- Calling semantic LLM for each archived hand during backfill.
- Writing archive rows directly to notes table without recording `hh_import_runs`.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
