# Title

Skill Import from Zip Archives

## Problem

Imported skill bundles can include stale local artifacts (`.DS_Store`, `__MACOSX`) or partially overwrite existing skill folders, which causes noisy repos and inconsistent skill behavior.

## Rule

When importing skills from zip archives, then unpack into the target `skills/` directory, remove archive artifacts, and verify each imported skill has `SKILL.md` and `agents/openai.yaml`, because clean and complete skill folders are required for reliable invocation.

## Examples

### Positive

- Import `ff.zip`, `design.zip`, `explore.zip`, `compound.zip` into `skills/`, delete `.DS_Store`, confirm `skills/<name>/SKILL.md` and `skills/<name>/agents/openai.yaml` exist.

### Anti-pattern

- Unpack zips as-is with `__MACOSX` and keep mixed old/new files without checking required skill files.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
