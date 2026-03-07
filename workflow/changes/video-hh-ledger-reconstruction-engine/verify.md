# Verify: video-hh-ledger-reconstruction-engine

## Scope

Проверен change `video-hh-ledger-reconstruction-engine` в worktree `/tmp/codex-video-hh-lab`.

## Автоматические проверки

| Проверка | Результат |
|----------|-----------|
| Targeted + integration unit tests | ✓ `36/36` |
| `npm run check` | ✓ clean |
| Reconstruction rebuild on baseline run | ✓ completed |
| Preview smoke from `reconstruction.json` | ✓ generated |

## Команды

```bash
cd /tmp/codex-video-hh-lab/poker-voice
node --test tests/videoContract.test.js tests/videoLabMetrics.test.js tests/videoBaselineExtractor.test.js tests/videoLabPreview.test.js tests/videoReconstruction.test.js tests/videoValidator.test.js
npm run check
node - <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { buildReconstructionRun } from './src/videoReconstruction.js';
const runDir = '/tmp/video-hh-lab-full-s1-adaptive/video-lab-20260304-224449753-zh2ng6';
const canonical = JSON.parse(fs.readFileSync(path.join(runDir, 'events.json'), 'utf8'));
const reconstruction = buildReconstructionRun(canonical);
fs.writeFileSync(path.join(runDir, 'reconstruction.json'), JSON.stringify(reconstruction, null, 2) + '\\n');
NODE
npm run -s video:preview -- --run "/tmp/video-hh-lab-full-s1-adaptive/video-lab-20260304-224449753-zh2ng6" --limit 24 --out "index-verify-reconstruction.html"
```

## Spot-check

Проверен baseline run:
- `/tmp/video-hh-lab-full-s1-adaptive/video-lab-20260304-224449753-zh2ng6/reconstruction.json`
- `/tmp/video-hh-lab-full-s1-adaptive/video-lab-20260304-224449753-zh2ng6/preview/index-verify-reconstruction.html`

Подтверждено:
1. Для first hand событие `ZootedCamel @ 30000ms` имеет:
   - `resolution_state = inferred`
   - `reason_codes = ["anchor_window_pot_delta_confirms_response"]`
   - proof: `pot_before=2301`, `pot_after=3068`, `amount=767`, `anchor=30000->35000`
2. Для этой же раздачи validation report:
   - `status = valid`
   - `potReconciliation = pass`
   - `actorOrder = pass`
   - `streetClosure = pass`
   - `requiredResponses = pass`
3. В HTML preview есть колонки `Proof` и `Hand Status`, а proof summary реально отображается в строке inferred action.

## Residual Risk

1. На smoke baseline в `reconstruction.meta.invalid_hands` остается `1` invalid hand.
2. Это не regression текущего change; наоборот, текущий validator теперь явно выводит такие случаи в review вместо silent auto-accept.
3. `hh-draft.json` все еще строится из canonical extractor output, не из reconstruction output.

## Verdict

Verify Gate пройден.

Change готов к `/sync`, если принимаем текущий wave-1 scope с явным review path для invalid hands.
