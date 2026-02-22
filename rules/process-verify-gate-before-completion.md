# Title

Verify Gate Before Completion

## Problem

Tasks marked done without a fixed verification gate frequently reintroduce regressions in parsing logic, conversions, or UI rendering.

## Rule

When marking a task complete, then run a Verify Gate with targeted automated tests, representative fixtures (including malformed input), and a manual visualization smoke-check for changed views, because "done" without explicit checks is not reliable.

## Examples

### Positive

- Run affected test files, validate at least two realistic fixtures plus one malformed fixture, and confirm changed UI states render as expected.

### Anti-pattern

- Declare success after code compiles or one happy-path sample works.

## Validation Checklist

- [ ] Targeted automated checks were executed for all changed modules.
- [ ] Fixture checks include at least one malformed or noisy input.
- [ ] Manual smoke-check was done for changed visualization behavior.
- [ ] Any failed check was fixed and rerun.
