import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendReportJsonl,
  createReportRecord,
  sanitizeReportPayload
} from '../src/reports.js';

test('sanitizeReportPayload validates opponent and normalizes edits', () => {
  const now = '2026-02-15T12:00:00.000Z';
  const payload = sanitizeReportPayload({
    opponent: 'orio',
    row: 123,
    initialTranscript: 'raw stt',
    finalTranscript: 'edited text',
    initialParsed: { flop: 'cb33' },
    finalParsed: { flop: 'xr100', river: '0t b100 bluff' },
    edits: [
      {
        type: 'redictate',
        field: 'flop',
        transcript: 'new flop line',
        previousValue: 'cb33',
        newValue: 'xr100',
        at: '2026-02-15T11:00:00.000Z'
      }
    ]
  }, now);

  assert.equal(payload.opponent, 'orio');
  assert.equal(payload.row, 123);
  assert.equal(payload.initialParsed.flop, 'cb33');
  assert.equal(payload.finalParsed.flop, 'xr100');
  assert.equal(payload.edits.length, 1);
  assert.equal(payload.edits[0].type, 'redictate');
  assert.equal(payload.edits[0].field, 'flop');
  assert.equal(payload.edits[0].at, '2026-02-15T11:00:00.000Z');
});

test('createReportRecord + appendReportJsonl persist one jsonl line', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-report-'));
  const reportPath = path.join(tmpDir, 'nots_reports.jsonl');

  const report = createReportRecord({
    opponent: 'shipitholaaaa',
    row: 942,
    initialTranscript: 'dictation',
    finalTranscript: 'final',
    finalParsed: { river: '0t b75 bluff' }
  }, '2026-02-15T12:05:00.000Z');

  const saved = appendReportJsonl(reportPath, report);
  assert.equal(saved.path, reportPath);

  const raw = fs.readFileSync(reportPath, 'utf8').trim();
  assert.ok(raw.length > 0);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.id, report.id);
  assert.equal(parsed.opponent, 'shipitholaaaa');
  assert.equal(parsed.finalParsed.river, '0t b75 bluff');
});

test('sanitizeReportPayload throws when opponent is empty', () => {
  assert.throws(
    () => sanitizeReportPayload({ opponent: '   ' }),
    /opponent обязателен/
  );
});
