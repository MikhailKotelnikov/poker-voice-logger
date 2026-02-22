# Title

Postflop Sizing Tokens Must Never Round To `b0`/`r0`

## Problem

Very small positive percent-of-pot values can round to zero in token formatting and become `b0`/`r0`, which breaks bucketing and hides valid actions in profile sections.

## Rule

When formatting postflop percentage actions (`b`/`r`), then clamp positive values to a minimal non-zero token before serialization, because zero-sized bet tokens are invalid for sizing buckets and visual analytics.

## Examples

### Positive

- Raw `0.004%` -> tokenized as `0.01` minimum, not `0`.
- `b0` is absent from generated HH notes after conversion.

### Anti-pattern

- `formatNum(0.004)` -> `0` -> serialized as `b0`.
- Dropping valid tiny all-in sizing from analytics due zero token.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
