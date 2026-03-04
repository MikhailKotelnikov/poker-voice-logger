# Title

HH Full Clear For Fresh Baseline Must Reset SQLite Sequences

## Problem

After full HH cleanup with plain `DELETE`, UI row labels (`#DB:<id>`) keep growing because `AUTOINCREMENT` state in `sqlite_sequence` is preserved, which looks like cleanup did not happen.

## Rule

When running full HH clear as a fresh baseline reset, then clear structural HH tables and reset `sqlite_sequence` for those tables in the same transaction, because users expect post-clear imports to restart visible DB row ids from 1.

## Examples

### Positive

- `clearAllHhHands(..., { resetSequences: true })` clears `hh_notes/hh_hands/...` and deletes sequence rows for HH structural tables.
- Next imported hand appears as `#DB:1` in UI after full clear.

### Anti-pattern

- Full clear endpoint runs only `DELETE FROM hh_notes/hh_hands/...` without touching `sqlite_sequence`.
- User imports 80k fresh hands and sees `#DB:177713`, assuming cleanup failed.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
