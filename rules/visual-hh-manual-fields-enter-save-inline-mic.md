# Title

HH Manual Fields Must Use Enter-Save And Inline Mic

## Problem

Per-field action buttons (`save/voice/report`) add visual noise in dense hand cards and slow down note entry during live review.

## Rule

When rendering HH manual note fields in the hand popup, then save text on `Enter` and expose voice input as an inline microphone control inside the same input field, because this keeps editing fast and preserves space for action lines.

## Examples

### Positive

- User types note and presses `Enter` to persist.
- Microphone icon inside the input toggles audio capture for that field.
- Report action is moved to one hand-level control in metadata row.

### Anti-pattern

- Rendering separate per-field button rows for every street (`save/voice/report`) in tight tooltip layouts.
- Requiring extra mouse clicks on dedicated `save` buttons for normal text edits.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
