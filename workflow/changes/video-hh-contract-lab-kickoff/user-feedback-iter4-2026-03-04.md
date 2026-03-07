# User Feedback: Iteration 4 (2026-03-04)

## Source

- Review based on preview run:
  - `/tmp/video-hh-lab-iter2-preview/video-lab-20260303-182647807-6ajia7/preview/index.html`
  - `/tmp/video-hh-lab-iter2-preview/video-lab-20260303-182647807-6ajia7/events.json`

## User-validated rows

### Correct

1. `preflop leeuw fold` — confirmed.
2. `preflop MrLouie fold` — confirmed.
3. `preflop ilsy raise` — confirmed.
4. `preflop PickleBaller fold` — confirmed.
5. `flop ilsy check` — confirmed.
6. `flop ilsy fold` (после all-in) — confirmed.

### Missing (false negatives)

1. Пропущен `AbbyMartin raise` на preflop (ранний action).
2. Пропущен ответ на squeeze: `AbbyMartin fold` на preflop.
3. Пропущен ответ второго игрока после squeeze: `ZootedCamel call` на preflop.
4. Пропущен `AbbyMartin` flop c-bet перед `ZootedCamel all-in`.

### Wrong extra events (false positives)

1. `flop PickleBaller fold` — игрок уже выбыл на preflop.
2. `flop MrLouie fold` — игрок уже выбыл на preflop.
3. `flop leeuw fold` — игрок уже выбыл на preflop.

### Timing / turn-context mismatch

1. `ZootedCamel allin` по смыслу распознан верно, но зафиксирован поздно (кадр уже после перехода фокуса хода).
2. На части flop-кадров extractor трактует статические action-бейджи как новые actions, игнорируя turn-indicator (подсветка активного игрока + расход времени).

## Error classes

1. **State leakage:** folded players re-appear on later street.
2. **Turn-context miss:** active decision indicator is not used as primary signal.
3. **Sparse-sampling onset drift:** event timestamp aligns to post-action frame instead of onset frame.
4. **Preflop chain incompleteness:** squeeze-response actions are dropped.

## Next implementation target (for next pass)

1. Add per-hand player-state machine (`active/folded/allin`) and hard block actions from inactive players.
2. Add active-turn detector from visual cues (ring/timer zone), use it as primary actor prior for action-only lines.
3. Add onset-timestamp anchoring (prefer first frame where action appears, not frame after turn-focus shift).
4. Add preflop sequence completion heuristic for squeeze branches (open -> cold call -> squeeze -> reactions).

## User Clarification Addendum (focus-first)

- Primary anchor must be current action focus:
  - active circular waves/ring around player,
  - burning base decision timebar under that player (before separate timebank bar).
- Extractor must start from focus ownership first, and only then resolve action tokens.
- Timestamp drift is secondary; actor-focus correctness is the top rule.

## User Clarification Addendum 2 (pot/stack priority)

- Action text (`raise/call/fold`) is secondary and can be stale.
- Primary decision evidence should come from:
  - pot size transition,
  - stack commitment / remaining stack changes,
  - legal turn-order consistency.
- If next frame already shows next actor deciding, prior action can be recorded postfactum, but sequence must stay legal.
