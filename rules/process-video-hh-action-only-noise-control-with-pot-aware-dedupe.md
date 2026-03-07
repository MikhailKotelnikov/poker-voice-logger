# Title

Video-HH Action-Only OCR Must Suppress Bottom Buttons And Dedupe By Pot-Stable Overlay

## Problem

OCR often reads persistent UI labels (`FOLD/CALL/RAISE`) from seat badges and bottom action buttons as if they were new gameplay events, which inflates event count and corrupts hand flow.

## Rule

When parsing action-only OCR lines in video-to-HH extraction, then suppress bottom action-button lines and apply stronger dedupe for pot-stable action overlays (per hand), because these tokens are frequently persistent UI artifacts rather than new actions.

## Examples

### Positive

- Ignore `RAISE` text near the bottom action panel, keep seat-level action badges, and dedupe repeated same actor/action while pot stays stable in the same hand.

### Anti-pattern

- Treat every sampled `FOLD/CALL/RAISE` token as a new event and only dedupe by short fixed time window.

## Validation Checklist

- [ ] Bottom action-button zone is filtered for action-only lines.
- [ ] Action-only dedupe uses stronger policy than inline actor-action lines.
- [ ] Pot-stable repeated overlays do not create new events in the same hand.
- [ ] Real-video smoke run shows reduced noise without zeroing all events.
