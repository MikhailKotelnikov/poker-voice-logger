# Design: video-hh-ledger-reconstruction-engine

## Обзор

Цель дизайна: превратить текущую video-HH обработку из event-first OCR пайплайна в ledger-first reconstruction engine, который:

1. мыслит раздачей, а не строками preview;
2. не теряет обязательные ответы между кадрами;
3. восстанавливает пропущенные действия только из локально доказуемых anchor windows;
4. сам себя валидирует по банку, очереди хода и закрытию улиц;
5. отдает downstream только проверяемый `reconstruction.json`.

Рекомендуемый путь реализации для этой волны: `A1 Sequential Ledger Engine`, при этом контракты сразу проектируются так, чтобы локальный `A2 gap solver` можно было добавить без ломки модели данных.

## Визуализации

- `assets/ledger-reconstruction-architecture.excalidraw`  
  Компонентная схема: `frames -> observations -> seat snapshots -> ledger -> gap resolver -> validator -> reconstruction.json -> preview/HH/DB`.

- `assets/gap-resolution-validator-flow.excalidraw`  
  Flow локального восстановления пропущенных действий внутри окна между committed anchors.

- `assets/hand-review-preview-wireframe.excalidraw`  
  Wireframe review-экрана: hand header, action timeline, anchor frames, proof block и ledger snapshot для проверки inferred actions.

- `assets/action-state-model.excalidraw`  
  Диаграмма состояний `observed_only -> pending -> committed/inferred -> ambiguous/invalid -> accepted hand output`.

- `assets/fixture-map-regressions.excalidraw`  
  Карта regression-fixtures: какие классы видео-ошибок должны быть покрыты и какими validator assertions они закрываются.

## Границы системы

### Вход
- video frames
- OCR/hint outputs:
  - focus cues
  - pot OCR
  - stack/bet OCR
  - action badges как слабый сигнал
  - street / board hints

### Каноническое ядро
- `FrameObservation`
- `SeatStateSnapshot`
- `HandLedgerState`
- `GapWindow`
- `CommittedAction`
- `ValidationReport`

### Выход
- `reconstruction.json` как источник истины
- derived preview HTML
- HH draft adapter
- DB import adapter

## Архитектура

### 1. Observation Layer

Назначение: не принимать poker decisions, а только фиксировать, что реально видно на кадре.

`frame_observation_v2`

```json
{
  "frameId": "f_30000",
  "frameMs": 30000,
  "streetHint": "preflop",
  "focus": {
    "actor": "ZootedCamel",
    "source": "ring_plus_timebar",
    "confidence": 0.94
  },
  "pot": {
    "value": 2301,
    "confidence": 0.91
  },
  "seats": [
    {
      "player": "AbbyMartin",
      "stack": 7460,
      "visibleCommit": 767,
      "stateHint": "active",
      "confidence": 0.78
    }
  ],
  "ocrHints": {
    "badgeText": "CALL",
    "badgeOwner": "ZootedCamel"
  }
}
```

Правило слоя: observation не имеет права напрямую стать committed event.

### 2. Seat Snapshot Layer

Назначение: привести один кадр к нормализованному срезу стола.

`seat_state_snapshot_v1`

```json
{
  "frameId": "f_30000",
  "street": "preflop",
  "potValue": 2301,
  "focusActor": "ZootedCamel",
  "players": [
    {
      "name": "ZootedCamel",
      "status": "active",
      "stack": 4107,
      "visibleCommit": 767
    }
  ]
}
```

### 3. Ledger Layer

Назначение: держать физику раздачи, а не OCR-описание.

`hand_ledger_state_v1`

```json
{
  "handId": "hand_0001",
  "street": "preflop",
  "buttonSeat": 5,
  "currentActor": "ZootedCamel",
  "currentAggressor": "ilsy",
  "amountToCall": 767,
  "potCommitted": 2301,
  "players": [
    {
      "name": "AbbyMartin",
      "streetCommitted": 767,
      "totalCommitted": 767,
      "stackRemaining": 7460,
      "state": "active"
    }
  ],
  "pendingResponders": ["ZootedCamel"],
  "anchorFrameId": "f_30000"
}
```

Минимальные обязанности ledger:
1. знать очередь хода;
2. знать, кто еще обязан ответить;
3. знать, сколько нужно доставить;
4. не допускать street transition, пока response chain не закрыта;
5. хранить enough data для pot reconciliation.

### 4. Gap Window Layer

Назначение: разрешать только локальные пробелы между двумя зафиксированными anchor points.

`gap_window_v1`

```json
{
  "fromAnchor": "f_30000",
  "toAnchor": "f_33000",
  "street": "preflop",
  "pendingRespondersAtOpen": ["ZootedCamel"],
  "potBefore": 2301,
  "potAfter": 3068,
  "candidateLines": [
    {
      "actions": [
        {
          "actor": "ZootedCamel",
          "action": "call",
          "amount": 767
        }
      ],
      "fit": "exact"
    }
  ],
  "resolution": "unique"
}
```

Gap window открывается только если:
1. есть pending responder;
2. следующий anchor показывает новый pot / street / terminal state;
3. нужно объяснить, как дойти от ledger A до ledger B без нарушения правил покера.

### 5. Validation Layer

Назначение: не доверять reconstruction engine на слово.

`validation_report_v1`

```json
{
  "status": "valid",
  "checks": {
    "potReconciliation": "pass",
    "actorOrder": "pass",
    "streetClosure": "pass",
    "requiredResponses": "pass",
    "stackNonNegative": "pass"
  },
  "warnings": [],
  "errors": []
}
```

Если validator не проходит, раздача не считается готовой для preview/HH/DB.

## State Machine

### Betting Node

Каждый betting node должен отвечать на пять вопросов:
1. Кто сейчас имеет право хода?
2. Кто текущий aggressor?
3. Сколько нужно докинуть до call?
4. Какие игроки еще обязаны ответить?
5. Может ли улица законно закончиться прямо сейчас?

### Разрешенные состояния action

1. `observed_only`
- есть кадр, но еще нет доказательства действия

2. `pending`
- actor в фокусе, response chain еще не закрыта

3. `committed`
- действие видно и подтверждено на текущем anchor

4. `inferred`
- commit-кадра нет, но ближайший следующий anchor однозначно доказывает действие

5. `ambiguous`
- есть более одной legal line, авто-коммит запрещен

6. `invalid`
- ни одна legal line не объясняет переход между anchors

## Gap Resolution Flow

### Anchor types

Допустимые resolving anchors:
1. `pot_delta_anchor`
2. `street_transition_anchor`
3. `terminal_state_anchor`
4. `confirmed_response_anchor`

### Алгоритм локального восстановления

1. Зафиксировать последний committed anchor A.
2. Собрать pending frames до ближайшего anchor B.
3. Выписать mandatory responders, которые были открыты на A.
4. Посчитать `pot_after - pot_before`.
5. Сгенерировать legal candidate lines только для этого окна.
6. Отбросить линии, которые:
   - нарушают порядок хода;
   - не сходятся по банку;
   - незаконно закрывают улицу;
   - дают отрицательный стек.
7. Если осталась одна линия, действия становятся `inferred`.
8. Если осталось несколько линий, окно помечается `ambiguous`.
9. Если не осталось ни одной, hand помечается `invalid`.

### Главный guardrail

Gap resolution не имеет права переписывать уже committed history вне текущего anchor window.

## Reconstruction Output

`reconstruction_hand_v2`

```json
{
  "version": "reconstruction_hand_v2",
  "handId": "hand_0001",
  "actions": [
    {
      "seq": 8,
      "street": "preflop",
      "actor": "ZootedCamel",
      "action": "call",
      "amount": 767,
      "state": "inferred",
      "proof": {
        "potBefore": 2301,
        "potAfter": 3068,
        "anchorFrom": "f_30000",
        "anchorTo": "f_33000",
        "reason": "next_pot_delta_matches_missing_call"
      }
    }
  ],
  "ledgerSnapshots": [],
  "validation": {
    "status": "valid"
  }
}
```

## Preview Rules

Preview обязана быть read-only проекцией reconstruction output.

### Что preview показывает
1. только `committed` и `inferred` actions в глобальной нумерации;
2. proof block для каждого inferred action;
3. focus actor и state machine context для review;
4. `ambiguous` и `invalid` как специальные review states.

### Что preview не делает
1. не коммитит новые события самостоятельно;
2. не чинит canonical историю display-layer эвристиками;
3. не нумерует pure-pending decision frames как actions.

## Review UX

### Hand Review Screen

Review-экран должен быть hand-centric.

Обязательные блоки:
1. hand header со статусом `valid / ambiguous / invalid`;
2. action timeline с глобальной нумерацией только для `committed` и `inferred`;
3. selected action context;
4. anchor A / pending window / anchor B;
5. proof block;
6. ledger snapshot до и после resolved gap.

### Proof Block

Для каждого `inferred` action review обязан показывать:
1. `pot_before`
2. `pot_after`
3. `pending_responders`
4. `locked_past_actions`
5. `chosen_resolution`
6. `validator_checks`
7. `anchorFrom`
8. `anchorTo`

Без этого reviewer вынужден гадать по отдельным строкам, а не проверять математику и legal order.

## State Model

Состояния нужны не только в коде, но и в review/preview semantics:

1. `observed_only`
- есть observation, но нет action commitment

2. `pending`
- игрок все еще в фокусе или response chain не доказана

3. `committed`
- действие подтверждено на текущем anchor

4. `inferred`
- действие не видно напрямую, но однозначно доказано соседним anchor window

5. `ambiguous`
- несколько legal lines, auto-accept запрещен

6. `invalid`
- legal reconstruction не существует, hand блокируется

## Regression Fixture Strategy

Каждый новый баг из ручного review должен попадать в fixture-карту, а не жить как разовое устное исключение.

Минимальные fixture classes:
1. stale badge без роста банка;
2. missing responder перед street transition;
3. fast fold без отдельного commit frame;
4. short all-in call;
5. impossible pot jump;
6. wrong stack OCR при корректном pot OCR;
7. dead player receives action;
8. two actions between adjacent frames;
9. terminal state after final fold;
10. ambiguous local gap.

Для каждого fixture должен быть заранее известен expected outcome:
- `committed`
- `inferred`
- `ambiguous`
- `invalid`
- validator pass/fail

## Варианты

### Вариант A1
- Sequential Ledger Engine
- локальный backfill между committed anchors
- blocking validator

### Вариант A2
- Sequential Ledger + explicit local solver
- подключается позже только внутри unresolved gap windows

### Отклоненный вариант
- Global full-hand solver на этой фазе
- причина: слишком дорого дебажить и слишком легко потерять explainability

## Рекомендация

Реализовывать `A1` в следующем порядке:

1. Вынести контракты observation / ledger / validation в отдельные модули.
2. Добавить betting-node state machine.
3. Добавить gap-window resolver между committed anchors.
4. Подключить second-pass validator.
5. Пересобрать preview поверх `reconstruction.json`.
6. Только после этого подключать HH draft / DB import adapters.

Для review-потока делать это параллельно:
1. hand-review wireframe -> HTML preview adaptation
2. state-model -> explicit event-state fields in JSON
3. fixture-map -> named regression suite

## Разбиение на модули

Предлагаемая структура:

1. `src/videoObservation.js`
- normalize frame OCR into `frame_observation_v2`

2. `src/videoLedger.js`
- betting-node and ledger transitions

3. `src/videoGapResolver.js`
- local inference inside anchor windows only

4. `src/videoValidator.js`
- independent validation pass

5. `src/videoReconstruction.js`
- orchestration: observation -> ledger -> inference -> validation -> output

6. `src/videoLabPreview.js`
- render from `reconstruction.json` only

## Verify Gate для design -> implementation

- [ ] Контракты observation / ledger / reconstruction / validation зафиксированы.
- [ ] Gap resolution ограничен ближайшими committed anchors.
- [ ] Street transition без закрытой response chain запрещен на уровне validator.
- [ ] Preview не является источником истины.
- [ ] Есть место для статусов `inferred`, `ambiguous`, `invalid`.
- [ ] Следующая итерация реализации может быть покрыта fixture-тестами по betting nodes.

## Статус

Design готов для перехода к `/ff`.
