# Title

HH Storage Mode Must Separate Write Targets and Profile Read Source

## Problem

When migrating HH data from Sheet2 to SQLite, mixed read/write paths can cause double-counting, missing profile rows, or failed API calls in modes where Sheets is intentionally disabled for HH.

## Rule

When `HH_STORAGE` is introduced (`sheets|db|dual`), then write HH records according to mode (`sheets`->Sheets, `db`->SQLite, `dual`->both) and read HH profile rows from a single authoritative source (SQLite in `db/dual`, Sheet2 only in `sheets`), because migration needs deterministic counts without duplicates.

## Examples

### Positive

- `HH_STORAGE=db`: `/api/record-hand-history*` writes only SQLite; profile (`source=hh/all`) reads HH only from SQLite.
- `HH_STORAGE=dual`: writes both SQLite and Sheet2; profile reads HH from SQLite to avoid doubled rows.
- `source=voice`: still reads voice rows from Sheet1 via Sheets API regardless of HH storage mode.

### Anti-pattern

- In `dual` mode, reading HH profile rows from both SQLite and Sheet2 simultaneously.
- In `db` mode, requiring `SHEETS_WEBHOOK_URL` for HH-only endpoints.
- Coupling voice profile reads to HH storage mode.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
