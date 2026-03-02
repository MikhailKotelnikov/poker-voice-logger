# Title

HH Target Identity Must Strip Position Prefix Tokens

## Problem

Manual HH edits can be saved under a wrong identity key when the selected opponent is passed as an actor token like `HJ_name` instead of bare `name`, so values appear saved in-session but disappear after reload.

## Rule

When resolving `target_identity` from user/opponent input, then treat `POSITION_identity` tokens as actor labels and persist only the identity suffix, because HH storage keys are identity-based and must not depend on seat prefixes.

## Examples

### Positive

- `extractTargetIdentity('HJ_GREXOMETR') -> 'grexometr'`.
- Saving manual `turn` presupp by `opponent='HJ_GREXOMETR'` is visible in profile for `opponent='grexometr'`.

### Anti-pattern

- Persisting manual data under `hjgrexometr` while profile rows are loaded under `grexometr`.
- Manual field appears updated in the current tooltip but is empty after reopening the hand.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
