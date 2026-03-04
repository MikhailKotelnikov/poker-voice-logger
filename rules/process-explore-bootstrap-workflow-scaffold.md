# Title

Explore Must Bootstrap Missing Workflow Scaffold

## Problem

The `/explore` workflow depends on `workflow/WORKING_STATE.md` and `workflow/{backlog,changes,archive}` paths. If they are missing, analysis logs and proposals have no canonical location, and the session loses continuity.

## Rule

When running `/explore` and required workflow paths are absent, then create a minimal scaffold (`workflow/WORKING_STATE.md`, `workflow/backlog/`, `workflow/changes/`, `workflow/archive/`) before writing artifacts, because the skill output contract requires stable storage for council and proposal history.

## Examples

### Positive

- Detect missing workflow paths, create scaffold, then save `workflow/changes/<name>/council.md` and `proposal.md`.

### Anti-pattern

- Keep analysis only in chat and finish `/explore` without persisted artifacts because workflow paths did not exist.

## Validation Checklist

- [ ] Missing workflow paths were checked explicitly.
- [ ] Scaffold was created before artifact write.
- [ ] `council.md` and `proposal.md` were persisted under `workflow/changes/<name>/`.
- [ ] `workflow/WORKING_STATE.md` was updated.
