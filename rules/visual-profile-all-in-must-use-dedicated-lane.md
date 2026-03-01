# Title

Visual Profile All-In Must Use Dedicated Lane

## Problem

All-in actions mixed into regular bucket bars make sizing strategy unreadable and hide whether sizing was intentional or forced by stack depth.

## Rule

When rendering any profile stat row, then split output into separate normal and all-in lanes with independent totals and samples, because forced all-in actions must not distort regular sizing distribution.

## Examples

### Positive

- A `b70` regular bet and a stack-off `b70` all-in appear in two different lanes in the same sizing row.

### Anti-pattern

- Regular and all-in hands are aggregated into one bar, making `b70` look overused.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
