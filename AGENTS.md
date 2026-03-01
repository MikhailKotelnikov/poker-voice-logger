# Project Agent Rules

Apply the compound-engineering workflow on every substantial task.

## Before Work

1. Read `rules/INDEX.md`.
2. Load only rules relevant to the task.
3. Plan with those rules as constraints.

## During Work

1. Track repeated mistakes and decisions that should become reusable rules.

## After Work (Required)

1. Extract reusable lessons into `rules/*.md` files using `rules/rule-template.md`.
2. Update `rules/INDEX.md`.
3. Re-check the final output against updated rules.

## Rule Quality Gate

1. Keep each rule atomic and testable.
2. Use `When -> Then -> Because` structure.
3. Include both positive and anti-pattern examples.

## Minimal Workflow Extensions (Enabled)

1. Run Clarify Gate before coding for tasks that affect parser/conversion/visual behavior or touch multiple modules.
2. Run Verify Gate before marking any task done.
3. For high-risk refactors, use a dedicated `git worktree` and test-first flow.

## Manual Invocation Phrases

1. `Run Clarify Gate for: <task>`
2. `Run Verify Gate for current change`
3. `Start Risky Track for: <task> (worktree + test-first)`

## Skill Auto-Routing

1. For frontend/UI implementation or redesign tasks, load `/Users/parisianreflect/.codex/skills/frontend-design/SKILL.md`.
2. For UI/UX system choices (palette, typography, layout patterns, accessibility, interaction polish), load `/Users/parisianreflect/.codex/skills/ui-ux-pro-max/SKILL.md`.
3. For UI tasks combining build + UX tuning, apply `frontend-design` first, then use `ui-ux-pro-max` as a quality pass.
