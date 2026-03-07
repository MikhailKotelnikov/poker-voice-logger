# Tasks: video-hh-ledger-reconstruction-engine

## Стратегия тестирования

TDD-by-signal: change затрагивает parser/reconstruction/preview и имеет четкие acceptance criteria, поэтому сначала добавляем regression tests на reconstruction + preview, затем реализуем код.

| Тип | Scope | Файлы |
|-----|-------|-------|
| Unit | reconstruction + validator | `poker-voice/tests/videoReconstruction.test.js` |
| Unit | preview flatten/proof rendering | `poker-voice/tests/videoLabPreview.test.js` |
| Unit | run script integration path | `poker-voice/tests/videoReconstruction.test.js` |
| Static | syntax/check | `poker-voice/package.json` (`npm run check`) |

## Чеклист

### Фаза 0: Подготовка
- [x] Подхватить proposal/design в лабораторный worktree
- [x] Зафиксировать implementation scope: reconstruction layer + validator + preview proof blocks
- [x] Добавить red-тесты на missing responder before street transition и proof-oriented preview

**Checkpoint:** Подготовка завершена

### Фаза 1: Основная реализация
- [x] Добавить reconstruction module с local anchor-window inference — `poker-voice/src/videoReconstruction.js`
- [x] Добавить validator module и hand validation report — `poker-voice/src/videoValidator.js`
- [x] Писать `reconstruction.json` в lab run — `poker-voice/scripts/video-hh-lab-run.mjs`
- [x] Перестроить preview на reconstruction output и proof blocks — `poker-voice/src/videoLabPreview.js`
- [x] Добавить targeted unit tests — `poker-voice/tests/videoReconstruction.test.js`, `poker-voice/tests/videoLabPreview.test.js`, `poker-voice/tests/videoValidator.test.js`

**Checkpoint:** Core функционал работает

### Фаза 2: Интеграция и полировка
- [x] Обновить `package.json` check на новые модули
- [x] Обновить `workflow/WORKING_STATE.md`
- [x] Сформировать `verify-lite.md`
- [x] Прогнать targeted unit tests
- [x] Прогнать `npm run check`
- [x] Сгенерировать smoke preview из baseline run с `reconstruction.json`

**Checkpoint:** Все тесты проходят, check clean, preview генерируется из reconstruction

## Команды проверки
```bash
cd /tmp/codex-video-hh-lab/poker-voice
node --test tests/videoValidator.test.js tests/videoReconstruction.test.js tests/videoLabPreview.test.js
node --test tests/videoContract.test.js tests/videoLabMetrics.test.js tests/videoBaselineExtractor.test.js tests/videoLabPreview.test.js tests/videoReconstruction.test.js tests/videoValidator.test.js
npm run check
npm run -s video:preview -- --run "/tmp/video-hh-lab-full-s1-adaptive/video-lab-20260304-224449753-zh2ng6" --limit 24 --out "index-reconstruction-first24.html"
```
