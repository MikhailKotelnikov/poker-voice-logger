# Verify-lite: video-hh-ledger-reconstruction-engine

## Проверки

| Проверка | Статус |
|----------|--------|
| Tasks: 11/11 | ✓ |
| Критерии: 7/7 | ✓ |
| Unit tests | ✓ passing |
| Lint / syntax (`npm run check`) | ✓ clean |
| Smoke preview from `reconstruction.json` | ✓ generated |

## Команды

```bash
cd /tmp/codex-video-hh-lab/poker-voice
node --test tests/videoContract.test.js tests/videoLabMetrics.test.js tests/videoBaselineExtractor.test.js tests/videoLabPreview.test.js tests/videoReconstruction.test.js tests/videoValidator.test.js
npm run check
npm run -s video:preview -- --run "/tmp/video-hh-lab-full-s1-adaptive/video-lab-20260304-224449753-zh2ng6" --limit 24 --out "index-reconstruction-first24.html"
```

## Итоги

1. `36/36` video-HH tests passed.
2. `npm run check` passed after adding `src/videoValidator.js` and `src/videoReconstruction.js` to the syntax gate.
3. Smoke preview generated:
   - run: `/tmp/video-hh-lab-full-s1-adaptive/video-lab-20260304-224449753-zh2ng6`
   - html: `/tmp/video-hh-lab-full-s1-adaptive/video-lab-20260304-224449753-zh2ng6/preview/index-reconstruction-first24.html`
   - frames: `44`
   - rendered events: `24/55`
   - warnings: `0`
4. Spot-check:
   - first-hand `ZootedCamel` event at `30000ms` now has `resolution_state=inferred`
   - proof block shows `2301 -> 3068`, `delta=767`, `anchor=30000->35000`
   - hand validation for that first hand is `valid`

## Ограничения

1. Это wave-1 reconstruction layer поверх existing canonical extractor, а не полный global solver.
2. `hh-draft.json` пока всё ещё строится из canonical extractor output; preview уже читает `reconstruction.json`, если он существует.
3. В smoke baseline найден `1` invalid hand в `reconstruction.meta.invalid_hands`, что ожидаемо для текущей волны и должно идти в review, а не в auto-accept.
