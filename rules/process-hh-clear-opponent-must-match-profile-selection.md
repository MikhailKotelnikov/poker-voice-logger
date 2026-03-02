# Title

HH Clear Opponent Must Match Profile Selection Predicate

## Problem

Opponent profile may include HH rows where `target_identity` is `unknown` but street tokens still contain the selected player identity. Clearing only by `target_identity = selected` leaves visible rows undeleted.

## Rule

When deleting HH hands for a selected opponent, then use the same matching predicate as profile selection (`target_identity` OR street-token identity match in `preflop/flop/turn/river`), because deletion semantics must match what the user can see in the profile.

## Examples

### Positive

- `DELETE FROM hh_notes WHERE target_identity = :id OR lower(preflop) LIKE :token OR ...`.
- After clear, rows previously visible in profile for that opponent are gone.

### Anti-pattern

- `DELETE FROM hh_notes WHERE target_identity = :id` only.
- Profile still shows hands for the same opponent right after “Стереть руки игрока”.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
