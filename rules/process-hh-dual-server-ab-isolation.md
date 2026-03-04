# Title

HH Baseline/Quality Servers Must Use Isolated Runtime Paths

## Problem

When baseline and experimental HH servers share port, DB path, or runtime logs, A/B validation becomes unreliable: results contaminate each other and zero-diff checks lose meaning.

## Rule

When running baseline and quality-first HH pipelines in parallel for validation, then assign separate defaults for `PORT`, `HH_DB_PATH`, runtime logs, and reports path for each server, because isolated runtime state is required for deterministic one-to-one DB comparison.

## Examples

### Positive

- Baseline runs on `8787` with `data/hh.db`; quality-first runs on `8797` with `data/hh.quality-first.db`; both imports process the same HH corpus, then DBs are compared table-by-table.

### Anti-pattern

- Launch baseline and quality-first servers against the same `HH_DB_PATH` and evaluate parser accuracy from mixed rows.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
