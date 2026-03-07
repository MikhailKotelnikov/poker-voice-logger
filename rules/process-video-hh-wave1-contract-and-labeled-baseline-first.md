# Title

Video-HH Wave 1 Must Freeze Contract And Labeled Baseline Before Extractor Logic

## Problem

Starting video-to-HH implementation directly from extractor heuristics causes shifting data shapes, weak regressions, and hard-to-debug quality drops between iterations.

## Rule

When starting Wave 1 of video-to-HH development, then freeze a minimal canonical event contract and prepare a labeled baseline recording before implementing extractor logic, because stable input/output definitions make accuracy changes measurable and isolate failures by stage.

## Examples

### Positive

- Define `canonical_hand_v1`, create labels for first test recording, add validator tests, then implement extractor to match that contract.

### Anti-pattern

- Build OCR/extractor first, change output JSON ad hoc each day, and only later try to compare runs or add labels.

## Validation Checklist

- [ ] Minimal canonical contract version is documented.
- [ ] At least one labeled baseline recording exists before extractor coding.
- [ ] Validator checks run against extractor output.
- [ ] Iteration-to-iteration comparison is possible on same baseline.
