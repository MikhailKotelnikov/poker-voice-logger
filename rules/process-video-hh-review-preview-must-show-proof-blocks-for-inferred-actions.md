# Video-HH Review Preview Must Show Proof Blocks For Inferred Actions

## Problem

Если review preview показывает только список действий без доказательства inferred шагов, человек вынужден угадывать логику восстановления по строкам и не может надежно проверить, что inference действительно следует из банка, очереди хода и anchor window.

## Rule

When rendering review preview for reconstructed video hand histories, show a proof block for every inferred action with pot-before, pot-after, pending responders, locked past actions, chosen resolution, validator checks, and anchor references, because human review must verify the inference mathematically rather than guess from timeline rows.

## Positive Example

### Example: inferred call is reviewable without re-reading the whole hand

When an inferred `call` appears in the action list, the preview also shows `anchorFrom`, `anchorTo`, `pot_before`, `pot_after`, the missing responder set, and the validator result. The reviewer can confirm the action directly from the proof block and three-frame context.

## Anti-Pattern Example

### Example: inferred row appears as plain text in the event list

When the preview shows `#8 ZootedCamel call` but hides the pot delta, hidden responders, and anchor frames that justify it, the system forces manual guesswork and the review becomes unreliable.

## Validation Checklist

1. Every inferred action has a visible proof block in review preview.
2. The proof block includes both anchor references and pot transition.
3. Locked past actions are shown so the reviewer sees what was already settled.
4. Validator results are visible next to the inferred resolution.
