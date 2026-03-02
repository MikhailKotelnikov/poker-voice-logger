# Title

HH Manual Join Must Use Selected Target Identity

## Problem

In mixed/legacy HH notes, `hh_notes.target_identity` can be `unknown`, while manual presuppositions/timings are saved under the selected opponent identity. Joining manual data through `n.target_identity` hides existing manual notes.

## Rule

When reading HH rows with manual presuppositions/timings for a selected opponent, then join manual tables by the selected target identity plus `room + hand_number` (not by `hh_notes.target_identity`), because note identity may be stale/unknown while manual observations are keyed by the active target.

## Examples

### Positive

- `LEFT JOIN hh_manual_presupp m ON m.target_identity = :selectedTarget AND m.room = h.room AND m.hand_number = h.hand_number`.
- Manual note remains visible even if `hh_notes.target_identity = 'unknown'`.

### Anti-pattern

- `LEFT JOIN hh_manual_presupp m ON m.target_identity = n.target_identity ...`.
- Manual note exists in DB but UI shows empty fields after reload.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
