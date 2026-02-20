# Title

Visual Profile MW Grouping Must Use Actor Count

## Problem

HH-derived notes often do not contain explicit `3w/mw` markers, so marker-only detection misclassifies multiway flop/probe spots as HU.

## Rule

When assigning `HU` vs `MW` groups for Flop Bets and Probes, then compute multiway from the count of unique actor tokens (`POS_<id|nick>`) on that street and use markers only as fallback, because actor count is the reliable source in deterministic HH rows.

## Examples

### Positive

- `BB_v0 x / UTG_v1 x / CO_hero cb70 / BTN_v3 c` → `MW`.
- `BB_hero cb75 / SB_v1 f` → `HU`.

### Anti-pattern

- Relying only on `3w/mw` text tokens.
- Treating all HH rows as HU when marker is absent.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
