# Proposal: video-hh-ledger-reconstruction-engine

## Цель

Перейти от event-first OCR строк к ledger-first реконструкции раздачи, чтобы на baseline video получать полную и самопроверяемую последовательность покерных действий без потери обязательных ответов.

## Вне scope

1. Глобальный solver по всей раздаче на первой итерации.
2. Реалтайм-обработка.
3. Поддержка нескольких room/layout одновременно.
4. Полная поддержка side pots в первой волне.
5. Прямая prod-интеграция в HH/DB до прохождения validator.

## Подход

1. Заменить модель `frame -> event` на:
   - `FrameObservation`
   - `SeatStateSnapshot`
   - `HandLedgerState`
   - `PendingObligation`
   - `CommittedAction`
   - `ValidationReport`

2. Ввести betting-node state machine, которая хранит:
   - current actor
   - amount to call
   - current aggressor
   - committed chips per player on street
   - active / folded / all-in state
   - unresolved responders

3. Восстанавливать пропущенные действия только внутри окон между committed anchors:
   - pot jump
   - street transition
   - terminal lock
   - confirmed response

4. Восстанавливать действия от банка и вложенных денег, а не от OCR action-text.

5. Добавить независимый second-pass validator:
   - pot reconciliation
   - legal turn order
   - street closure legality
   - no missing required responses
   - stack non-negative

6. Выпускать proof-oriented `reconstruction.json` по каждой раздаче.

7. Использовать preview только как проекцию `reconstruction.json`, а не как источник истины.

## Критерии приемки

1. Есть контракт hand-ledger reconstruction.
2. Есть gap resolution между committed anchors.
3. Validator блокирует hand при `pot mismatch`, `illegal turn order`, `unfinished response chain`.
4. Есть regression fixtures для missing squeeze responses и street-transition gaps.
5. `reconstruction.json` показывает:
   - `pot_before`
   - `pot_after`
   - `missing_responders`
   - `chosen_resolution`
   - `validation_status`
6. Preview больше не нумерует pending-only decision frames как события.
7. `npm run check` и целевые тесты проходят.

## Ограничения

1. Video-HH логика сейчас split между main repo и `/tmp/codex-video-hh-lab`.
2. Baseline video лежит вне worktree: `/Users/parisianreflect/Documents/codex/20260303-1610-37.8875770.mp4`.
3. Wave 1 ограничена одним room/layout с шумным OCR.
4. Система должна уметь честно выпускать `inferred` и `ambiguous`.

## Контекст

1. Это следующий шаг после `video-hh-event-first-pipeline`.
2. Это уточнение поверх `video-hh-contract-lab-kickoff`.
3. Триггером стал пропущенный `ZootedCamel call` перед переходом на flop.
4. В `/explore` выбран fork `A`: Sequential Ledger Engine.

## Риски

1. Слишком большая сложность слишком рано.
   - Смягчение: делать `A1`, а не глобальный solver.
2. Ложная уверенность на sparse capture.
   - Смягчение: вводить `ambiguous`, а не молча выбирать линию.
3. Нестабильный stack OCR.
   - Смягчение: сначала опираться на pot-first ledger, а stack rules подключать по confidence.
4. Расхождение preview и canonical history.
   - Смягчение: preview строится только из reconstruction output.

## Следующий шаг

Подготовить `design.md` для hand-ledger architecture, validator contracts и gap-resolution flow, затем переходить к `/ff` или test-first implementation.

## Clarify Gate (до кода)

### Input contract
- observation per frame: focus, pot, stack candidates, seat states, OCR hints

### Output contract
- `reconstruction.json` per hand: ledger states, committed/inferred actions, proof blocks, validation report

### Edge cases
1. Несколько действий между соседними кадрами.
2. Неизменный pot при stale badge.
3. Short all-in.
4. Ambiguous local gap.
5. Wrong stack OCR при корректном pot OCR.

### Compatibility
- Потребители `canonical_hand_v1` должны быть изолированы, пока richer reconstruction contract не стабилизирован.

### Tests
1. Betting-node fixtures.
2. Squeeze-response regressions.
3. Malformed / contradictory ledger fixtures.

### Done criterion
- Acceptance criteria закрыты на фиксированном baseline и validator ловит сломанные fixtures.
