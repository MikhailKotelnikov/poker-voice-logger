# Title

HH DB Must Auto-Migrate Legacy Schema Before Profile/Import Queries

## Problem

After adding new HH metadata fields, existing local databases created by older builds can miss required columns and break profile fetch/import with SQL errors.

## Rule

When opening HH SQLite, then run idempotent schema migrations (column existence checks + `ALTER TABLE` + required indexes) before any read/write queries, because runtime compatibility with legacy DB files must survive app updates.

## Examples

### Positive

- On startup, app opens `hh.db`, detects missing `game_card_count/limit_text/active_players_count/final_pot_bb`, adds them, and profile endpoint works without manual DB recreation.

### Anti-pattern

- App assumes `CREATE TABLE IF NOT EXISTS` is enough and immediately runs queries referencing new columns, causing endpoint failures on old DBs.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
