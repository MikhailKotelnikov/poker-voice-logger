# Title

HH Room For CPR Families Must Be Derived From Table Token

## Problem

Some HH exports for CPR-family tables provide misleading `room` values in embedded meta JSON (`# {...}`), which causes incorrect room filters after import.

## Rule

When `Table '...'` starts with `CPR_` or `PMS_Cpr_`, then derive `room` from the table token (`CPR_* -> CPR`, `PMS_Cpr_* -> PMS_Cpr`) and prefer this value over meta JSON `room`, because these HH families encode the correct room namespace in the table name.

## Examples

### Positive

- `Table 'CPR_5PLO ₮2,000 I' ...` -> `room=CPR`.
- `Table 'CPR_PLO ₮1,000 I' ...` -> `room=CPR`.
- `Table 'PMS_Cpr_5PLO ₮2,000 II - 22601' ...` with `# {"room":"Cpr"}` -> `room=PMS_Cpr`.

### Anti-pattern

- Keep `room=CPR_5PLO` / `room=CPR_PLO` in DB rows.
- Trust `# {"room":"Cpr"}` over table token for `PMS_Cpr_*` hands.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
