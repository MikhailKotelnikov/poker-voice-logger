# Proposal: video-hh-contract-lab-kickoff

## Цель

Запустить Wave-1 контур `video -> canonical_hand_v1 -> HH draft` в изолированном режиме на тестовом видео `20260303-1610-37.8875770.mp4`, чтобы получить воспроизводимые run-артефакты и измеримые метрики качества перед интеграцией в основной HH pipeline.

## Вне scope

- Реалтайм обработка видео.
- Поддержка нескольких покер-румов/layout одновременно.
- Интеграция в production UI/endpoint сервера.
- Автоматическая запись результатов в основную HH БД.

## Подход

1. Зафиксировать `canonical_hand_v1` и валидатор контракта.
2. Добавить run-lab CLI для офлайн прогона по видео с выводом артефактов (`manifest`, `events`, `metrics`, `errors`).
3. Добавить поддержку labeled baseline JSON и diff-метрик `predicted vs labeled`.
4. Добавить минимальный HH draft adapter (из canonical hands в простую HH-проекцию).
5. Включить test-first для контракта и метрик (включая malformed/noisy fixture).

## Критерии приёмки

- [ ] Есть модуль контракта `canonical_hand_v1` с проверкой обязательных полей и нормализацией ошибок.
- [ ] Есть CLI-скрипт, который принимает `--video` и `--labels`, пишет run-scoped артефакты на диск.
- [ ] Есть сравнение с baseline labels и метрики (`hand_count_delta`, `event_count_delta`, `coverage`).
- [ ] Есть тесты на валидный и malformed input для контракта и метрик.
- [ ] `npm run check` и `node --test` по затронутым тестам проходят.

## Ограничения

- В репозитории нет `CLAUDE.md` и `docs/project.md`; grounding выполняется по `README.md`, rules и текущим workflow артефактам.
- В текущем окружении baseline OCR стек реализован через `opencv + rapidocr` (python helper) с fallback на AVFoundation helper.
- Пользовательское видео лежит вне worktree: `/Users/parisianreflect/Documents/codex/20260303-1610-37.8875770.mp4`.

## Контекст

- Активный change из `/explore`: `video-hh-contract-lab-kickoff`.
- Выбранная развилка: `A` (Contract-first + labeled baseline first).
- Рекомендованный формат реализации: `Contract-Lab + Thin Review` (на этом шаге реализуем lab scaffold + метрики).
- Anchor points кода:
  - `poker-voice/package.json`
  - `poker-voice/scripts/*`
  - `poker-voice/tests/*`

## Риски

- Риск шумных событий baseline extractor.
  - Митигация: dedupe + labels diff + итеративная калибровка regex/actor inference.
- Риск расползания контракта до старта extractor.
  - Митигация: strict validator + version field.
- Риск невалидных label-файлов.
  - Митигация: malformed fixture tests и явные коды ошибок.

## Следующий шаг

Реализация `design.md` и `tasks.md` с test-first порядком, затем verify-lite.

## Clarify Gate (до кода)

- **Input contract:** локальный video file path + optional labeled JSON (`canonical_hand_v1`).
- **Output contract:** run folder с `manifest.json`, `events.json`, `metrics.json`, `errors.json`, `hh-draft.json`.
- **Edge cases:** отсутствующий файл, пустой/битый JSON labels, labels с неверным schema.
- **Compatibility:** без изменений текущих API/DB; только новый lab скрипт/модули.
- **Tests:** validator + metrics diff + CLI smoke с malformed labels.
- **Done criterion:** критерии приёмки выше закрыты.
