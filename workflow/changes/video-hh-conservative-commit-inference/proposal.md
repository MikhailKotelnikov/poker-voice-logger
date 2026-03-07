# Proposal: video-hh-conservative-commit-inference

## Goal

Upgrade video-to-HH extraction quality by moving to conservative action commit with anchor-based inference:
- reduce false committed actions
- make uncertainty explicit
- keep action order legally coherent

## Chosen approach

**Conservative main lane + shadow speculative lane**

- Main lane: commit events only after strong confirmation.
- Shadow lane: evaluate additional speculative heuristics for coverage metrics, without affecting committed output.

## Invariants

1. Focus ownership is primary for turn context.
2. Static action text is secondary to pot/stack/order transitions.
3. Folded players cannot re-enter same hand.
4. Terminal hand state must set `focus=none`.
5. Backward inference cannot overwrite or cross a committed anchor.

## Scope

### In scope
- Add conservative commit rules and pending/inferred state handling.
- Add anchor-based backward/forward resolution rules.
- Add terminal-focus normalization rule.
- Add quality counters for false commit risk and ambiguity.

### Out of scope
- New OCR model training.
- Realtime extraction.
- Multi-room universal adapter redesign.

## Acceptance criteria

- [ ] No `fallback_actor` focus on terminal rows; terminal rows show `focus=none`.
- [ ] Weak single-signal actions are emitted as pending/inferred, not committed.
- [ ] Backward inference stops at nearest committed anchor.
- [ ] Manual QA row 8/12 class of errors is blocked by rules.
- [ ] Rule set is documented in `rules/*.md` and indexed.

## Risks and mitigations

- Risk: pending volume too high.
  - Mitigation: shadow lane + metrics to promote safe heuristics.
- Risk: overfit to one table skin.
  - Mitigation: separate global poker invariants from visual adapter assumptions.
- Risk: complexity creep.
  - Mitigation: keep commit criteria minimal and testable.

## Next step

`/ff` for implementation pass:
1. apply conservative commit + anchor-stop logic in extractor/preview
2. add/update targeted tests
3. run verify gate on representative fixtures

