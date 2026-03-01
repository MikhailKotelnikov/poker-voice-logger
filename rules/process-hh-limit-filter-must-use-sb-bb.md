# Title

HH Limit Filter Must Match On Numeric SB/BB, Not Raw Header Text

## Problem

Limit labels in HH headers can vary by currency symbol, locale formatting, and converter output, so text matching on `limit_text` is unstable.

## Rule

When filtering HH profiles by table limit, then match on numeric `sb` + `bb` pairs stored in DB (for example `2-4`, `2.5-5`, `10-20`) instead of string matching on `limit_text`, because numeric blind values are canonical across room/header formatting variants.

## Examples

### Positive

- UI sends `limits=10-20,25-50`.
- API normalizes allowed values and DB query applies `(sb, bb)` predicates.
- Same limit is matched even if header text differs (`¥10/¥20 CNY`, `$10/$20`, converter-specific text).

### Anti-pattern

- Filter uses `WHERE lower(limit_text) LIKE '%10/20%'`, which breaks on alternate symbols, separators, or localized number formats.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
