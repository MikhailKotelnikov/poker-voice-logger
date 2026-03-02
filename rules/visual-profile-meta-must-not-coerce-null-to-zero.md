# Title

Visual Profile Meta Must Not Coerce Null To Zero

## Problem

Metadata fields in HH rows can be `null` (for legacy or partial imports). Coercing with `Number(value)` turns `null` into `0`, which produced invalid UI values like `PLO0` and `0-0` limits.

## Rule

When building visual-profile metadata from optional numeric fields, then convert values with explicit null/empty guards before numeric coercion, because `Number(null)` and `Number('')` are finite zeros and corrupt game/limit labels.

## Examples

### Positive

- Use helper: `if (value === null || value === undefined || value === '') return null;` before `Number(value)`.
- Build `game` as `PLO${gameCardCount}` only when `gameCardCount` is truly numeric; otherwise fallback to `gameType`.
- Build `limit` from SB/BB only when both are valid numbers; otherwise fallback to parsed `limitText`.

### Anti-pattern

- `const gameCards = Number(row.gameCardCount)` and then `Number.isFinite(gameCards)`.
- Rendering `PLO0`/`0-0` from missing metadata.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
