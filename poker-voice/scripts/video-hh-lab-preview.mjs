import path from 'node:path';
import { generateVideoLabPreview } from '../src/videoLabPreview.js';

function parseArgs(argv) {
  const out = {
    runDir: '',
    limitEvents: null,
    outputHtmlName: 'index.html',
    includeExplainability: true
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--run') {
      out.runDir = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (token === '--limit') {
      const numeric = Number(argv[i + 1]);
      out.limitEvents = Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
      i += 1;
      continue;
    }
    if (token === '--out') {
      out.outputHtmlName = String(argv[i + 1] || '').trim() || 'index.html';
      i += 1;
      continue;
    }
    if (token === '--no-explain') {
      out.includeExplainability = false;
    }
  }
  return out;
}

function usage() {
  console.log('Usage: node scripts/video-hh-lab-preview.mjs --run <runDir> [--limit <n>] [--out <html-file>] [--no-explain]');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.runDir) {
    usage();
    process.exitCode = 1;
    return;
  }

  const runDir = path.resolve(args.runDir);
  const result = generateVideoLabPreview({
    runDir,
    limitEvents: args.limitEvents,
    outputHtmlName: args.outputHtmlName,
    includeExplainability: args.includeExplainability
  });
  console.log(`preview generated: ${result.htmlPath}`);
  console.log(`frames=${result.frameCount} events=${result.eventCount}/${result.totalEventCount} warnings=${result.warnings.length}`);
}

main();
