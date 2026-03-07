# Explore Council Log: Conservative Commit + Anchor-Based Inference

## Phase 0: Context and deduplication

### What was read
- `rules/INDEX.md` (video-HH rule block, clarify/verify gates)
- `workflow/WORKING_STATE.md`
- `workflow/changes/video-hh-contract-lab-kickoff/*`
- anchors:
  - `poker-voice/src/videoBaselineExtractor.js`
  - `poker-voice/src/videoLabPreview.js`
  - `poker-voice/tests/videoBaselineExtractor.test.js`
  - `poker-voice/tests/videoLabPreview.test.js`

### Missing pre-flight files (recorded assumption)
- `CLAUDE.md`, `docs/project.md`, `council/first-principles.md`, `council/agents.md` are not in this worktree.
- `/explore` proceeded with skill-local council files and current workflow artifacts.

### Deduplication by meaning
- This is not a new product direction.
- It extends `video-hh-contract-lab-kickoff` with stricter inference quality rules after user QA findings on global rows `8` and `12`.

### Root issue found in current logic
- Focus inference in preview can default to next frame actor or fallback actor:
  - `videoLabPreview.js` (`frame_inferred_next_frame_actor`, `fallback_actor`).
- Focus detection in extractor relies mostly on text cue (`"<nick> is currently deciding"`), which is often absent.
- Result: stale action overlays can be committed too early, and terminal frames can show non-`none` focus.

---

## Phase 1: First principles

### Step 1. Meta-goal
Not "recognize more text," but reconstruct legally coherent action sequences with explicit uncertainty where evidence is weak.

### Step 2. Requirements
Real:
- preserve legal poker turn order and street transitions
- prefer state transitions (pot/stack/focus/order) over static labels
- avoid false certainty in exported events

Self-imposed (removable):
- commit action from a single weak signal
- derive focus in preview from actor fallback for terminal states

### Step 3. Removal
- Remove single-signal action commit.
- Remove forced focus ownership on terminal frames.

### Step 4. Optimization
- Add explicit event states (`committed/inferred/pending`) and reason codes.
- Resolve uncertain actions only at nearest committed anchors.

### Step 5. Acceleration
- Keep conservative main lane.
- Add optional shadow/speculative lane for fast experimentation without polluting committed outputs.

### Step 6. Automation
- Automate quality checks with counters:
  - `false_commit_rate`
  - `pending_rate`
  - `illegal_transition_count`
  - `terminal_focus_none_rate`

### First-principles output

```
┌──────────────────────────────────────────────────────────────┐
│ ПЕРВЫЕ ПРИНЦИПЫ                                              │
├──────────────┬───────────────────────────────────────────────┤
│ Метацель     │ Достоверный reverse-inference, не OCR-guess   │
│ Инварианты   │ legal order, focus-first, terminal focus none │
│ Ограничения  │ OCR шум, frame lag, missing explicit focus cue│
│ Рычаги       │ conservative commit + anchor-based resolve     │
│ Неизвестные  │ пороги commit/pending и переносимость по room  │
└──────────────┴───────────────────────────────────────────────┘
```

User confirmation on Phase 1: `ok`.

---

## Phase 2: Council

### Selected agents
- `@Musk`
- `@Architect`
- `@User`
- `@SRE`
- `@Contrarian`

### Wave 1 (independent reflections, summary)
- `@Musk`: core is state transition physics, not text labels.
- `@Architect`: separate observation, legal inference, and presentation; add explicit event states.
- `@User`: reviewer needs explainable statuses and reasons.
- `@SRE`: add hard quality counters and violation tracking.
- `@Contrarian`: avoid false certainty; require multi-signal commit.

### Fork
**Fork: commit policy**

**A) Conservative Commit**  
Commit only with strong confirmation; keep weak signals pending/inferred.

**B) Aggressive Fill**  
Maximize auto-completion from weak heuristics.

User decision: **A**.

### Wave 2 (discussion summary)
- Converged on two-signal minimum for commit (e.g. pot/stack delta + legal turn/context).
- Added requirement: backward inference must stop at nearest committed anchor.
- Added requirement: terminal state must emit `focus=none`, never fallback actor.
- Added operational reason codes for `why_not_committed`.

### Wave 3 (synthesis)

#### Option X: Conservative-only
Reliable but slower learning on missed-event coverage.

#### Option Y: Conservative main lane + shadow speculative lane
Main output remains strict; speculative lane supports fast R&D without contaminating committed history.

#### Option Z: Aggressive fill in main lane
Higher coverage, higher false certainty risk.

### Recommendation
- Recommended: **Option Y** (practical form of user choice A).
- Keep production lane conservative; run speculative shadow metrics out-of-band.

Kill criteria:
- no reduction in false commits after two iterations
- pending grows without ambiguity reduction
- speculative lane yields no safe promotable heuristics

User approval to create artifacts: `ok`.

