# Title

Opponent Suggestions Must Include HH DB Without Sheets Dependency

## Problem

Autocomplete for opponent input breaks in DB-first mode when Sheets webhook is unavailable, because suggestions are sourced only from Google Sheets.

## Rule

When serving opponent suggestions, then merge results from HH SQLite (players/target identities) and Sheets (if available), because suggestion UX must work in DB-only operation and remain backward-compatible with voice Sheets data.

## Examples

### Positive

- With `SHEETS_WEBHOOK_URL` unset, typing still returns IDs/nicknames from HH DB.
- With both sources available, deduplicated combined suggestions are returned.

### Anti-pattern

- Endpoint returns an empty list unless Sheets webhook is configured, even though DB has many opponents.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
