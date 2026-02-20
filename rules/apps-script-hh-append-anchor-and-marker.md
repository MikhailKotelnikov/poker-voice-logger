# Title

HH Append Anchor and Marker

## Problem

HH rows can appear far below visible notes when insertion uses raw `getLastRow`, and blank nickname rows are hard to distinguish from broken writes.

## Rule

When appending HH rows to Sheets, then insert after the last non-empty note row (A..presupposition columns) and set `nickname` marker to `HH`, because date-only tails and sparse rows should not create large visual gaps.

## Examples

### Positive

- HH write after row 32 appears on row 33 even if later rows contain only date artifacts.
- Nickname column contains `HH` for every HH-generated entry.

### Anti-pattern

- Using `getLastRow()` directly for HH append target when non-note data exists below.
- Writing HH rows with empty nickname marker.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
