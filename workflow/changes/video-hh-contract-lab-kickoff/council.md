# Explore Council Log: Contract-Lab Kickoff With Test Video

## Phase 0: Context and deduplication

### What was read
- `rules/INDEX.md`
- `workflow/changes/video-hh-event-first-pipeline/council.md`
- `workflow/changes/video-hh-event-first-pipeline/proposal.md`
- current repository anchors:
  - `poker-voice/server.js`
  - `poker-voice/src/hhDeterministicParse.js`
  - `poker-voice/src/hhDb.js`
  - `poker-voice/tests/*`
  - `poker-voice/scripts/*`

### Workflow status
- `workflow/backlog/`: empty
- `workflow/archive/`: empty
- active prior change exists (`video-hh-event-first-pipeline`)
- no test video file found in workspace at the moment of analysis

### Deduplication by meaning
Prior explore already selected architecture direction: `A` (event-first).
This cycle focuses on execution kickoff: how to start implementation safely and measurably with the first user-provided test recording.

### Meta-goal
Convert architectural intent into a concrete implementation start protocol:
- contract first
- labeled baseline video
- isolated experiment loop
- measurable verify gate

---

## Phase 1: First principles

### Step 1. Meta-goal
Not "write OCR code first", but launch a reproducible learning loop where one test video can be processed, compared against labeled truth, and improved iteration by iteration.

### Step 2. Requirements
Real:
- fixed baseline test recording
- canonical hand-event contract
- label format aligned with contract
- run-scoped metrics and error localization

Self-imposed (deferred):
- realtime support
- all rooms/layouts
- rich production UI

### Step 3. Removal
Removed from wave-1:
- camera input
- broad generalization
- direct mainline integration

### Step 4. Optimization
Prioritize `schema + validator + label protocol` before extractor implementation.

### Step 5. Acceleration
Parallelizable:
- dataset preparation
- contract/test scaffolding
- extractor baseline

### Step 6. Automation
Automate replay/metrics only after one full manual calibration pass on labeled sample.

### First-principles output

```
┌─────────────────────────────────────────────────────┐
│ ПЕРВЫЕ ПРИНЦИПЫ (Kickoff)                           │
├──────────────┬──────────────────────────────────────┤
│ Метацель     │ Запустить воспроизводимый MVP loop   │
│ Инварианты   │ Изоляция, трассировка, метрики       │
│ Ограничения  │ Качество видео, OCR шум, время       │
│ Рычаги       │ Contract-first, label-first, batch    │
│ Неизвестные  │ Репрезентативность первого видео      │
└──────────────┴──────────────────────────────────────┘
```

---

## Phase 2: Council

### Selected agents
- `@Musk`
- `@Architect`
- `@User` (UI/UX proxy)
- `@Startup`
- `@SRE`

### Wave 1: Independent reflections (summary)

#### @Musk
- Start from signal physics and event skeleton, not HH text polish.
- Keep first slice brutally narrow: one room/layout, one recording.
- Treat HH as projection from event truth.

#### @Architect
- Freeze `canonical_hand_v1` before extractor complexity.
- Keep experimental pipeline isolated from current HH endpoints/DB.
- Begin with CLI artifacts before service/UI coupling.

#### @User
- Value depends on fast correction of uncertain events.
- Must expose confidence and evidence links early.
- Even minimal review flow should align with label schema.

#### @Startup
- Optimize for short measurable loops, not architecture perfection.
- Define success criteria before coding.
- Avoid scaling to second video until first one stabilizes.

#### @SRE
- Require run-scoped observability from day one.
- Tag errors by stage (`capture/ocr/reconstruct/export`).
- Enforce graceful degradation for low-confidence fields.

### Fork from Wave 1

**Fork: kickoff artifact sequence**

**A) Contract-first + labeled video first**  
Define schema + labels + validator, then extractor.

**B) Extractor-first + contract later**  
Prototype extractor immediately, stabilize format after.

### User decision
Chosen: **A**

### Wave 2: Discussion (summary)
- @Architect reinforced strict versioned contract boundary.
- @Startup challenged over-formalization; keep `v1` minimal.
- @SRE insisted minimal observability is non-negotiable.
- @Musk challenged logging bloat; keep only causally useful signals.
- @User bridged with operator-facing error surface tied to evidence.
- Consensus: contract-lab first, thin review flow, isolate from main APIs.

### Wave 3: Synthesis

#### Option X: Strict Contract-Lab (CLI only)
Maximum reproducibility, minimal UI at start.

#### Option Y: Contract-Lab + Thin Review
Same foundation as X plus minimal uncertainty triage/correction flow.

#### Option Z: Dual extractor baselines under one contract
Faster technical comparison, higher maintenance load.

### Recommendation
Recommended: **Option Y** (Contract-Lab + Thin Review).

Why:
- preserves event-first architecture
- enables human-in-the-loop learning immediately
- remains isolated and measurable for parallel development

**Kill criteria**
- no metric improvement after two full iterations
- manual correction time does not decrease
- failures cannot be localized by stage

---

## Phase 3 outcome status
- Council complete.
- Artifacts created:
  - `workflow/changes/video-hh-contract-lab-kickoff/council.md`
  - `workflow/changes/video-hh-contract-lab-kickoff/proposal.md`
