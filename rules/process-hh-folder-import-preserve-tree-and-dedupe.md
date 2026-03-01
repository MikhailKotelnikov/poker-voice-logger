# Title

HH Folder Import Must Preserve Tree and Dedupe by Hand Identity

## Problem

Manual/auto HH backfill from nested folders can repeatedly import the same hands and mix processed/new files, making imports non-repeatable and hard to operate.

## Rule

When importing HH from a folder recursively, then move processed files into a mirrored `imported` tree and deduplicate saves by hand identity (`room+hand_number+parser_version`, with fallback for missing room), because this keeps inbox clean and prevents duplicate notes.

## Examples

### Positive

- Input: `inbox/session1/a.txt` -> after import moved to `imported/session1/a.txt`.
- Re-import of same hand number does not create a new HH hand row (`inserted=false`).

### Anti-pattern

- Leave processed files in inbox so next run re-processes them.
- Deduplicate only by raw file hash and miss same hand with tiny text differences.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
