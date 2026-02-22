# Title

Propagate Target `Lx` Tags To Earlier Streets In HH Notes

## Problem

When target folds on turn/river without showdown, only the fold event was tagged (`Lt`/`Lr`), while earlier flop/turn target actions stayed untagged and later appeared as white unknown in miss buckets.

## Rule

When target has no showdown cards and eventually folds on flop/turn/river, then append the same terminal `Lx` tag to target postflop actions on all earlier streets up to that fold street, because visual profile strength for miss lines is derived street-by-street and needs the fold-out signal present before terminal street.

## Examples

### Positive

- River fold line -> target flop and turn actions include `Lr`, river fold includes `Lr`.
- Turn fold line -> target flop and turn actions include `Lt`.
- Same-street flop check-fold -> both target `x` and `f` fragments on flop include `Lf`.

### Anti-pattern

- Adding `Lr` only to river fold token and leaving flop/turn target actions untagged.
- Requiring prior target aggression before applying `Lx` propagation.
- Propagating `Lx` when target has showdown cards in the same hand.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
