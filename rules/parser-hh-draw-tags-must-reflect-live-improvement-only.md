# Title

HH Draw Tags Must Reflect Only Live Improvement Outs

## Problem

Draw tags can become contradictory/noisy when they are emitted even after a stronger made hand is already present on the same street.

## Rule

When deriving draw tags for a street, then keep only draws that can still improve the current made hand class (for example keep `fd/nfd` with a made straight, but suppress `wrap/oe/g` once flush+ is already made), because draw tags should represent real future improvement paths, not dominated outs.

## Examples

### Positive

- `Qd8dAs4h2c_midstr_nfd` (straight plus live flush improvement).
- `AdKd6c4hQs_lowflush` (no straight-draw token after made flush).

### Anti-pattern

- `AdKd6c4hQs_lowflush_wrap` (keeps dominated straight draw after made flush).
- `Qd8dAs4h2c_midstr` without `fd/nfd` when two-card flush draw is still live.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
