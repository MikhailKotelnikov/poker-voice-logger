# Clarify Gate: Iteration 7 (Pot/Stack Priority + Postfactum Turn Context)

## Goal

Reduce false action reads by prioritizing game-state evidence (pot growth, stack commitment, turn focus) over static OCR action labels.

## Input Contract

- Sampled OCR frames with text lines and coordinates.
- Available cues:
  - action labels (`RAISE/CALL/FOLD/...`),
  - pot value (`Pot...`),
  - turn focus lines (`<actor> is currently deciding`),
  - actor name anchors.

## Output Contract

- Keep `canonical_hand_v1` schema unchanged.
- Improve event inference semantics:
  - suppress stale pending-response actions when pot does not grow,
  - infer missing squeeze-response calls before flop transition,
  - normalize postflop first aggression (`bet` vs `raise`),
  - normalize all-in semantics (`call_allin` when facing prior aggression).

## Edge Cases

- Repeated static action badges may persist for multiple frames.
- First available frame can already be post-action (postfactum start point).
- Missing immediate action frame requires inferring the implied action from subsequent state.

## Compatibility

- No DB/API/UI schema changes.
- No changes to validator shape requirements.
- All changes contained in baseline extractor heuristics.

## Tests / Verification

- Add/adjust unit tests for stale pending preflop actions, squeeze-response inference, and postflop action normalization.
- Run full targeted tests + `npm run check`.
- Run smoke preview on same video and compare delta vs previous run.

## Done Criteria

- False `AbbyMartin raise @26000` removed.
- `ZootedCamel` preflop response is represented before flop transition.
- Flop `AbbyMartin` action is `bet`, not `raise`.
- Flop all-in facing bet is labeled `call_allin`.
