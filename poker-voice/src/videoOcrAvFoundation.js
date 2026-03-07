import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HELPER_SOURCE_PATH = fileURLToPath(new URL('../scripts/video-ocr-helper.m', import.meta.url));
const HELPER_BINARY_PATH = '/tmp/video-hh-ocr-helper';
const MODULE_CACHE_PATH = '/tmp/clang-modcache';

function ensureModuleCacheDir() {
  fs.mkdirSync(MODULE_CACHE_PATH, { recursive: true });
}

function needsRebuild(sourcePath, binaryPath) {
  if (!fs.existsSync(binaryPath)) return true;
  const sourceStat = fs.statSync(sourcePath);
  const binaryStat = fs.statSync(binaryPath);
  return sourceStat.mtimeMs > binaryStat.mtimeMs;
}

function compileHelper(sourcePath, binaryPath) {
  ensureModuleCacheDir();
  const args = [
    '-fobjc-arc',
    '-fmodules',
    '-fmodules-cache-path=/tmp/clang-modcache',
    '-framework', 'Foundation',
    '-framework', 'AVFoundation',
    '-framework', 'Vision',
    '-framework', 'CoreImage',
    '-framework', 'CoreMedia',
    '-framework', 'CoreVideo',
    sourcePath,
    '-o', binaryPath
  ];

  const result = spawnSync('clang', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`video-ocr helper compile failed: ${String(result.stderr || result.stdout || '').trim()}`);
  }
}

function ensureHelperReady() {
  if (needsRebuild(HELPER_SOURCE_PATH, HELPER_BINARY_PATH)) {
    compileHelper(HELPER_SOURCE_PATH, HELPER_BINARY_PATH);
  }
}

function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function readFramesWithAvFoundationOcr({ videoPath, sampleMs = 1000, maxFrames = 600 } = {}) {
  const absVideoPath = path.resolve(String(videoPath || '').trim());
  if (!absVideoPath) {
    throw new Error('videoPath is required for AVFoundation OCR extraction.');
  }
  if (!fs.existsSync(absVideoPath)) {
    throw new Error(`videoPath does not exist: ${absVideoPath}`);
  }

  ensureHelperReady();

  const result = spawnSync(
    HELPER_BINARY_PATH,
    [absVideoPath, String(Math.max(100, Math.trunc(sampleMs))), String(Math.max(1, Math.trunc(maxFrames)))],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
  );

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
    warnings.push({ type: 'stderr', stage: 'helper', message: stderrText });
  }

  if (result.status !== 0 || errors.length) {
    const topError = errors[0];
    const message = topError?.message
      || stderrText
      || `video-ocr helper failed with status ${String(result.status)}`;
    const error = new Error(message);
    error.details = {
      status: result.status,
      meta,
      warnings,
      errors,
      framesSampled: frames.length
    };
    throw error;
  }

  return {
    meta,
    frames,
    done,
    warnings
  };
}
