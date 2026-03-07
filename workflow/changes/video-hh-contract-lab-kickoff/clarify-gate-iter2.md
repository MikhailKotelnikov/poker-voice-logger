# Clarify Gate: Iteration 2 (Extractor Noise Reduction)

## Goal

Reduce false-positive events from action-only OCR lines and improve hand/street structure quality without changing `canonical_hand_v1` schema.

## Input Contract

- Input remains sampled OCR frames from `videoOcrPython`/`videoOcrAvFoundation`.
- Each frame can contain noisy lines (`FOLD/CALL/RAISE`) from persistent UI badges and bottom action buttons.
- `buildCanonicalRunFromOcrFrames` receives lines with optional coordinates/confidence.

## Output Contract

- Keep the same canonical payload format and field names.
- Improve event selection/segmentation heuristics:
  - ignore bottom action buttons,
  - stronger dedupe for persistent action-only overlays,
  - split hands on strong pot reset even without long time gap,
  - infer `flop` from preflop action flow when explicit board/street hint is absent.

## Edge Cases

- Bottom button text can look like valid action (`RAISE`) but is not an event.
- Same action badge can persist for many sampled frames in one hand.
- Pot OCR may fluctuate; split only on large reset, not minor jitter.
- Street inference must stay conservative (only preflop -> flop when action flow supports it).

## Compatibility

- No DB/API/UI behavior changes.
- No change to validator requirements.
- Existing CLI flow and artifacts remain unchanged.

## Tests

- Added failing tests first in `tests/videoBaselineExtractor.test.js`:
  - bottom action button suppression,
  - persistent overlay dedupe,
  - pot-reset hand split,
  - conservative flop inference.

## Done Criteria

- New tests pass.
- Existing video extractor tests pass.
- Smoke run on provided MP4 keeps non-zero events and lower raw noise ratio.
