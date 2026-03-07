# Title

Video-HH Stale Preflop Response Must Lock Actor Focus And Mark Pending

## Problem

When a preflop response overlay persists without pot growth, the pipeline can wrongly commit the action and shift focus to the next actor, creating false chronology.

## Rule

When a preflop `call/raise/allin` appears with unchanged pot versus the previous frame-group, then lock focus on the action actor and mark the row as `pending` (not committed), because this state is still unresolved until a transition anchor confirms the response.

## Examples

### Positive

- Frame shows `CALL` near `ZootedCamel`, pot unchanged, next actor becomes active: preview keeps `focus=ZootedCamel`, `state=pending`, reason includes `pending_preflop_response_without_pot_growth`.

### Anti-pattern

- Same frame is marked `committed` and focus is reassigned to next-frame actor (`ilsy`) before response confirmation.

## Validation Checklist

- [ ] Stale preflop response rows are not displayed as committed.
- [ ] Focus is locked to the response actor for stale preflop rows.
- [ ] Reason code explicitly indicates pending-without-pot-growth state.
- [ ] Transition to next actor does not overwrite stale-row focus.
