# Title

HH OneDrive Inbox Must Stage Into Local Import Before DB Conversion

## Problem

Direct HH import from cloud-synced OneDrive folders on macOS can fail with access/permission errors and unstable file-state during sync.

## Rule

When HH files arrive via OneDrive, then first move them from OneDrive `import` into local project `import`, and only after that run deterministic `hh:import` to DB and move processed files into local `imported`, because local staged I/O is stable and keeps the pipeline repeatable.

## Examples

### Positive

- Run one command that:
  1. moves all files/subfolders from `~/Library/CloudStorage/OneDrive-Personal/import` to `/Users/.../Documents/codex/import`,
  2. runs local HH conversion/import,
  3. writes processed files to `/Users/.../Documents/codex/imported`.

### Anti-pattern

- Point `hh:import` directly to OneDrive cloud folder and expect consistent behavior under Files On-Demand / permission restrictions.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
