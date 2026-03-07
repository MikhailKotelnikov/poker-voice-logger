import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FRAME_EXPORT_HELPER_PATH = fileURLToPath(new URL('../scripts/video-frame-export.py', import.meta.url));
const TERMINAL_ACTIONS = new Set(['fold', 'allin', 'call_allin', 'bet_allin', 'raise_allin']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function summarizeProof(proof = null) {
  if (!proof || typeof proof !== 'object') return '';
  const potBefore = Number.isFinite(Number(proof.pot_before)) ? Number(proof.pot_before) : null;
  const potAfter = Number.isFinite(Number(proof.pot_after)) ? Number(proof.pot_after) : null;
  const amount = Number.isFinite(Number(proof.amount)) ? Number(proof.amount) : null;
  const fromMs = Number.isFinite(Number(proof.anchor_from_frame_ms)) ? Number(proof.anchor_from_frame_ms) : null;
  const toMs = Number.isFinite(Number(proof.anchor_to_frame_ms)) ? Number(proof.anchor_to_frame_ms) : null;
  const responders = Array.isArray(proof.pending_responders)
    ? proof.pending_responders.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  const parts = [];
  if (potBefore !== null && potAfter !== null) parts.push(`${potBefore} -> ${potAfter}`);
  if (amount !== null) parts.push(`delta=${amount}`);
  if (responders.length) parts.push(`pending=${responders.join('/')}`);
  if (fromMs !== null && toMs !== null) parts.push(`anchor=${fromMs}->${toMs}`);
  if (proof.chosen_resolution) parts.push(`resolution=${String(proof.chosen_resolution)}`);
  return parts.join(' | ');
}

function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function candidatePythonPaths() {
  const values = [];
  const envPath = String(process.env.VIDEO_OCR_PYTHONPATH || '').trim();
  if (envPath) values.push(envPath);
  const cwdDeps = path.resolve(process.cwd(), '.deps');
  if (fs.existsSync(cwdDeps)) values.push(cwdDeps);
  const repoDeps = path.resolve(process.cwd(), '..', '.deps');
  if (fs.existsSync(repoDeps)) values.push(repoDeps);
  const tmpDeps = '/tmp/codex-video-hh-lab/.deps';
  if (fs.existsSync(tmpDeps)) values.push(tmpDeps);
  return [...new Set(values)];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function flattenEvents(payload) {
  const rows = [];
  const hands = Array.isArray(payload?.hands) ? payload.hands : [];
  let globalEventIndex = 1;
  for (let handIndex = 0; handIndex < hands.length; handIndex += 1) {
    const hand = hands[handIndex];
    const events = Array.isArray(hand?.events) ? hand.events : [];
    const handValidationStatus = String(hand?.validation?.status || '').trim();
    const handValidationChecks = hand?.validation?.checks && typeof hand.validation.checks === 'object'
      ? hand.validation.checks
      : {};
    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
      const event = events[eventIndex];
      rows.push({
        handId: String(hand?.hand_id || `hand_${handIndex + 1}`),
        handIndex: handIndex + 1,
        eventIndex: globalEventIndex,
        handEventIndex: eventIndex + 1,
        eventId: String(event?.event_id || ''),
        street: String(event?.street || 'unknown'),
        actor: String(event?.actor || ''),
        action: String(event?.action || ''),
        sizeBb: event?.size_bb === null || event?.size_bb === undefined ? '' : String(event.size_bb),
        confidence: Number.isFinite(Number(event?.confidence)) ? Number(event.confidence).toFixed(2) : '',
        frameMs: Math.max(0, Math.round(Number(event?.evidence?.frame_ms || 0))),
        focusActorDetected: String(event?.evidence?.focus_actor || event?.focus_actor || ''),
        resolutionState: String(event?.resolution_state || 'committed').toLowerCase() || 'committed',
        reasonCodes: Array.isArray(event?.reason_codes)
          ? event.reason_codes.map((value) => String(value || '').trim()).filter(Boolean)
          : [],
        proof: event?.proof && typeof event.proof === 'object' ? { ...event.proof } : null,
        proofSummary: summarizeProof(event?.proof),
        handValidationStatus,
        handValidationChecks,
        framePot: Number.isFinite(Number(event?.evidence?.frame_pot)) ? Number(event.evidence.frame_pot) : null,
        textRaw: String(event?.evidence?.text_raw || '')
      });
      globalEventIndex += 1;
    }
  }
  return rows;
}

export function resolveFocusActors(rows = [], sampleMs = 1000) {
  if (!Array.isArray(rows) || !rows.length) return rows;

  const rowsByHand = new Map();
  for (const row of rows) {
    const key = String(row.handId || row.handIndex || '');
    if (!rowsByHand.has(key)) rowsByHand.set(key, []);
    rowsByHand.get(key).push(row);
  }

  for (const handRows of rowsByHand.values()) {
    handRows.sort((left, right) => {
      const msDiff = Number(left.frameMs) - Number(right.frameMs);
      if (msDiff !== 0) return msDiff;
      return Number(left.eventIndex) - Number(right.eventIndex);
    });

    const frameGroups = [];
    let current = null;
    for (const row of handRows) {
      const frameMs = Number(row.frameMs);
      if (!current || Number(current.frameMs) !== frameMs) {
        current = { frameMs, rows: [row] };
        frameGroups.push(current);
      } else {
        current.rows.push(row);
      }
    }

    for (let groupIndex = 0; groupIndex < frameGroups.length; groupIndex += 1) {
      const group = frameGroups[groupIndex];
      const detected = group.rows
        .map((row) => String(row.focusActorDetected || '').trim())
        .find(Boolean);
      const nextGroup = frameGroups[groupIndex + 1] || null;
      const nextActor = String(nextGroup?.rows?.[0]?.actor || '').trim();
      const nextGapMs = nextGroup
        ? Number(nextGroup.frameMs) - Number(group.frameMs)
        : Number.POSITIVE_INFINITY;
      const canUseNextGroup = nextGroup
        && nextActor
        && Number.isFinite(nextGapMs)
        && nextGapMs >= 0;
      const lastActorInGroup = String(group.rows[group.rows.length - 1]?.actor || '').trim();
      const isLastFrameGroup = !nextGroup;
      const prevGroup = frameGroups[groupIndex - 1] || null;
      const hasTerminalResolutionEvent = group.rows.some((row) => TERMINAL_ACTIONS.has(String(row?.action || '').trim().toLowerCase()));
      if (isLastFrameGroup && hasTerminalResolutionEvent) {
        for (const row of group.rows) {
          row.focusActor = 'none';
          row.focusSource = 'terminal_focus_none';
        }
        continue;
      }

      const stalePreflopResponseRow = group.rows.find((row) => {
        if (String(row?.resolutionState || '').trim().toLowerCase() !== 'committed') return false;
        const action = String(row?.action || '').trim().toLowerCase();
        if (String(row?.street || '').trim().toLowerCase() !== 'preflop') return false;
        if (action !== 'call' && action !== 'raise' && action !== 'allin') return false;
        const currPot = Number(row?.framePot);
        const prevPot = Number(prevGroup?.rows?.[prevGroup.rows.length - 1]?.framePot);
        if (!Number.isFinite(currPot) || !Number.isFinite(prevPot)) return false;
        return currPot <= prevPot * 1.001;
      });
      if (stalePreflopResponseRow) {
        const lockActor = String(stalePreflopResponseRow.actor || '').trim();
        for (const row of group.rows) {
          row.focusActor = lockActor || String(row.actor || '').trim();
          row.focusSource = 'stale_preflop_response_actor_lock';
          if (String(row.resolutionState || '').toLowerCase() === 'committed') {
            row.resolutionState = 'pending';
          }
          if (!Array.isArray(row.reasonCodes)) row.reasonCodes = [];
          if (!row.reasonCodes.includes('pending_preflop_response_without_pot_growth')) {
            row.reasonCodes.push('pending_preflop_response_without_pot_growth');
          }
        }
        continue;
      }

      const inferredRowActor = group.rows
        .find((row) => String(row?.resolutionState || '').trim().toLowerCase() === 'inferred')?.actor || '';
      if (inferredRowActor) {
        const inferredActor = String(inferredRowActor).trim();
        for (const row of group.rows) {
          row.focusActor = inferredActor || String(row.actor || '').trim();
          row.focusSource = 'inferred_actor_locked';
        }
        continue;
      }

      if (detected) {
        const looksStaleForPostfactumFrame = canUseNextGroup
          && detected === lastActorInGroup;
        if (looksStaleForPostfactumFrame) {
          for (const row of group.rows) {
            row.focusActor = nextActor;
            row.focusSource = 'frame_inferred_override_stale_detected';
          }
          continue;
        }
        for (const row of group.rows) {
          row.focusActor = detected;
          row.focusSource = 'ocr_detected';
        }
        continue;
      }

      if (canUseNextGroup) {
        for (const row of group.rows) {
          row.focusActor = nextActor;
          row.focusSource = 'frame_inferred_next_frame_actor';
        }
        continue;
      }

      const fallbackActor = String(group.rows[group.rows.length - 1]?.actor || '').trim();
      for (const row of group.rows) {
        row.focusActor = fallbackActor;
        row.focusSource = 'fallback_actor';
      }
    }
  }

  return rows;
}

function confidenceBand(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'unknown';
  if (numeric >= 0.9) return 'high';
  if (numeric >= 0.75) return 'medium';
  return 'low';
}

function confidenceBandRu(value) {
  const band = confidenceBand(value);
  if (band === 'high') return 'высокая';
  if (band === 'medium') return 'средняя';
  if (band === 'low') return 'низкая';
  return 'неизвестно';
}

function isPendingDecisionRow(row = {}) {
  return String(row?.resolutionState || '').toLowerCase() === 'pending'
    && Array.isArray(row?.reasonCodes)
    && row.reasonCodes.includes('pending_preflop_response_without_pot_growth');
}

function describeActionOptionsRu(row = {}) {
  const action = String(row.action || '').toLowerCase();
  if (isPendingDecisionRow(row)) return 'fold, call, raise';
  if (action === 'raise' || action === 'bet' || action === 'allin' || action === 'bet_allin' || action === 'raise_allin') {
    return 'fold, call, raise';
  }
  if (action === 'check') return 'check или bet';
  if (action === 'call' || action === 'call_allin') return 'переход хода дальше или смена улицы';
  if (action === 'fold') return 'ход переходит следующему активному игроку';
  return 'варианты не определены';
}

function formatPastLockedRu(items = []) {
  if (!Array.isArray(items) || !items.length) return 'новая раздача, до этого в этой строке ничего не зафиксировано';
  return items.join('; ');
}

function buildDisplayAction(row = {}) {
  if (isPendingDecisionRow(row)) {
    return 'ожидание решения';
  }
  return String(row.action || '');
}

function describeExpectedFlow(row = {}, nextRow = null) {
  const focusActor = String(row.focusActor || '').trim();
  const options = describeActionOptionsRu(row);
  const focusHint = focusActor && focusActor !== 'none' ? focusActor : 'нет активного фокуса';

  if (!nextRow || String(nextRow.handId || '') !== String(row.handId || '')) {
    return `сейчас в фокусе ${focusHint}; ожидаемые варианты: ${options}; следующего подтвержденного кадра в этой раздаче пока нет`;
  }

  const observedActor = String(nextRow.actor || '').trim();
  const observedAction = String(nextRow.action || '').trim();
  const focusMatch = focusActor && focusActor !== 'none'
    ? (focusActor === observedActor ? 'да' : `нет (${focusActor} -> ${observedActor})`)
    : 'не применимо';
  return `сейчас в фокусе ${focusHint}; ожидаемые варианты: ${options}; следующий подтвержденный кадр: #${nextRow.eventIndex} ${observedActor} ${observedAction}; совпадение с текущим фокусом: ${focusMatch}`;
}

function buildTraceText(row = {}, nextRow = null) {
  const focusLine = row.focusActorDetected
    ? `фокус OCR увидел прямо на игроке ${row.focusActorDetected}`
    : `фокус определен как ${row.focusActor || 'неизвестно'} по правилу ${row.focusSource || 'n/a'}`;
  const potLine = row.framePot !== null && row.framePot !== undefined
    ? `банк в кадре ${row.framePot}`
    : 'банк в кадре не распознан';
  const sizeLine = row.sizeBb !== '' ? `размер действия ${row.sizeBb} bb` : 'точный размер действия не распознан';
  const confidenceLine = `уверенность ${confidenceBandRu(row.confidence)} (${row.confidence || 'n/a'})`;
  const badgeLine = isPendingDecisionRow(row)
    ? `OCR рядом с игроком видит бейдж ${String(row.action || '').toUpperCase()}, но это пока только кандидат на действие`
    : `распознанное действие: ${row.action}`;

  let decision = `Вывод: состояние ${row.resolutionState || 'unknown'}.`;
  if (String(row.resolutionState || '').toLowerCase() === 'committed') {
    decision = 'Вывод: действие считаю зафиксированным, потому что для него уже есть достаточное подтверждение в текущей последовательности кадров.';
  } else if (String(row.resolutionState || '').toLowerCase() === 'inferred') {
    const proofLine = row.proofSummary ? ` Доказательство: ${row.proofSummary}.` : '';
    decision = `Вывод: действие выведено по контексту, причина: ${(row.reasonCodes || []).join(', ') || 'контекстная эвристика'}.${proofLine}`;
  } else if (isPendingDecisionRow(row)) {
    decision = 'Вывод: новое действие еще не зафиксировано. Бейдж действия виден, но банк не вырос относительно предыдущего подтвержденного кадра, поэтому считаю, что игрок еще думает.';
  }

  const pastLocked = formatPastLockedRu(row._pastLockedSummary);
  const expectedFlow = describeExpectedFlow(row, nextRow);

  return [
    `Наблюдение: ${focusLine}; ${potLine}; ${sizeLine}; ${confidenceLine}; ${badgeLine}.`,
    decision,
    `Уже зафиксировано до этого: ${pastLocked}.`,
    `Ожидаем дальше: ${expectedFlow}.`
  ].join('\n');
}

export function buildExplainabilityTrace(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return rows;

  const handHistory = new Map();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const handKey = String(row.handId || row.handIndex || '');
    if (!handHistory.has(handKey)) handHistory.set(handKey, []);
    const history = handHistory.get(handKey);

    row._pastLockedSummary = history.slice(-3);
    const nextRow = rows[index + 1] || null;
    row.displayAction = buildDisplayAction(row);
    row.explainTrace = buildTraceText(row, nextRow);

    history.push(`#${row.eventIndex} ${row.actor} ${row.action}`);
  }

  return rows;
}

function prepareRenderableRows(rows = [], limitEvents = null) {
  const filteredRows = rows.filter((row) => !isPendingDecisionRow(row));
  const limitedRows = limitEvents ? filteredRows.slice(0, limitEvents) : filteredRows;
  for (let index = 0; index < limitedRows.length; index += 1) {
    limitedRows[index].renderEventIndex = index + 1;
  }
  return limitedRows;
}

function renderPreviewHtml({ manifest, rows, frameMap = {}, warnings = [], explainMode = true }) {
  const warningItems = warnings
    .map((item) => `<li>${escapeHtml(item?.message || JSON.stringify(item))}</li>`)
    .join('\n');

  const bodyRows = rows.map((row) => {
    const frameFile = frameMap[String(row.frameMs)] || '';
    const imageCell = frameFile
      ? `<a href="frames/${escapeHtml(frameFile)}" target="_blank" rel="noopener"><img src="frames/${escapeHtml(frameFile)}" alt="frame ${row.frameMs}ms" /></a>`
      : '<span class="muted">no frame</span>';

    return `<tr>
      <td>${row.handIndex}</td>
      <td>${row.renderEventIndex || row.eventIndex}</td>
      <td>${row.handEventIndex}</td>
      <td>${escapeHtml(row.frameMs)}</td>
      <td>${escapeHtml(row.street)}</td>
      <td>${escapeHtml(row.focusActor)}</td>
      <td>${escapeHtml(row.actor)}</td>
      <td>${escapeHtml(row.displayAction || row.action)}</td>
      <td>${escapeHtml(row.resolutionState)}</td>
      <td>${escapeHtml(row.sizeBb)}</td>
      <td>${row.framePot === null ? '' : escapeHtml(row.framePot)}</td>
      <td>${escapeHtml(row.confidence)}</td>
      <td class="text">${escapeHtml(row.reasonCodes.join(', '))}</td>
      <td class="text">${escapeHtml(row.proofSummary || '')}</td>
      <td>${escapeHtml(row.handValidationStatus || '')}</td>
      ${explainMode ? `<td class="trace">${escapeHtml(row.explainTrace || '')}</td>` : ''}
      <td class="text">${escapeHtml(row.textRaw)}</td>
      <td>${imageCell}</td>
    </tr>`;
  }).join('\n');

  const runId = String(manifest?.run_id || 'unknown_run');
  const extractor = String(manifest?.extractor_stage || 'unknown');
  const videoPath = String(manifest?.video?.path || '');
  const generated = String(manifest?.generated_at || '');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Video HH Lab Preview: ${escapeHtml(runId)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 20px; color: #1b1e24; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    .meta { margin: 0 0 14px; color: #4a5568; font-size: 14px; }
    .panel { border: 1px solid #d8dde7; border-radius: 10px; padding: 12px; margin-bottom: 16px; background: #fafcff; }
    .muted { color: #6b7280; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th, td { border: 1px solid #d8dde7; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #eef2f9; position: sticky; top: 0; }
    td.text { max-width: 360px; word-break: break-word; }
    td.trace { max-width: 520px; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    img { width: 180px; height: auto; border-radius: 6px; border: 1px solid #c7cedd; display: block; }
    .empty { padding: 14px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; color: #9a3412; }
  </style>
</head>
<body>
  <h1>Video HH Lab Preview</h1>
  <p class="meta">run_id=${escapeHtml(runId)} | extractor=${escapeHtml(extractor)} | generated=${escapeHtml(generated)}</p>
  <div class="panel">
    <div><strong>Video:</strong> ${escapeHtml(videoPath)}</div>
    <div><strong>Rows:</strong> ${rows.length}</div>
    <div><strong>Frames exported:</strong> ${Object.keys(frameMap).length}</div>
  </div>
  ${warnings.length ? `<div class="panel"><strong>Warnings</strong><ul>${warningItems}</ul></div>` : ''}
  ${rows.length ? `
    <table>
      <thead>
        <tr>
          <th>Hand</th>
          <th># Global</th>
          <th># In Hand</th>
          <th>ms</th>
          <th>Street</th>
          <th>Focus</th>
          <th>Actor</th>
          <th>Action</th>
          <th>State</th>
          <th>Size BB</th>
          <th>Pot</th>
          <th>Conf</th>
          <th>Reasons</th>
          <th>Proof</th>
          <th>Hand Status</th>
          ${explainMode ? '<th>Trace</th>' : ''}
          <th>OCR text</th>
          <th>Frame</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  ` : '<div class="empty">No extracted events in this run.</div>'}
</body>
</html>`;
}

export function generateVideoLabPreview({
  runDir,
  limitEvents = null,
  outputHtmlName = 'index.html',
  includeExplainability = true
} = {}) {
  const absRunDir = path.resolve(String(runDir || '').trim());
  if (!absRunDir) {
    throw new Error('runDir is required for preview generation.');
  }
  const safeOutputHtmlName = path.basename(String(outputHtmlName || 'index.html').trim() || 'index.html');
  const parsedLimit = Number(limitEvents);
  const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.max(1, Math.round(parsedLimit))
    : null;

  const manifestPath = path.join(absRunDir, 'manifest.json');
  const eventsPath = path.join(absRunDir, 'events.json');
  const reconstructionPath = path.join(absRunDir, 'reconstruction.json');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(eventsPath)) {
    throw new Error(`Run artifacts not found in directory: ${absRunDir}`);
  }

  const manifest = readJson(manifestPath);
  const payloadPath = fs.existsSync(reconstructionPath) ? reconstructionPath : eventsPath;
  const eventsPayload = readJson(payloadPath);
  const videoPath = path.resolve(String(manifest?.video?.path || eventsPayload?.video?.path || '').trim());
  if (!videoPath || !fs.existsSync(videoPath)) {
    throw new Error(`Video file does not exist for preview: ${videoPath}`);
  }

  const previewDir = path.join(absRunDir, 'preview');
  const framesDir = path.join(previewDir, 'frames');
  ensureDir(framesDir);

  const env = { ...process.env };
  const pythonPaths = candidatePythonPaths();
  if (pythonPaths.length) {
    env.PYTHONPATH = pythonPaths.join(':');
  }

  const exportResult = spawnSync(
    'python3',
    [FRAME_EXPORT_HELPER_PATH, videoPath, payloadPath, framesDir],
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, env }
  );

  const payloads = String(exportResult.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => safeJsonParse(line))
    .filter(Boolean);

  const warnings = [];
  let done = null;
  let topError = null;
  for (const item of payloads) {
    if (item.type === 'error' && !topError) topError = item;
    if (item.type === 'done') done = item;
  }

  if (String(exportResult.stderr || '').trim()) {
    warnings.push({ stage: 'stderr', message: String(exportResult.stderr || '').trim() });
  }

  if (topError || exportResult.status !== 0) {
    const error = new Error(topError?.message || `frame export failed with status ${exportResult.status}`);
    error.details = { status: exportResult.status, topError, warnings, payloads };
    throw error;
  }

  if (Array.isArray(done?.warnings)) warnings.push(...done.warnings);

  const sampleMs = Math.max(100, Number(manifest?.extraction?.sample_ms || 1000));
  const resolvedRows = resolveFocusActors(flattenEvents(eventsPayload), sampleMs);
  const pendingRows = resolvedRows.filter((row) => isPendingDecisionRow(row));
  const renderedRows = prepareRenderableRows(resolvedRows, effectiveLimit);
  if (includeExplainability) {
    buildExplainabilityTrace(renderedRows);
  }
  const frameMap = done?.frame_map && typeof done.frame_map === 'object' ? done.frame_map : {};

  const html = renderPreviewHtml({
    manifest,
    rows: renderedRows,
    frameMap,
    warnings,
    explainMode: Boolean(includeExplainability)
  });
  const htmlPath = path.join(previewDir, safeOutputHtmlName);
  fs.writeFileSync(htmlPath, html, 'utf8');

  const previewJson = {
    generated_at: new Date().toISOString(),
    run_dir: absRunDir,
    video_path: videoPath,
    event_rows_total: resolvedRows.length,
    pending_rows_hidden: pendingRows.length,
    event_rows_rendered: renderedRows.length,
    limit_events: effectiveLimit,
    html_file: safeOutputHtmlName,
    frames_exported: Object.keys(frameMap).length,
    focus_detected_rows: renderedRows.filter((row) => row.focusSource === 'ocr_detected').length,
    focus_inferred_rows: renderedRows.filter((row) => row.focusSource !== 'ocr_detected').length,
    inferred_rows: renderedRows.filter((row) => row.resolutionState === 'inferred').length,
    explainability_rows: includeExplainability
      ? renderedRows.filter((row) => String(row.explainTrace || '').trim()).length
      : 0,
    warnings
  };
  fs.writeFileSync(path.join(previewDir, 'preview.json'), `${JSON.stringify(previewJson, null, 2)}\n`, 'utf8');

  return {
    previewDir,
    htmlPath,
    frameCount: Object.keys(frameMap).length,
    eventCount: renderedRows.length,
    totalEventCount: resolvedRows.length,
    warnings
  };
}
