# Title

Video-HH Runs Must Produce Event-To-Frame Preview For Human Verification

## Problem

JSON-only artifacts are hard for operators to validate manually; extraction quality issues are missed because users cannot quickly connect events to actual video frames.

## Rule

When generating a video-HH lab run for manual QA, then produce a run-local preview (`preview/index.html` plus event timestamp frames), because visual verification requires direct mapping from extracted events to source frames.

## Examples

### Positive

- Run with preview enabled and review a single HTML file showing actor/action rows with linked thumbnails.

### Anti-pattern

- Ask user to validate extraction quality from raw `events.json` without any frame-level visualization.

## Validation Checklist

- [ ] Preview HTML is generated inside the run directory.
- [ ] Frame images are exported for event timestamps.
- [ ] Preview contains event fields and OCR evidence text.
- [ ] Manual QA can be done without custom scripts.
