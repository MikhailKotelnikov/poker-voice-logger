# Title

HH OneDrive Pipeline Must Archive Imported Files Outside Project Workspace

## Problem

Keeping processed HH files in the project-local `imported` folder grows repository-adjacent storage and clutters the workspace.

## Rule

When running the OneDrive HH pipeline, then treat project-local `imported` as temporary and move its contents to an external archive folder (for example `/Users/.../Documents/imported`) after DB import, because workspace storage should stay lean while imported HH history remains preserved.

## Examples

### Positive

- Pipeline steps: OneDrive `import` -> local `import` -> DB conversion -> local `imported` -> external `/Users/.../Documents/imported`.
- After run, local `imported` is empty or contains only empty directories.

### Anti-pattern

- Keeping all processed HH files permanently under `/Users/.../Documents/codex/imported` and growing project-adjacent storage indefinitely.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
