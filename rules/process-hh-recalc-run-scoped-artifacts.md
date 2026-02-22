# Title

HH Recalculation Must Produce Run-Scoped Artifacts

## Problem

Reusing generic temp files across repeated imports can mix outputs from different algorithm versions and cause uncertainty about which rows were uploaded.

## Rule

When recalculating HH after algorithm changes, then write fresh run-scoped artifacts (`rows`, `nonEmpty`, `summary`) with a generation timestamp before upload, because traceable inputs guarantee that the uploaded batch matches the current parser logic.

## Examples

### Positive

- Save `/tmp/hh_21_02_rows_nonempty_recalc_now.json` and `/tmp/hh_21_02_recalc_summary_now.json` with `generatedAt` before posting to Sheets.

### Anti-pattern

- Uploading from an old `/tmp/hh_21_02_rows.json` without proving it was built by the current algorithm revision.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
