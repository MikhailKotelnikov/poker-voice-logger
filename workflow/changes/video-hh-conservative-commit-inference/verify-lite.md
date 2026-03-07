# Verify-Lite: video-hh-conservative-commit-inference

## Scope

- extractor conservative commit refinement
- preview focus resolution refinement
- regression tests for row-class issues (stale response + terminal focus)
- preview explainability trace + first-24 event report output
- stale preflop response correction from manual review (`global #8` case)
- pending rows are excluded from visible event numbering

## Verify-lite

| Проверка | Статус |
|----------|--------|
| Tasks: 14/14 | ✓ |
| Критерии proposal: 5/5 | ✓ |
| Unit tests (`videoContract`, `videoLabMetrics`, `videoBaselineExtractor`, `videoLabPreview`) | ✓ passing |
| `npm run check` | ✓ clean |
| Preview smoke (`video:preview` на existing run) | ✓ generated, terminal focus normalized |
| First-24 explainability preview | ✓ generated (`index-first24-trace.html`) |
| Manual issue re-check (`global #8`) | ✓ focus locked to actor + state pending |
| Pending row visibility | ✓ hidden from event list; visible numbering recomputed |

## Commands executed

```bash
cd poker-voice
node --test tests/videoBaselineExtractor.test.js tests/videoLabPreview.test.js
node --test tests/videoContract.test.js tests/videoLabMetrics.test.js tests/videoBaselineExtractor.test.js tests/videoLabPreview.test.js
npm run check
npm run -s video:preview -- --run "/tmp/video-hh-lab-full-s1-adaptive/video-lab-20260304-224449753-zh2ng6"
npm run -s video:preview -- --run "/tmp/video-hh-lab-full-s1-adaptive/video-lab-20260304-224449753-zh2ng6" --limit 24 --out "index-first24-trace.html"
```

## Manual smoke notes

- Re-generated preview:
  - `/tmp/video-hh-lab-full-s1-adaptive/video-lab-20260304-224449753-zh2ng6/preview/index.html`
  - `/tmp/video-hh-lab-full-s1-adaptive/video-lab-20260304-224449753-zh2ng6/preview/index-first24-trace.html`
- Spot check confirms terminal row normalization:
  - hand1/global12 now resolves with `focus=none` (source `terminal_focus_none`).
- Spot check confirms explainability payload:
  - rendered rows `24/55`, each row has trace with `observed/decision/past_locked/expected`.
- Spot check for user-reported issue:
  - `global #8` now resolves as:
    - `focus=ZootedCamel` (`stale_preflop_response_actor_lock`)
    - `state=pending`
    - `reason=pending_preflop_response_without_pot_growth`
- Event preview behavior:
  - pending-only rows are hidden from the rendered event table
  - visible `# Global` numbering is recomputed after filtering
