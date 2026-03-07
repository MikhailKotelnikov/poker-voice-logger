# Clarify Gate: Iteration 3 (Run Preview UX)

## Goal

Make run verification visual for operator: after `video:lab`, provide frame-level preview that maps extracted events to actual video frames.

## Input Contract

- Existing run artifacts in `reports/video-hh-lab/<run-id>/`:
  - `manifest.json`
  - `events.json`
- Source video path is taken from `manifest.video.path`.

## Output Contract

- Keep canonical extractor contract unchanged.
- Add optional preview artifacts:
  - `preview/frames/*.jpg` (event timestamp snapshots),
  - `preview/index.html` (event table with thumbnail links),
  - `preview/preview.json` (generated metadata).

## Edge Cases

- Missing/invalid video path in manifest -> preview generation error with explicit message.
- No events -> generate HTML with explanatory state, no crash.
- Partial frame decode failures -> keep successful frames and report warnings.

## Compatibility

- No DB/API schema changes.
- No `canonical_hand_v1` changes.
- Existing `video:lab` behavior remains default-compatible; preview is opt-in.

## Tests / Verification

- `npm run check` includes new scripts/modules syntax checks.
- Smoke run with `--preview` produces `preview/index.html` and at least one frame on sample video.

## Done Criteria

- User can open one HTML file and visually verify extraction results.
- Generated preview artifacts live inside run directory.
