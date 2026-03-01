# Title

Tooltip Samples Must Preserve HH Meta

## Problem

Profile tooltips lose context when sample payload includes hand metadata but parser drops it, making it hard to audit filters and source rows.

## Rule

When parsing profile samples, then preserve and render optional HH metadata (hand number, date, game, room, limit, active players, final pot), because sample details must be traceable to the original hand context.

## Examples

### Positive

- Tooltip header shows `#123456 • 2026-02-10 • PLO5 • 6 players • 74.3bb • cpr`.

### Anti-pattern

- Tooltip shows only street actions even though metadata was available in the sample payload.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
