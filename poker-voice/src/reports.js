import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const REPORT_FIELDS = ['preflop', 'flop', 'turn', 'river', 'presupposition'];
const MAX_TEXT_LEN = 20000;
const MAX_FIELD_LEN = 4000;
const MAX_EDITS = 300;
const MAX_UNRESOLVED_ITEMS = 100;

function clampString(value, maxLen = MAX_TEXT_LEN) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\u0000/g, '').trim().slice(0, maxLen);
}

function normalizeIsoDate(value, fallbackIso) {
  const text = clampString(value, 80);
  if (!text) {
    return fallbackIso;
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) {
    return fallbackIso;
  }
  return new Date(ms).toISOString();
}

function sanitizeParsedFields(input) {
  const source = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const key of REPORT_FIELDS) {
    out[key] = clampString(source[key], MAX_FIELD_LEN);
  }
  return out;
}

function sanitizeParserMeta(input) {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const source = clampString(input.source, 80);
  const model = clampString(input.model, 120);
  const semanticError = clampString(input.semanticError, 500);
  const unresolved = Array.isArray(input.unresolved)
    ? input.unresolved
      .map((item) => clampString(String(item), 240))
      .filter(Boolean)
      .slice(0, MAX_UNRESOLVED_ITEMS)
    : [];

  const confidenceRaw = Number(input.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : null;

  if (!source && !model && confidence === null && unresolved.length === 0 && !semanticError) {
    return null;
  }

  return {
    source,
    model,
    confidence,
    unresolved,
    semanticError
  };
}

function sanitizeEditItem(input, nowIso) {
  const source = input && typeof input === 'object' ? input : {};
  const typeRaw = clampString(source.type, 40).toLowerCase();
  const allowedTypes = new Set(['redictate', 'manual_edit', 'manual_override', 'system_fix']);
  const type = allowedTypes.has(typeRaw) ? typeRaw : 'manual_edit';
  const fieldRaw = clampString(source.field, 40).toLowerCase();
  const field = REPORT_FIELDS.includes(fieldRaw) ? fieldRaw : '';

  return {
    type,
    field,
    at: normalizeIsoDate(source.at, nowIso),
    transcript: clampString(source.transcript, MAX_TEXT_LEN),
    previousValue: clampString(source.previousValue, MAX_FIELD_LEN),
    newValue: clampString(source.newValue, MAX_FIELD_LEN),
    parser: sanitizeParserMeta(source.parser)
  };
}

export function sanitizeReportPayload(payload, nowIso = new Date().toISOString()) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const opponent = clampString(source.opponent, 160);
  if (!opponent) {
    throw new Error('Некорректный report: opponent обязателен.');
  }

  const rowRaw = Number(source.row);
  const row = Number.isFinite(rowRaw) && rowRaw >= 2 ? Math.trunc(rowRaw) : null;

  const edits = Array.isArray(source.edits)
    ? source.edits
      .slice(0, MAX_EDITS)
      .map((item) => sanitizeEditItem(item, nowIso))
    : [];

  return {
    version: 1,
    source: clampString(source.source, 80) || 'poker-voice-web',
    sessionId: clampString(source.sessionId, 120),
    createdAt: normalizeIsoDate(source.createdAt, nowIso),
    savedAt: normalizeIsoDate(source.savedAt, nowIso),
    opponent,
    row,
    initialTranscript: clampString(source.initialTranscript, MAX_TEXT_LEN),
    finalTranscript: clampString(source.finalTranscript, MAX_TEXT_LEN),
    initialParsed: sanitizeParsedFields(source.initialParsed),
    finalParsed: sanitizeParsedFields(source.finalParsed),
    parser: sanitizeParserMeta(source.parser),
    edits
  };
}

export function createReportRecord(payload, nowIso = new Date().toISOString()) {
  const sanitized = sanitizeReportPayload(payload, nowIso);
  const id = `report_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  return {
    id,
    ...sanitized
  };
}

export function appendReportJsonl(filePath, reportRecord) {
  if (!filePath) {
    throw new Error('REPORTS_PATH не задан.');
  }
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, `${JSON.stringify(reportRecord)}\n`, 'utf8');
  return { path: target };
}
