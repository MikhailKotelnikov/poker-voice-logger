import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PY_HELPER_PATH = fileURLToPath(new URL('../scripts/video-ocr-helper.py', import.meta.url));

function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\u0000/g, '').trim();
}

function parsePotFromFrameLines(lines = []) {
  if (!Array.isArray(lines)) return null;
  for (const line of lines) {
    const text = normalizeText(line?.text || line);
    if (!text) continue;
    const match = text.match(/\bpot\s*([0-9][0-9,\.]*)\b/i) || text.match(/\bpot([0-9][0-9,\.]*)\b/i);
    if (!match) continue;
    const numeric = Number(String(match[1]).replace(/,/g, ''));
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  return null;
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

function parseHelperResult(result, stage = 'python_helper') {
  const payloads = String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => safeJsonParse(line))
    .filter(Boolean);

  const warnings = [];
  const frames = [];
  const errors = [];
  let meta = null;
  let done = null;

  for (const item of payloads) {
    if (item.type === 'meta') {
      meta = item;
      continue;
    }
    if (item.type === 'warn') {
      warnings.push(item);
      continue;
    }
    if (item.type === 'error') {
      errors.push(item);
      continue;
    }
    if (item.type === 'frame') {
      frames.push(item);
      continue;
    }
    if (item.type === 'done') {
      done = item;
    }
  }

  const stderrText = String(result.stderr || '').trim();
  if (stderrText) {
    warnings.push({ type: 'stderr', stage, message: stderrText });
  }

  return {
    status: Number(result.status),
    payloads,
    warnings,
    frames,
    errors,
    meta,
    done
  };
}

function runPythonHelperPass({
  absVideoPath,
  sampleMs,
  maxFrames,
  env,
  startMs = 0,
  endMs = null
} = {}) {
  const args = [
    PY_HELPER_PATH,
    absVideoPath,
    String(Math.max(100, Math.trunc(sampleMs))),
    String(Math.max(1, Math.trunc(maxFrames))),
    String(Math.max(0, Math.round(Number(startMs) || 0)))
  ];
  if (endMs !== null && endMs !== undefined && Number.isFinite(Number(endMs)) && Number(endMs) >= 0) {
    args.push(String(Math.max(0, Math.round(Number(endMs)))));
  }

  const result = spawnSync(
    'python3',
    args,
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, env }
  );

  return parseHelperResult(result, 'python_helper');
}

function detectAdaptiveIntervals(frames = [], sampleMs = 1000) {
  if (!Array.isArray(frames) || frames.length < 2) return [];
  const sorted = [...frames].sort((a, b) => Number(a?.ms || 0) - Number(b?.ms || 0));
  const gapFloor = Math.max(700, Math.floor(sampleMs * 0.8));
  const intervals = [];

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevMs = Math.max(0, Math.round(Number(prev?.ms || 0)));
    const currMs = Math.max(0, Math.round(Number(curr?.ms || 0)));
    const gapMs = currMs - prevMs;
    if (gapMs < gapFloor) continue;

    const prevPot = parsePotFromFrameLines(prev?.lines);
    const currPot = parsePotFromFrameLines(curr?.lines);
    if (!Number.isFinite(prevPot) || !Number.isFinite(currPot)) continue;
    if (currPot <= prevPot * 0.55) continue;

    const delta = currPot - prevPot;
    const ratio = prevPot > 0 ? currPot / prevPot : Number.POSITIVE_INFINITY;
    const suspiciousGrowth = delta >= Math.max(500, prevPot * 0.9) || ratio >= 1.9;
    if (!suspiciousGrowth) continue;

    intervals.push({
      start_ms: prevMs,
      end_ms: currMs,
      prev_pot: prevPot,
      curr_pot: currPot,
      reason: 'pot_jump_gap'
    });
  }

  if (!intervals.length) return [];
  intervals.sort((a, b) => a.start_ms - b.start_ms);
  const merged = [];
  for (const interval of intervals) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push({ ...interval });
      continue;
    }
    if (interval.start_ms <= prev.end_ms + Math.max(300, Math.floor(sampleMs * 0.5))) {
      prev.end_ms = Math.max(prev.end_ms, interval.end_ms);
      prev.curr_pot = Math.max(prev.curr_pot, interval.curr_pot);
      continue;
    }
    merged.push({ ...interval });
  }
  return merged.slice(0, 12);
}

function mergeFramesByMs(frames = []) {
  const byMs = new Map();
  for (const frame of frames) {
    const ms = Math.max(0, Math.round(Number(frame?.ms || 0)));
    const prev = byMs.get(ms);
    const score = Number(frame?.observation_count || (Array.isArray(frame?.lines) ? frame.lines.length : 0));
    const prevScore = Number(prev?.observation_count || (Array.isArray(prev?.lines) ? prev.lines.length : 0));
    if (!prev || score >= prevScore) {
      byMs.set(ms, {
        ...frame,
        ms
      });
    }
  }
  return [...byMs.values()].sort((a, b) => Number(a?.ms || 0) - Number(b?.ms || 0));
}

export function readFramesWithPythonOcr({ videoPath, sampleMs = 1000, maxFrames = 600 } = {}) {
  const absVideoPath = path.resolve(String(videoPath || '').trim());
  if (!absVideoPath) {
    throw new Error('videoPath is required for Python OCR extraction.');
  }
  if (!fs.existsSync(absVideoPath)) {
    throw new Error(`videoPath does not exist: ${absVideoPath}`);
  }

  const env = { ...process.env };
  const pythonPaths = candidatePythonPaths();
  if (pythonPaths.length) {
    env.PYTHONPATH = pythonPaths.join(':');
  }

  const primary = runPythonHelperPass({
    absVideoPath,
    sampleMs,
    maxFrames,
    env,
    startMs: 0,
    endMs: null
  });

  const warnings = [...primary.warnings];
  let frames = [...primary.frames];

  if (primary.status !== 0 || primary.errors.length) {
    const topError = primary.errors[0];
    const message = topError?.message
      || `video-ocr python helper failed with status ${String(primary.status)}`;
    const error = new Error(message);
    error.details = {
      status: primary.status,
      meta: primary.meta,
      warnings,
      errors: primary.errors,
      framesSampled: frames.length,
      pythonPaths
    };
    throw error;
  }

  const baseSampleMs = Math.max(100, Math.trunc(sampleMs));
  const intervals = detectAdaptiveIntervals(primary.frames, baseSampleMs);
  let adaptiveRefineRuns = 0;
  let adaptiveFailures = 0;
  const refineSampleMs = Math.max(250, Math.floor(baseSampleMs / 2));

  for (const interval of intervals) {
    const intervalLength = Math.max(1, interval.end_ms - interval.start_ms);
    const refineMaxFrames = Math.min(
      180,
      Math.max(6, Math.ceil(intervalLength / refineSampleMs) + 2)
    );

    try {
      const refined = runPythonHelperPass({
        absVideoPath,
        sampleMs: refineSampleMs,
        maxFrames: refineMaxFrames,
        env,
        startMs: interval.start_ms,
        endMs: interval.end_ms
      });
      if (refined.status !== 0 || refined.errors.length) {
        adaptiveFailures += 1;
        warnings.push({
          type: 'adaptive_refine_warning',
          stage: 'adaptive_refine',
          interval,
          message: refined.errors[0]?.message || `refine pass failed with status ${refined.status}`
        });
        continue;
      }
      adaptiveRefineRuns += 1;
      warnings.push(...(refined.warnings || []).map((warning) => ({
        ...warning,
        stage: 'adaptive_refine'
      })));
      frames.push(...refined.frames);
    } catch (error) {
      adaptiveFailures += 1;
      warnings.push({
        type: 'adaptive_refine_warning',
        stage: 'adaptive_refine',
        interval,
        message: error?.message || 'adaptive refine pass failed.'
      });
    }
  }

  const mergedFrames = mergeFramesByMs(frames);
  const adaptiveExtraFrames = Math.max(0, mergedFrames.length - primary.frames.length);

  return {
    meta: {
      ...(primary.meta || {}),
      adaptive_intervals: intervals.length,
      adaptive_refine_runs: adaptiveRefineRuns,
      adaptive_failures: adaptiveFailures,
      adaptive_refine_sample_ms: refineSampleMs,
      adaptive_extra_frames: adaptiveExtraFrames
    },
    frames: mergedFrames,
    done: primary.done,
    warnings,
    pythonPaths
  };
}
