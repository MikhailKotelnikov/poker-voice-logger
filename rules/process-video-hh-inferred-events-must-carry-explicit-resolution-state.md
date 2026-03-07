# Title

Video-HH Inferred Events Must Carry Explicit Resolution State

## Problem

When inferred events are emitted with the same shape as committed events and no explicit marker, QA and downstream analysis treat uncertain reconstruction as confirmed fact.

## Rule

When extractor emits context-reconstructed actions (for example anchor-based preflop response recovery), then tag each such event with `resolution_state=inferred` and at least one `reason_code`, because uncertainty must remain machine-visible and reviewer-visible end-to-end.

## Examples

### Positive

- `ZootedCamel call` inserted at street anchor includes `resolution_state: "inferred"` and `reason_codes: ["anchor_inferred_preflop_response"]`.

### Anti-pattern

- Synthetic response call is emitted as plain `call` with no marker and is indistinguishable from direct committed OCR evidence.

## Validation Checklist

- [x] Specific and testable
- [x] Reusable in future tasks
- [x] Not duplicated elsewhere

