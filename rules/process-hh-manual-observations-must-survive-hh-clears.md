# Title

HH Manual Observations Must Survive HH Clears

## Problem

Manual annotations (street presuppositions and action timings) can be lost if they are stored inside transient HH hand rows that are routinely deleted/reimported.

## Rule

When implementing manual per-hand observations for HH data, then persist them in separate tables keyed by `target_identity + room + hand_number` (plus street/action scope) and re-join them at read time, because HH hand rows may be cleared and rebuilt while user annotations must remain intact.

## Examples

### Positive

- Store street/hand presuppositions in `hh_manual_presupp` and action timings in `hh_manual_action_timing`, and join them in `getHhProfileRows` by `target_identity + room + hand_number`.
- Keep `clearHhHandsByOpponent` and `clearAllHhHands` limited to HH structural tables (`hh_notes`, `hh_hands`, etc.), leaving manual observation tables untouched.

### Anti-pattern

- Save manual observations only inside `hh_notes` rows tied to `hand_id`; after clearing HH hands, all manual notes disappear.
- Couple manual observation lifecycle to HH import run deletion, forcing users to re-enter notes after every rebuild.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
