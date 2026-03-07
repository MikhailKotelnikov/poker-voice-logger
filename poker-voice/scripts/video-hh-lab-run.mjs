import fs from 'node:fs';
import path from 'node:path';

import { buildPlaceholderCanonicalRun, validateCanonicalRun } from '../src/videoContract.js';
import { computeVideoLabMetrics } from '../src/videoLabMetrics.js';
import { buildHhDraftFromCanonical } from '../src/videoHhDraft.js';
import { extractCanonicalRunFromVideo } from '../src/videoBaselineExtractor.js';
import { buildReconstructionRun } from '../src/videoReconstruction.js';
import { generateVideoLabPreview } from '../src/videoLabPreview.js';

function parseArgs(argv) {
  const out = {
    video: '',
    labels: '',
    outDir: path.resolve(process.cwd(), 'reports', 'video-hh-lab'),
    sampleMs: 1000,
    maxFrames: 600,
    strictExtractor: false,
    preview: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--video') {
      out.video = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (token === '--labels') {
      out.labels = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (token === '--out') {
      const raw = String(argv[i + 1] || '').trim();
      if (raw) out.outDir = path.resolve(raw);
      i += 1;
      continue;
    }
    if (token === '--sample-ms') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        out.sampleMs = Math.max(100, Math.trunc(value));
      }
      i += 1;
      continue;
    }
    if (token === '--max-frames') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        out.maxFrames = Math.max(1, Math.trunc(value));
      }
      i += 1;
      continue;
    }
    if (token === '--strict-extractor') {
      out.strictExtractor = true;
      continue;
    }
    if (token === '--preview') {
      out.preview = true;
    }
  }

  return out;
}

function makeRunId(date = new Date()) {
  const iso = date.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
  const rand = Math.random().toString(36).slice(2, 8);
  return `video-lab-${iso}-${rand}`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readOptionalJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function usage() {
  console.log('Usage: node scripts/video-hh-lab-run.mjs --video <path> [--labels <path>] [--out <dir>] [--sample-ms <n>] [--max-frames <n>] [--strict-extractor] [--preview]');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.video) {
    usage();
    process.exitCode = 1;
    return;
  }

  const videoPath = path.resolve(args.video);
  if (!fs.existsSync(videoPath)) {
    console.error(`Video file not found: ${videoPath}`);
    process.exitCode = 1;
    return;
  }

  const stat = fs.statSync(videoPath);
  const runId = makeRunId();
  const runDir = path.join(args.outDir, runId);
  ensureDir(runDir);

  const errors = [];
  let extractorError = null;

  let predicted;
  try {
    predicted = extractCanonicalRunFromVideo({
      videoPath,
      sizeBytes: stat.size,
      createdAtIso: stat.mtime.toISOString(),
      sampleMs: args.sampleMs,
      maxFrames: args.maxFrames
    });
  } catch (error) {
    extractorError = error;
    errors.push({
      stage: 'extractor',
      code: 'baseline_extractor_failed',
      path: 'video',
      message: error?.message || 'Baseline extractor failed.'
    });

    const details = error?.details || {};
    if (Array.isArray(details?.errors)) {
      errors.push(...details.errors.map((item) => ({ stage: 'extractor_helper', ...item })));
    }
    if (Array.isArray(details?.warnings)) {
      errors.push(...details.warnings.map((item) => ({ stage: 'extractor_warning', ...item })));
    }

    predicted = buildPlaceholderCanonicalRun({
      videoPath,
      sizeBytes: stat.size,
      createdAtIso: stat.mtime.toISOString()
    });
    predicted.meta = {
      ...(predicted.meta || {}),
      extractor_stage: 'baseline_ocr_failed_fallback',
      extractor_error: error?.message || 'unknown'
    };
  }

  const predictedValidation = validateCanonicalRun(predicted);
  if (!predictedValidation.ok) {
    errors.push(...predictedValidation.errors.map((error) => ({ stage: 'predicted_validation', ...error })));
  }

  let labelsPayload = null;
  let labelsPath = '';
  if (args.labels) {
    labelsPath = path.resolve(args.labels);
    try {
      labelsPayload = readOptionalJson(labelsPath);
    } catch (error) {
      errors.push({
        stage: 'labels_load',
        code: 'labels_parse_error',
        path: 'labels',
        message: error?.message || 'Failed to parse labels JSON.'
      });
      labelsPayload = {};
    }
  }

  const metrics = computeVideoLabMetrics({
    predicted,
    labeled: labelsPayload
  });

  if (metrics.status === 'invalid_labels' && Array.isArray(metrics.errors)) {
    errors.push(...metrics.errors.map((error) => ({ stage: 'labels_validation', ...error })));
  }

  const reconstruction = buildReconstructionRun(predicted);
  const hhDraft = buildHhDraftFromCanonical(predicted);
  let previewResult = null;

  const manifest = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    extractor_stage: predicted?.meta?.extractor_stage || 'unknown',
    status: extractorError ? 'extractor_error' : metrics.status,
    video: {
      path: videoPath,
      size_bytes: stat.size
    },
    labels: labelsPath || null,
    extraction: {
      sample_ms: args.sampleMs,
      max_frames: args.maxFrames,
      strict_extractor: args.strictExtractor
    },
    reconstruction: {
      enabled: true,
      status: reconstruction?.meta?.invalid_hands ? 'review_required' : 'ok',
      path: path.join(runDir, 'reconstruction.json')
    },
    preview: {
      enabled: args.preview,
      status: 'not_requested',
      html_path: null
    }
  };

  writeJson(path.join(runDir, 'manifest.json'), manifest);
  writeJson(path.join(runDir, 'events.json'), predicted);
  writeJson(path.join(runDir, 'reconstruction.json'), reconstruction);
  writeJson(path.join(runDir, 'metrics.json'), metrics);
  writeJson(path.join(runDir, 'errors.json'), errors);
  writeJson(path.join(runDir, 'hh-draft.json'), hhDraft);

  if (args.preview) {
    try {
      previewResult = generateVideoLabPreview({ runDir });
      manifest.preview = {
        enabled: true,
        status: 'ok',
        html_path: previewResult.htmlPath
      };
    } catch (error) {
      manifest.preview = {
        enabled: true,
        status: 'error',
        html_path: null
      };
      errors.push({
        stage: 'preview',
        code: 'preview_generation_failed',
        path: 'preview',
        message: error?.message || 'Preview generation failed.'
      });
      const details = error?.details || {};
      if (Array.isArray(details?.warnings)) {
        errors.push(...details.warnings.map((item) => ({ stage: 'preview_warning', ...item })));
      }
    }
    writeJson(path.join(runDir, 'errors.json'), errors);
  }

  writeJson(path.join(runDir, 'manifest.json'), manifest);

  console.log(`video-hh-lab run completed: ${runDir}`);
  console.log(`status=${manifest.status} predicted_hands=${metrics.predicted.hands} predicted_events=${metrics.predicted.events}`);
  if (args.preview) {
    if (manifest.preview.status === 'ok') {
      console.log(`preview=${manifest.preview.html_path}`);
    } else {
      console.log('preview=error');
    }
  }

  if (!predictedValidation.ok) {
    process.exitCode = 1;
    return;
  }
  if (args.labels && metrics.status !== 'ok') {
    process.exitCode = 2;
    return;
  }
  if (args.strictExtractor && extractorError) {
    process.exitCode = 3;
    return;
  }
  if (args.preview && manifest.preview.status !== 'ok') {
    process.exitCode = 4;
  }
}

main();
