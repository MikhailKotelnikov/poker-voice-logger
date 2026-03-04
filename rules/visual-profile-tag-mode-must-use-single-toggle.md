# Title

Visual Profile Tag Mode Must Use A Single OR/AND Toggle

## Problem

Separate mode buttons for tag filters create ambiguous interaction and accidental misclicks: users can lose track of whether matching uses OR or AND.

## Rule

When rendering hand-tag or board-tag filter mode controls, then show one toggle button with the current mode label (`OR` or `AND`) and flip mode on click, because mode is mutually exclusive and must stay visually unambiguous.

## Examples

### Positive

- `Тип руки` shows one green button `OR`; click changes it to `AND` and immediately reapplies filters.
- `Тип борда` uses the same single-button behavior and state model.

### Anti-pattern

- Rendering two separate buttons (`OR` and `AND`) and relying on active state highlighting to indicate which one is selected.
- Mixing locale abbreviations (`ИЛИ/И`) in one place and English (`OR/AND`) in another for the same mode control.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
