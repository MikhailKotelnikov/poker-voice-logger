import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildSheetRangeUrl,
  normalizeFieldContent,
  normalizeOutputPunctuation,
  normalizeVocabulary,
  parseTranscript
} from './src/core.js';
import {
  coerceSemanticResult,
  emptyParsedFields,
  hasAnyParsedField,
  mergeParsedFields,
  normalizeSemanticFieldValue,
  normalizeSemanticParsed,
  parseSemanticModelContent
} from './src/semantic.js';
import {
  appendReportJsonl,
  createReportRecord
} from './src/reports.js';
import {
  buildHandHistoryContext,
  canonicalizeHandHistoryUnits,
  enrichHandHistoryParsed,
  parseHandHistory
} from './src/handHistory.js';
import {
  buildOpponentVisualProfile
} from './src/visualProfile.js';
import {
  buildHandVisualModel
} from './src/handVisual.js';
import {
  extractTargetIdHint,
  extractTargetIdentity,
  rowMatchesTargetProfile
} from './src/profileTarget.js';
import {
  beginHhImportRun,
  clearAllHhHands,
  clearHhHandsByOpponent,
  finishHhImportRun,
  getHhNoteMetaById,
  getHhOpponentSuggestions,
  getHhProfileRows,
  hhStorageUsesDb,
  initHhDb,
  saveHhParsedRecord,
  upsertHhManualPresupposition
} from './src/hhDb.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 8787;
const host = process.env.HOST || '127.0.0.1';

app.use(express.static('public'));
app.use(express.json({ limit: '2mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-transcribe';
const OPENAI_LANGUAGE = String(process.env.OPENAI_LANGUAGE || '').trim();
const OPENAI_PROMPT = process.env.OPENAI_PROMPT || 'Transcribe poker dictation with lowercase English and ASCII only. Never output Cyrillic. Prefer poker shorthand: d, b, bb, bbb, xr, xb, ai, cb, tp, nutstr, l1, lt1, 3bp, 4bp, vs, i, my, 0t, t, ?, /.';
const SPELLING_MODE = String(process.env.SPELLING_MODE || '1') !== '0';
const NOTS_SEMANTIC_ENABLED = String(process.env.NOTS_SEMANTIC_ENABLED || '1') !== '0';
const NOTS_SEMANTIC_MODEL = process.env.NOTS_SEMANTIC_MODEL || 'gpt-5.2';
const NOTS_SEMANTIC_MODEL_FALLBACKS = String(process.env.NOTS_SEMANTIC_MODEL_FALLBACKS || 'gpt-5.2,gpt-5')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const NOTS_SEMANTIC_TEMPERATURE = Number(process.env.NOTS_SEMANTIC_TEMPERATURE || '0');
const NOTS_SEMANTIC_MAX_TOKENS = Number(process.env.NOTS_SEMANTIC_MAX_TOKENS || '600');
const NOTS_SEMANTIC_TIMEOUT_MS = Number(process.env.NOTS_SEMANTIC_TIMEOUT_MS || '25000');
const NOTS_SEMANTIC_DICTIONARY_PATH = process.env.NOTS_SEMANTIC_DICTIONARY_PATH || path.resolve(process.cwd(), 'NOTS_SEMANTIC_DICTIONARY.md');

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || '';
const SHEET_URL = process.env.SHEET_URL || '';
const SHEET_NAME = process.env.SHEET_NAME || '';
const SHEET_NAME_VOICE = process.env.SHEET_NAME_VOICE || SHEET_NAME || '';
const HH_STORAGE = 'db';
const HH_DB_PATH = process.env.HH_DB_PATH || path.resolve(process.cwd(), 'data', 'hh.db');
const HH_PARSER_MODE = String(process.env.HH_PARSER_MODE || 'deterministic').trim().toLowerCase() === 'semantic'
  ? 'semantic'
  : 'deterministic';
const HH_PARSER_VERSION = process.env.HH_PARSER_VERSION || 'hh_v2';
const HH_IMPORT_INBOX_DIR = String(process.env.HH_IMPORT_INBOX_DIR || '').trim();
const HH_IMPORT_IMPORTED_DIR = String(process.env.HH_IMPORT_IMPORTED_DIR || '').trim();
const HH_IMPORT_ENABLED = String(process.env.HH_IMPORT_ENABLED || '0').trim() === '1';
const HH_IMPORT_INTERVAL_SEC = Math.max(15, Number(process.env.HH_IMPORT_INTERVAL_SEC || '60') || 60);
const HH_RUNTIME_LOG_ENABLED = String(process.env.HH_RUNTIME_LOG_ENABLED || '1').trim() !== '0';
const HH_IMPORT_LOG_PATH = process.env.HH_IMPORT_LOG_PATH || path.resolve(process.cwd(), 'logs', 'hh-import.log');
const VISUAL_PROFILE_LOG_PATH = process.env.VISUAL_PROFILE_LOG_PATH || path.resolve(process.cwd(), 'logs', 'visual-profile.log');
const HH_PROFILE_ROWS_DEFAULT = Math.max(1000, Number(process.env.HH_PROFILE_ROWS_DEFAULT || '50000') || 50000);
const HH_PROFILE_ROWS_MAX = Math.max(HH_PROFILE_ROWS_DEFAULT, Number(process.env.HH_PROFILE_ROWS_MAX || '500000') || 500000);
const VOCAB_PATH = process.env.VOCAB_PATH || path.resolve(process.cwd(), 'vocab.json');
const REPORTS_PATH = process.env.REPORTS_PATH || path.resolve(process.cwd(), 'reports', 'nots_reports.jsonl');
const FIELD_KEYS = new Set(['preflop', 'flop', 'turn', 'river', 'presupposition']);
const HH_PRESUPP_FIELDS = new Set(['preflop', 'flop', 'turn', 'river', 'hand_presupposition']);
const VISUAL_PROFILE_CACHE_TTL_MS = Number(process.env.VISUAL_PROFILE_CACHE_TTL_MS || '180000');

const visualProfileCache = new Map();

try {
  initHhDb(HH_DB_PATH);
} catch (error) {
  console.error(`HH DB init error (${HH_DB_PATH}):`, error.message);
  throw error;
}

function loadVocabulary() {
  try {
    if (!fs.existsSync(VOCAB_PATH)) {
      return normalizeVocabulary({});
    }
    const raw = fs.readFileSync(VOCAB_PATH, 'utf8');
    return normalizeVocabulary(JSON.parse(raw));
  } catch (error) {
    console.error(`Vocabulary load error (${VOCAB_PATH}):`, error.message);
    return normalizeVocabulary({});
  }
}

function loadSemanticDictionaryText() {
  try {
    if (!fs.existsSync(NOTS_SEMANTIC_DICTIONARY_PATH)) {
      return '';
    }
    return fs.readFileSync(NOTS_SEMANTIC_DICTIONARY_PATH, 'utf8');
  } catch (error) {
    console.error(`Semantic dictionary load error (${NOTS_SEMANTIC_DICTIONARY_PATH}):`, error.message);
    return '';
  }
}

function normalizeSheetName(value, fallback = '') {
  const direct = String(value || '').trim();
  if (direct) return direct;
  return String(fallback || '').trim();
}

function appendRuntimeLog(logPath, event, payload = {}) {
  if (!HH_RUNTIME_LOG_ENABLED) return;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      event: String(event || 'event'),
      ...payload
    };
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {}
}

function voiceSheetName() {
  return normalizeSheetName('', SHEET_NAME_VOICE);
}

function uniqueSheetNames(names = []) {
  const out = [];
  const seen = new Set();
  names.forEach((item) => {
    const value = String(item || '').trim();
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out;
}

function resolveSheetNamesBySource(source = 'all') {
  const mode = String(source || 'all').trim().toLowerCase();
  if (mode === 'voice') {
    return uniqueSheetNames([voiceSheetName()]);
  }
  return uniqueSheetNames([voiceSheetName()]);
}

function makeVisualProfileCacheKey(opponent, scope = 'all') {
  return `${String(scope || 'all').toLowerCase()}::${String(opponent || '').trim().toLowerCase()}`;
}

function parseFilterCsv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeProfileFiltersFromQuery(query = {}) {
  const allowedPlayers = new Set(['2', '3-4', '5-6', '7-9']);
  const playerGroups = parseFilterCsv(query.players)
    .map((item) => item.toLowerCase())
    .filter((item) => allowedPlayers.has(item));

  const allowedDates = new Set(['all', '6m', '3m', '1m', '1w', '3d', 'today']);
  const datePresetRaw = String(query.date || 'all').trim().toLowerCase();
  const datePreset = allowedDates.has(datePresetRaw) ? datePresetRaw : 'all';

  const gameCards = parseFilterCsv(query.games)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && [4, 5, 6].includes(item));

  const rooms = parseFilterCsv(query.rooms)
    .map((item) => item.toLowerCase())
    .filter(Boolean);

  const allowedPots = new Set(['small', 'medium', 'large', 'huge']);
  const potBuckets = parseFilterCsv(query.pots)
    .map((item) => item.toLowerCase())
    .filter((item) => allowedPots.has(item));

  const allowedLimits = new Set(['2-4', '2.5-5', '3-6', '5-10', '10-20', '25-50', '50-100', '100-200']);
  const limits = parseFilterCsv(query.limits)
    .map((item) => item.replace(/\s+/g, ''))
    .filter((item) => allowedLimits.has(item));

  const vsOpponent = String(query.vs || '').trim();
  const allowedRecent = new Set(['all', '50', '20']);
  const recentRaw = String(query.recent || 'all').trim().toLowerCase();
  const recentLimit = allowedRecent.has(recentRaw) ? recentRaw : 'all';

  return {
    playerGroups,
    datePreset,
    gameCards,
    rooms,
    potBuckets,
    limits,
    vsOpponent,
    recentLimit
  };
}

function serializeProfileFilters(filters = {}) {
  const pack = (list) => {
    const normalized = Array.isArray(list) ? list.map((item) => String(item)).filter(Boolean) : [];
    normalized.sort();
    return normalized.join(',');
  };
  return [
    `players=${pack(filters.playerGroups)}`,
    `date=${String(filters.datePreset || 'all')}`,
    `games=${pack(filters.gameCards)}`,
    `rooms=${pack(filters.rooms)}`,
    `pots=${pack(filters.potBuckets)}`,
    `limits=${pack(filters.limits)}`,
    `vs=${String(filters.vsOpponent || '').trim().toLowerCase()}`,
    `recent=${String(filters.recentLimit || 'all')}`
  ].join('|');
}

async function collectOpponentRowsForProfile({
  opponent,
  targetIdentity,
  targetId,
  source,
  includeVoice,
  includeHh,
  limit,
  filters
} = {}) {
  const allRows = [];
  const bySheet = [];
  let hhFilterOptions = { rooms: [] };

  if (includeVoice) {
    const voiceSheet = voiceSheetName();
    const action = Boolean(targetIdentity) && Boolean(targetId) ? 'get_all_rows' : 'get_opponent_rows';
    const rowsResult = await postToSheets({
      action,
      opponent,
      limit,
      sheetName: voiceSheet || undefined
    });

    if (rowsResult?.ok === false) {
      throw new Error(rowsResult.error || `Ошибка чтения строк оппонента из листа ${voiceSheet || 'active'}.`);
    }

    const rowsRaw = Array.isArray(rowsResult?.rows) ? rowsResult.rows : [];
    const rows = action === 'get_all_rows'
      ? rowsRaw.filter((row) => rowMatchesTargetProfile(row, opponent, targetIdentity))
      : rowsRaw;
    const resolvedSheetName = String(rowsResult?.sheetName || voiceSheet || '').trim();

    rows.forEach((row) => {
      allRows.push({
        ...row,
        rowLabel: `#${resolvedSheetName || 'Sheet'}:${row?.row ?? '?'}`
      });
    });

    bySheet.push({
      sheetName: resolvedSheetName || null,
      rows: rows.length
    });
  }

  if (includeHh) {
    const hhResult = getHhProfileRows(HH_DB_PATH, { opponent, limit, filters });
    const hhRows = Array.isArray(hhResult?.rows) ? hhResult.rows : [];
    hhRows.forEach((row) => {
      allRows.push({
        ...row,
        rowLabel: `#DB:${row?.row ?? '?'}`
      });
    });
    hhFilterOptions = hhResult?.filterOptions || { rooms: [] };
    bySheet.push({
      sheetName: 'HH_DB',
      rows: hhRows.length
    });
  }

  if (includeHh && !includeVoice) {
    allRows.sort((a, b) => Number(b.row || 0) - Number(a.row || 0));
  }

  return { allRows, bySheet, hhFilterOptions };
}

function clearProfileCacheForOpponent(opponent) {
  const suffix = `::${String(opponent || '').trim().toLowerCase()}`;
  if (!suffix || suffix === '::') return;
  for (const key of visualProfileCache.keys()) {
    if (String(key).endsWith(suffix)) {
      visualProfileCache.delete(key);
    }
  }
}

function resolveHhManualKey({ opponent = '', row = 0, handNumber = '', room = '' } = {}) {
  const normalizedOpponent = String(opponent || '').trim();
  const normalizedHandNumber = String(handNumber || '').trim();
  const normalizedRoom = String(room || '').trim().toLowerCase();
  const numericRow = Number(row);

  if (normalizedHandNumber) {
    return {
      targetIdentity: extractTargetIdentity(normalizedOpponent),
      handNumber: normalizedHandNumber,
      room: normalizedRoom
    };
  }

  if (!Number.isFinite(numericRow) || numericRow <= 0) {
    throw new Error('Нужен handNumber или корректный row (#DB).');
  }
  return getHhNoteMetaById(HH_DB_PATH, {
    noteId: numericRow,
    opponent: normalizedOpponent
  });
}

function buildSemanticPromptPayload(transcript, vocabulary, semanticDictionaryText) {
  const textAliases = Object.entries(vocabulary.textAliases || {})
    .slice(0, 240)
    .map(([spoken, target]) => ({ spoken, target }));
  const spellingAliases = Object.entries(vocabulary.spellingAliases || {})
    .slice(0, 400)
    .map(([spoken, target]) => ({ spoken, target }));
  const streetAliases = Object.entries(vocabulary.streetAliases || {})
    .slice(0, 120)
    .map(([spoken, target]) => ({ spoken, target }));

  return {
    task: 'Convert free-form poker dictation into canonical nots fields.',
    transcript,
    canonical_rules: [
      'Return only JSON.',
      'Keys must be exactly: preflop, flop, turn, river, presupposition, confidence, unresolved.',
      'Use concise poker shorthand in the style from dictionary and aliases.',
      'Do not invent facts not present in transcript.',
      'If uncertain, leave field empty and add short notes into unresolved.',
      'Interpret details according to dictionary_markdown first.'
    ],
    dictionary_markdown: semanticDictionaryText || '',
    vocab_street_aliases: streetAliases,
    vocab_text_aliases: textAliases,
    vocab_spelling_aliases: spellingAliases
  };
}

function buildSemanticFieldPromptPayload(transcript, field, vocabulary, semanticDictionaryText) {
  const textAliases = Object.entries(vocabulary.textAliases || {})
    .slice(0, 240)
    .map(([spoken, target]) => ({ spoken, target }));
  const spellingAliases = Object.entries(vocabulary.spellingAliases || {})
    .slice(0, 400)
    .map(([spoken, target]) => ({ spoken, target }));
  const streetAliases = Object.entries(vocabulary.streetAliases || {})
    .slice(0, 120)
    .map(([spoken, target]) => ({ spoken, target }));

  return {
    task: 'Convert free-form poker dictation into canonical nots value for one target field.',
    target_field: field,
    transcript,
    output_contract: {
      value: 'string',
      confidence: 'number 0..1',
      unresolved: 'string[]'
    },
    canonical_rules: [
      'Return only JSON with keys: value, confidence, unresolved.',
      'Use concise poker shorthand in the style from dictionary and aliases.',
      'Do not invent facts not present in transcript.',
      'If unsure, return empty value and explain briefly in unresolved.',
      'Interpret details according to dictionary_markdown first.'
    ],
    dictionary_markdown: semanticDictionaryText || '',
    vocab_street_aliases: streetAliases,
    vocab_text_aliases: textAliases,
    vocab_spelling_aliases: spellingAliases
  };
}

function buildHandHistoryPromptPayload(handHistory, opponent, parsedContext, vocabulary, semanticDictionaryText) {
  const textAliases = Object.entries(vocabulary.textAliases || {})
    .slice(0, 240)
    .map(([spoken, target]) => ({ spoken, target }));
  const spellingAliases = Object.entries(vocabulary.spellingAliases || {})
    .slice(0, 400)
    .map(([spoken, target]) => ({ spoken, target }));
  const streetAliases = Object.entries(vocabulary.streetAliases || {})
    .slice(0, 120)
    .map(([spoken, target]) => ({ spoken, target }));

  return {
    task: 'Convert poker hand history into canonical nots fields.',
    target_opponent: opponent,
    target_id_hint: extractTargetIdHint(opponent),
    hand_history: String(handHistory || '').slice(0, 120000),
    canonical_rules: [
      'Return only JSON.',
      'Keys must be exactly: preflop, flop, turn, river, presupposition, confidence, unresolved.',
      'If target_opponent is provided: focus on that target actions.',
      'If target_opponent is empty: keep full action sequence with actor markers for all involved players.',
      'Format actor markers as <POS>_<PLAYER_ID> (example: HJ_12121116, SB_85033665).',
      'Keep action order exactly as in hand history per street.',
      'Do NOT use actor markers i/he in output.',
      'Preflop sizings must be in BB units.',
      'Postflop bets/raises must be in %pot units when possible.',
      'Use board cards and showdown cards to infer hand class per street (flop/turn/river) for target and main shown opponent.',
      'Include relevant draw tags when present (nfd/fd/g/oe/wrap).',
      'If showdown cards exist, include concrete shown cards in output (prefer river field).',
      'Use concise poker shorthand in the style from dictionary and aliases.',
      'Do not invent facts not present in hand history.',
      'Use showed only for voluntary reveal when cards are shown without mandatory showdown.',
      'Do not add sd token.',
      'If uncertain, leave field empty and add short notes into unresolved.',
      'Interpret details according to dictionary_markdown first.'
    ],
    parsed_context: parsedContext || '',
    dictionary_markdown: semanticDictionaryText || '',
    vocab_street_aliases: streetAliases,
    vocab_text_aliases: textAliases,
    vocab_spelling_aliases: spellingAliases
  };
}

function extractChatCompletionText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

async function callSemanticCompletion(messages, model, useJsonFormat = true) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, NOTS_SEMANTIC_TIMEOUT_MS));

  const body = {
    model,
    temperature: Number.isFinite(NOTS_SEMANTIC_TEMPERATURE) ? NOTS_SEMANTIC_TEMPERATURE : 0,
    messages
  };
  if (Number.isFinite(NOTS_SEMANTIC_MAX_TOKENS) && NOTS_SEMANTIC_MAX_TOKENS > 0) {
    body.max_completion_tokens = Math.trunc(NOTS_SEMANTIC_MAX_TOKENS);
  }
  if (useJsonFormat) {
    body.response_format = { type: 'json_object' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`Semantic completion returned non-JSON response: ${text.slice(0, 220)}`);
    }

    if (!response.ok) {
      const message = data?.error?.message || `Semantic completion failed (${response.status}).`;
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function isUnsupportedResponseFormatError(error) {
  const message = String(error?.message || '');
  return /response_format|json_object|unsupported/i.test(message);
}

function isModelUnavailableError(error) {
  const status = Number(error?.status);
  const message = String(error?.message || '').toLowerCase();
  if (status === 403 || status === 404) {
    return true;
  }
  return /model|not found|does not exist|unsupported model|permission|access|not available/.test(message);
}

async function parseTranscriptSemantic(transcript, vocabulary) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY не задан для semantic parser.');
  }

  const semanticDictionaryText = loadSemanticDictionaryText();
  const payload = buildSemanticPromptPayload(transcript, vocabulary, semanticDictionaryText);
  const messages = [
    {
      role: 'system',
      content: 'You are a poker nots semantic parser. Return strict JSON only.'
    },
    {
      role: 'user',
      content: JSON.stringify(payload)
    }
  ];

  const candidateModels = Array.from(new Set([NOTS_SEMANTIC_MODEL, ...NOTS_SEMANTIC_MODEL_FALLBACKS]));
  let lastModelError = null;

  for (const model of candidateModels) {
    let completion;
    try {
      try {
        completion = await callSemanticCompletion(messages, model, true);
      } catch (error) {
        if (isUnsupportedResponseFormatError(error)) {
          completion = await callSemanticCompletion(messages, model, false);
        } else {
          throw error;
        }
      }

      const content = extractChatCompletionText(completion);
      const rawObj = parseSemanticModelContent(content);
      const coerced = coerceSemanticResult(rawObj);
      const parsed = normalizeSemanticParsed(coerced.parsed, vocabulary);

      return {
        parsed,
        confidence: coerced.confidence,
        unresolved: coerced.unresolved,
        modelUsed: model
      };
    } catch (error) {
      if (isModelUnavailableError(error)) {
        lastModelError = error;
        continue;
      }
      throw error;
    }
  }

  const tried = candidateModels.join(', ');
  const detail = lastModelError ? ` Last error: ${lastModelError.message}` : '';
  throw new Error(`No semantic model available. Tried: ${tried}.${detail}`);
}

function coerceSemanticFieldResult(raw) {
  const rawObj = raw && typeof raw === 'object' ? raw : {};
  const value = typeof rawObj.value === 'string' ? rawObj.value.trim() : '';
  const confidenceRaw = Number(rawObj.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : null;
  const unresolved = Array.isArray(rawObj.unresolved)
    ? rawObj.unresolved
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 50)
    : [];
  return { value, confidence, unresolved };
}

async function parseFieldSemantic(transcript, field, vocabulary) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY не задан для semantic parser.');
  }

  const semanticDictionaryText = loadSemanticDictionaryText();
  const payload = buildSemanticFieldPromptPayload(transcript, field, vocabulary, semanticDictionaryText);
  const messages = [
    {
      role: 'system',
      content: 'You are a poker nots semantic parser. Return strict JSON only.'
    },
    {
      role: 'user',
      content: JSON.stringify(payload)
    }
  ];

  const candidateModels = Array.from(new Set([NOTS_SEMANTIC_MODEL, ...NOTS_SEMANTIC_MODEL_FALLBACKS]));
  let lastModelError = null;

  for (const model of candidateModels) {
    let completion;
    try {
      try {
        completion = await callSemanticCompletion(messages, model, true);
      } catch (error) {
        if (isUnsupportedResponseFormatError(error)) {
          completion = await callSemanticCompletion(messages, model, false);
        } else {
          throw error;
        }
      }

      const content = extractChatCompletionText(completion);
      const rawObj = parseSemanticModelContent(content);
      const coerced = coerceSemanticFieldResult(rawObj);
      const value = normalizeSemanticFieldValue(coerced.value, vocabulary);

      return {
        value,
        confidence: coerced.confidence,
        unresolved: coerced.unresolved,
        modelUsed: model
      };
    } catch (error) {
      if (isModelUnavailableError(error)) {
        lastModelError = error;
        continue;
      }
      throw error;
    }
  }

  const tried = candidateModels.join(', ');
  const detail = lastModelError ? ` Last error: ${lastModelError.message}` : '';
  throw new Error(`No semantic model available. Tried: ${tried}.${detail}`);
}

async function parseHandHistorySemantic(handHistory, opponent, parsedContext, vocabulary) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY не задан для semantic parser.');
  }

  const semanticDictionaryText = loadSemanticDictionaryText();
  const payload = buildHandHistoryPromptPayload(handHistory, opponent, parsedContext, vocabulary, semanticDictionaryText);
  const messages = [
    {
      role: 'system',
      content: 'You are a poker hand-history semantic parser. Return strict JSON only.'
    },
    {
      role: 'user',
      content: JSON.stringify(payload)
    }
  ];

  const candidateModels = Array.from(new Set([NOTS_SEMANTIC_MODEL, ...NOTS_SEMANTIC_MODEL_FALLBACKS]));
  let lastModelError = null;

  for (const model of candidateModels) {
    let completion;
    try {
      try {
        completion = await callSemanticCompletion(messages, model, true);
      } catch (error) {
        if (isUnsupportedResponseFormatError(error)) {
          completion = await callSemanticCompletion(messages, model, false);
        } else {
          throw error;
        }
      }

      const content = extractChatCompletionText(completion);
      const rawObj = parseSemanticModelContent(content);
      const coerced = coerceSemanticResult(rawObj);
      const parsed = normalizeSemanticParsed(coerced.parsed, vocabulary);

      return {
        parsed,
        confidence: coerced.confidence,
        unresolved: coerced.unresolved,
        modelUsed: model
      };
    } catch (error) {
      if (isModelUnavailableError(error)) {
        lastModelError = error;
        continue;
      }
      throw error;
    }
  }

  const tried = candidateModels.join(', ');
  const detail = lastModelError ? ` Last error: ${lastModelError.message}` : '';
  throw new Error(`No semantic model available. Tried: ${tried}.${detail}`);
}

function normalizeHandHistoryParsed(rawParsed, vocabulary) {
  const parsed = normalizeSemanticParsed(rawParsed, vocabulary);
  for (const key of Object.keys(parsed)) {
    const segments = String(parsed[key] || '')
      .split('/')
      .map((segment) => segment.trim().replace(/^(?:i|he)\s+/i, '').trim())
      .filter(Boolean);
    parsed[key] = segments.join(' / ');
  }
  return parsed;
}

function splitHandHistoryText(rawText) {
  const text = String(rawText || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const matches = text.match(/PokerStars Hand #\d+:[\s\S]*?(?=PokerStars Hand #\d+:|$)/gi);
  if (matches && matches.length) {
    return matches
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [text];
}

function decodeTextBuffer(buffer) {
  if (!buffer) return '';
  return Buffer.from(buffer).toString('utf8');
}

function isHandHistoryFile(filePath) {
  return /\.(txt|log|hh)$/i.test(String(filePath || ''));
}

function listHandHistoryFilesRecursive(rootDir) {
  const root = path.resolve(String(rootDir || '').trim());
  if (!root || !fs.existsSync(root)) return [];

  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (entry.isFile() && isHandHistoryFile(absolute)) {
        out.push(absolute);
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b, 'en'));
}

function ensureDirectory(dirPath) {
  if (!dirPath) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

function buildImportedFilePath(sourceFile, inputRoot, importedRoot) {
  const inputResolved = path.resolve(inputRoot);
  const importedResolved = path.resolve(importedRoot);
  const relative = path.relative(inputResolved, sourceFile);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return '';
  }

  const parsed = path.parse(relative);
  const targetDir = path.join(importedResolved, parsed.dir);
  ensureDirectory(targetDir);
  let target = path.join(targetDir, parsed.base);
  let suffix = 1;
  while (fs.existsSync(target)) {
    target = path.join(targetDir, `${parsed.name}__dup${suffix}${parsed.ext}`);
    suffix += 1;
  }
  return target;
}

function moveFileSafe(sourceFile, targetFile) {
  try {
    fs.renameSync(sourceFile, targetFile);
    return;
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
  }
  fs.copyFileSync(sourceFile, targetFile);
  fs.unlinkSync(sourceFile);
}

function pruneEmptyImportTree(rootDir, { preserveRoot = true } = {}) {
  const root = path.resolve(String(rootDir || '').trim());
  if (!root || !fs.existsSync(root)) return;

  const sweep = (current) => {
    let entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        sweep(absolute);
        continue;
      }
      // Finder artefacts keep directories non-empty; remove them during cleanup.
      if (entry.isFile() && entry.name === '.DS_Store') {
        try {
          fs.unlinkSync(absolute);
        } catch {}
      }
    }

    entries = fs.readdirSync(current, { withFileTypes: true });
    if (!entries.length && (!preserveRoot || current !== root)) {
      fs.rmdirSync(current);
    }
  };

  sweep(root);
}

let hhFolderImportLock = false;

async function importHandHistoryFoldersOnce({
  inputDir,
  importedDir,
  opponent = '',
  maxHands = 0
} = {}) {
  const inbox = path.resolve(String(inputDir || '').trim());
  const done = path.resolve(String(importedDir || '').trim());
  if (!inbox) throw new Error('HH_IMPORT_INBOX_DIR не задан.');
  if (!done) throw new Error('HH_IMPORT_IMPORTED_DIR не задан.');
  if (!fs.existsSync(inbox) || !fs.statSync(inbox).isDirectory()) {
    throw new Error(`Папка импорта не найдена: ${inbox}`);
  }
  ensureDirectory(done);

  if (hhFolderImportLock) {
    appendRuntimeLog(HH_IMPORT_LOG_PATH, 'import.skip.already_running', {
      inputDir: inbox,
      importedDir: done
    });
    return {
      ok: false,
      skipped: true,
      reason: 'already_running'
    };
  }

  hhFolderImportLock = true;
  const files = listHandHistoryFilesRecursive(inbox);
  const vocabulary = loadVocabulary();
  const errors = [];
  const moved = [];
  let totalHands = 0;
  let savedHands = 0;
  let duplicateHands = 0;
  let failedHands = 0;
  let skippedEmptyHands = 0;
  let parsedFiles = 0;
  let runId = 0;

  try {
    appendRuntimeLog(HH_IMPORT_LOG_PATH, 'import.start', {
      inputDir: inbox,
      importedDir: done,
      filesFound: files.length,
      maxHands
    });
    runId = beginHhImportRun(HH_DB_PATH, { sourceType: 'batch', fileCount: files.length });
    let nextProgressAt = 250;
    outer:
    for (const filePath of files) {
      const rawText = fs.readFileSync(filePath, 'utf8');
      const hands = splitHandHistoryText(rawText);
      appendRuntimeLog(HH_IMPORT_LOG_PATH, 'import.file.start', {
        runId,
        file: filePath,
        handsFound: hands.length
      });
      for (let i = 0; i < hands.length; i += 1) {
        if (maxHands > 0 && totalHands >= maxHands) break outer;
        const handText = String(hands[i] || '').trim();
        if (!handText) continue;
        totalHands += 1;
        try {
          const result = await processHandHistoryRecord(handText, opponent, vocabulary, {
            dbRunId: runId,
            allowEmpty: true
          });
          if (result.skippedEmpty) {
            skippedEmptyHands += 1;
            continue;
          }
          if (result.dbInsertedHand) {
            savedHands += 1;
          } else {
            duplicateHands += 1;
          }
        } catch (error) {
          failedHands += 1;
          appendRuntimeLog(HH_IMPORT_LOG_PATH, 'import.hand.error', {
            runId,
            file: filePath,
            handIndex: i + 1,
            error: error.message || 'Ошибка разбора HH'
          });
          if (errors.length < 120) {
            errors.push({
              file: filePath,
              handIndex: i + 1,
              error: error.message || 'Ошибка разбора HH'
            });
          }
        }
        if (totalHands >= nextProgressAt) {
          appendRuntimeLog(HH_IMPORT_LOG_PATH, 'import.progress', {
            runId,
            filesParsed: parsedFiles,
            totalHands,
            savedHands,
            duplicateHands,
            skippedEmptyHands,
            failedHands
          });
          nextProgressAt += 250;
        }
      }

      const targetFile = buildImportedFilePath(filePath, inbox, done);
      if (!targetFile) {
        if (errors.length < 120) {
          errors.push({
            file: filePath,
            handIndex: 0,
            error: 'Не удалось построить путь перемещения импортированного файла.'
          });
        }
      } else {
        moveFileSafe(filePath, targetFile);
        moved.push({
          from: filePath,
          to: targetFile
        });
      }
      parsedFiles += 1;
      appendRuntimeLog(HH_IMPORT_LOG_PATH, 'import.file.done', {
        runId,
        file: filePath,
        parsedFiles,
        movedTo: targetFile || null
      });
    }

    pruneEmptyImportTree(inbox, { preserveRoot: true });

    finishHhImportRun(HH_DB_PATH, runId, {
      handCount: totalHands,
      savedCount: savedHands,
      failedCount: failedHands,
      errors
    });

    if (savedHands > 0 || duplicateHands > 0) {
      visualProfileCache.clear();
    }

    appendRuntimeLog(HH_IMPORT_LOG_PATH, 'import.done', {
      runId,
      filesFound: files.length,
      filesMoved: moved.length,
      parsedFiles,
      totalHands,
      savedHands,
      duplicateHands,
      skippedEmptyHands,
      failedHands,
      errorCount: errors.length
    });

    return {
      ok: true,
      runId,
      filesFound: files.length,
      filesMoved: moved.length,
      parsedFiles,
      totalHands,
      savedHands,
      duplicateHands,
      skippedEmptyHands,
      failedHands,
      errors,
      moved
    };
  } catch (error) {
    appendRuntimeLog(HH_IMPORT_LOG_PATH, 'import.fatal', {
      runId,
      totalHands,
      savedHands,
      duplicateHands,
      skippedEmptyHands,
      failedHands,
      error: error.message || 'Ошибка batch-импорта HH.'
    });
    if (runId) {
      try {
        finishHhImportRun(HH_DB_PATH, runId, {
          handCount: totalHands,
          savedCount: savedHands,
          failedCount: failedHands + 1,
          errors: [
            ...errors,
            { file: '', handIndex: 0, error: error.message || 'Ошибка batch-импорта HH.' }
          ].slice(0, 120)
        });
      } catch {}
    }
    throw error;
  } finally {
    hhFolderImportLock = false;
  }
}

async function processHandHistoryRecord(handHistory, opponent, vocabulary, options = {}) {
  const dbRunId = Number(options?.dbRunId || 0);
  const allowEmpty = Boolean(options?.allowEmpty);
  const parsedHH = parseHandHistory(handHistory, opponent);
  let parserMeta = {
    source: 'deterministic',
    model: null,
    confidence: null,
    unresolved: [`target_player=${parsedHH.targetPlayer || 'none'}`],
    semanticError: null
  };
  let parsed = emptyParsedFields();

  if (HH_PARSER_MODE === 'semantic') {
    const parsedContext = buildHandHistoryContext(parsedHH);
    const semanticResult = await parseHandHistorySemantic(handHistory, opponent, parsedContext, vocabulary);
    parsed = normalizeHandHistoryParsed(semanticResult.parsed, vocabulary);
    parserMeta = {
      source: 'semantic_llm',
      model: semanticResult.modelUsed,
      confidence: semanticResult.confidence,
      unresolved: [...(semanticResult.unresolved || []), `target_player=${parsedHH.targetPlayer || 'none'}`],
      semanticError: null
    };
  }

  parsed = canonicalizeHandHistoryUnits(parsed, parsedHH);
  parsed = enrichHandHistoryParsed(parsed, parsedHH);

  if (!hasAnyParsedField(parsed)) {
    if (allowEmpty) {
      return {
        parsed,
        row: null,
        dbNoteId: null,
        dbInsertedHand: false,
        skippedEmpty: true,
        sheetName: null,
        storage: HH_STORAGE,
        parser: parserMeta,
        targetPlayer: parsedHH.targetPlayer
      };
    }
    throw new Error('Не удалось извлечь структуру раздачи из hand history.');
  }

  if (!hhStorageUsesDb(HH_STORAGE)) {
    throw new Error('HH storage должен быть DB.');
  }
  if (!dbRunId) {
    throw new Error('В DB режиме обязателен dbRunId.');
  }
  const dbResult = saveHhParsedRecord(HH_DB_PATH, {
    runId: dbRunId,
    handHistory,
    parsedHH,
    parsed,
    parserVersion: HH_PARSER_VERSION,
    targetIdentity: extractTargetIdentity(parsedHH.targetPlayer || opponent || ''),
    targetPlayer: parsedHH.targetPlayer || ''
  });

  return {
    parsed,
    row: null,
    dbNoteId: dbResult?.noteId || null,
    dbInsertedHand: Boolean(dbResult?.insertedHand),
    sheetName: null,
    storage: HH_STORAGE,
    parser: parserMeta,
    targetPlayer: parsedHH.targetPlayer
  };
}

async function transcribeAudio(buffer, filename, mimetype) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY не задан.');
  }

  const form = new FormData();
  const blob = new Blob([buffer], { type: mimetype || 'audio/webm' });
  form.append('file', blob, filename || 'audio.webm');
  form.append('model', OPENAI_MODEL);
  if (OPENAI_LANGUAGE) {
    form.append('language', OPENAI_LANGUAGE);
  }
  if (OPENAI_PROMPT) {
    form.append('prompt', OPENAI_PROMPT);
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: form
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || 'Ошибка при транскрибации.';
    throw new Error(message);
  }

  return data.text || '';
}

function parseSheetsJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Некорректный ответ Apps Script: ${String(text || '').slice(0, 220)}`);
  }
}

async function resolveAppsScriptRedirect(response) {
  const location = response.headers.get('location');
  if (!location) {
    throw new Error('Apps Script вернул редирект без location.');
  }

  // Apps Script often responds with 302 and a one-time googleusercontent URL.
  const redirected = await fetch(location, {
    method: 'GET',
    redirect: 'follow'
  });

  const text = await redirected.text();
  if (!redirected.ok) {
    throw new Error(`Ошибка чтения ответа Apps Script: ${text.slice(0, 220)}`);
  }

  return parseSheetsJson(text);
}

async function postToSheets(payload) {
  if (!SHEETS_WEBHOOK_URL) {
    return { skipped: true };
  }

  const response = await fetch(SHEETS_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    redirect: 'manual'
  });

  if (response.status >= 300 && response.status < 400) {
    return resolveAppsScriptRedirect(response);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Ошибка при записи в Sheets: ${text.slice(0, 220)}`);
  }

  return parseSheetsJson(text);
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hhStorage: HH_STORAGE });
});

app.get('/api/opponent-suggestions', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(5000, Math.trunc(limitRaw)))
      : 50;

    const merged = [];
    const seen = new Set();

    if (hhStorageUsesDb(HH_STORAGE)) {
      const dbItems = getHhOpponentSuggestions(HH_DB_PATH, { query, limit });
      for (const name of dbItems) {
        const value = String(name || '').trim();
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(value);
        if (merged.length >= limit) break;
      }
    }

    if (SHEETS_WEBHOOK_URL && merged.length < limit) {
      const sheets = resolveSheetNamesBySource('all');
      for (const sheetName of sheets) {
        const result = await postToSheets({
          action: 'list_opponents',
          query,
          limit,
          sheetName: sheetName || undefined
        });

        if (result?.ok === false) {
          return res.status(500).json({ error: result.error || `Ошибка поиска оппонентов в листе ${sheetName || 'active'}.` });
        }

        const items = Array.isArray(result?.opponents) ? result.opponents : [];
        for (const name of items) {
          const value = String(name || '').trim();
          if (!value) continue;
          const key = value.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(value);
          if (merged.length >= limit) break;
        }
        if (merged.length >= limit) break;
      }
    }

    const opponents = merged.slice(0, limit);
    return res.json({ ok: true, opponents });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка сервера.' });
  }
});

app.get('/api/open-link', async (req, res) => {
  try {
    const opponent = String(req.query.opponent || '').trim();
    if (!opponent) {
      return res.status(400).json({ error: 'Не выбран оппонент.' });
    }
    if (!SHEETS_WEBHOOK_URL) {
      return res.status(400).json({ error: 'SHEETS_WEBHOOK_URL не задан.' });
    }

    const sheets = resolveSheetNamesBySource('all');
    let lookupResult = null;
    let foundSheet = '';

    for (const sheetName of sheets) {
      const result = await postToSheets({
        action: 'find_first_row',
        opponent,
        sheetName: sheetName || undefined
      });
      if (result?.ok === false) {
        return res.status(500).json({ error: result.error || `Ошибка поиска строки в листе ${sheetName || 'active'}.` });
      }
      if (result?.found && result?.row) {
        lookupResult = result;
        foundSheet = result.sheetName || sheetName || '';
        break;
      }
    }

    if (!lookupResult || !lookupResult?.found || !lookupResult?.row) {
      return res.status(404).json({ error: 'Никнейм не найден в таблице.' });
    }

    const url = buildSheetRangeUrl({
      row: lookupResult.row,
      gid: lookupResult.gid,
      spreadsheetId: lookupResult.spreadsheetId,
      sheetUrl: SHEET_URL
    });

    if (!url) {
      return res.status(500).json({ error: 'Не удалось собрать ссылку на таблицу. Добавь SHEET_URL в .env.' });
    }

    return res.json({
      ok: true,
      opponent,
      row: lookupResult.row,
      sheetName: foundSheet || null,
      url
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка открытия таблицы.' });
  }
});

app.get('/api/opponent-visual-profile', async (req, res) => {
  try {
    const opponent = String(req.query.opponent || '').trim();
    const targetId = extractTargetIdHint(opponent);
    const targetIdentity = extractTargetIdentity(opponent);
    const source = String(req.query.source || 'all').trim().toLowerCase();
    const force = String(req.query.force || '').trim() === '1';
    const filters = normalizeProfileFiltersFromQuery(req.query);
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(HH_PROFILE_ROWS_MAX, Math.trunc(limitRaw)))
      : HH_PROFILE_ROWS_DEFAULT;

    const includeVoice = ['all', 'voice'].includes(source);
    const includeHh = ['all', 'hh', 'handhistory', 'hand_history'].includes(source);
    const needsSheets = includeVoice;

    appendRuntimeLog(VISUAL_PROFILE_LOG_PATH, 'profile.request.start', {
      opponent,
      source,
      filters,
      includeVoice,
      includeHh,
      force,
      limit
    });

    if (!opponent) {
      return res.status(400).json({ error: 'Не выбран оппонент.' });
    }
    if (needsSheets && !SHEETS_WEBHOOK_URL) {
      return res.status(400).json({ error: 'SHEETS_WEBHOOK_URL не задан для источников, читаемых из Sheets.' });
    }
    const scopeParts = [];
    if (includeVoice) scopeParts.push(`voice:${voiceSheetName() || 'active'}`);
    if (includeHh) scopeParts.push('hh:db');
    const scopeLabel = `${scopeParts.join('|') || source || 'all'}|${serializeProfileFilters(filters)}`;
    const cacheKey = makeVisualProfileCacheKey(opponent, scopeLabel);
    const now = Date.now();
    const cached = visualProfileCache.get(cacheKey);
    if (!force && cached && (now - cached.savedAt) < VISUAL_PROFILE_CACHE_TTL_MS) {
      appendRuntimeLog(VISUAL_PROFILE_LOG_PATH, 'profile.request.cached', {
        opponent,
        source,
        cacheKey,
        cachedMs: now - cached.savedAt
      });
      return res.json({ ok: true, cached: true, profile: cached.profile });
    }

    const { allRows, bySheet, hhFilterOptions } = await collectOpponentRowsForProfile({
      opponent,
      targetIdentity,
      targetId,
      source,
      includeVoice,
      includeHh,
      limit,
      filters
    });

    const profile = buildOpponentVisualProfile(allRows, { opponent, filters });
    profile.sources = bySheet;
    profile.filters = {
      ...filters,
      options: {
        rooms: Array.isArray(hhFilterOptions?.rooms) ? hhFilterOptions.rooms : []
      }
    };

    visualProfileCache.set(cacheKey, {
      savedAt: now,
      profile
    });

    appendRuntimeLog(VISUAL_PROFILE_LOG_PATH, 'profile.request.done', {
      opponent,
      source,
      cacheKey,
      totalRows: allRows.length,
      sections: profile?.sections ? Object.keys(profile.sections).length : 0,
      sources: bySheet
    });

    return res.json({
      ok: true,
      cached: false,
      profile
    });
  } catch (error) {
    appendRuntimeLog(VISUAL_PROFILE_LOG_PATH, 'profile.request.error', {
      opponent: String(req.query?.opponent || ''),
      source: String(req.query?.source || 'all'),
      error: error.message || 'Ошибка построения визуального профиля.'
    });
    return res.status(500).json({ error: error.message || 'Ошибка построения визуального профиля.' });
  }
});

app.get('/api/opponent-visual-list', async (req, res) => {
  try {
    const opponent = String(req.query.opponent || '').trim();
    const targetId = extractTargetIdHint(opponent);
    const targetIdentity = extractTargetIdentity(opponent);
    const source = String(req.query.source || 'all').trim().toLowerCase();
    const filters = normalizeProfileFiltersFromQuery(req.query);
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(HH_PROFILE_ROWS_MAX, Math.trunc(limitRaw)))
      : HH_PROFILE_ROWS_DEFAULT;

    const includeVoice = ['all', 'voice'].includes(source);
    const includeHh = ['all', 'hh', 'handhistory', 'hand_history'].includes(source);
    const needsSheets = includeVoice;

    if (!opponent) {
      return res.status(400).json({ error: 'Не выбран оппонент.' });
    }
    if (needsSheets && !SHEETS_WEBHOOK_URL) {
      return res.status(400).json({ error: 'SHEETS_WEBHOOK_URL не задан для источников, читаемых из Sheets.' });
    }

    const { allRows, bySheet, hhFilterOptions } = await collectOpponentRowsForProfile({
      opponent,
      targetIdentity,
      targetId,
      source,
      includeVoice,
      includeHh,
      limit,
      filters
    });

    return res.json({
      ok: true,
      list: allRows,
      totalRows: allRows.length,
      sources: bySheet,
      filters: {
        ...filters,
        options: {
          rooms: Array.isArray(hhFilterOptions?.rooms) ? hhFilterOptions.rooms : []
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка построения списка раздач.' });
  }
});

app.post('/api/visualize-hand', async (req, res) => {
  try {
    const opponent = String(req.body?.opponent || '').trim();
    const handHistory = String(req.body?.handHistory || '').trim();
    if (!handHistory) {
      return res.status(400).json({ error: 'Hand history пустая.' });
    }

    const parsedHH = parseHandHistory(handHistory, opponent);

    const visual = buildHandVisualModel(handHistory, parsedHH);
    return res.json({ ok: true, visual });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка визуализации hand history.' });
  }
});

app.post('/api/record', upload.single('audio'), async (req, res) => {
  try {
    const opponent = (req.body.opponent || '').trim();
    if (!opponent) {
      return res.status(400).json({ error: 'Не выбран оппонент.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Аудио не получено.' });
    }

    const transcript = await transcribeAudio(req.file.buffer, req.file.originalname, req.file.mimetype);
    const vocabulary = loadVocabulary();
    const ruleResult = parseTranscript(transcript, vocabulary, { spellingMode: SPELLING_MODE });
    let semanticResult = { parsed: emptyParsedFields(), confidence: null, unresolved: [], modelUsed: null };
    let semanticError = '';

    if (NOTS_SEMANTIC_ENABLED) {
      try {
        semanticResult = await parseTranscriptSemantic(transcript, vocabulary);
      } catch (error) {
        semanticError = error.message || 'Ошибка semantic parser.';
      }
    }

    let parsed = emptyParsedFields();
    let parserSource = 'rules';

    if (hasAnyParsedField(semanticResult.parsed)) {
      parsed = mergeParsedFields(semanticResult.parsed, ruleResult.parsed || {});
      parserSource = 'semantic_llm';
    } else if (!ruleResult.error) {
      parsed = ruleResult.parsed;
      parserSource = 'rules';
    } else {
      const detail = semanticError ? ` Semantic parser: ${semanticError}` : '';
      return res.status(422).json({ error: `${ruleResult.error}${detail}`, transcript });
    }

    const targetSheetName = voiceSheetName();
    const payload = {
      opponent,
      preflop: parsed.preflop,
      flop: parsed.flop,
      turn: parsed.turn,
      river: parsed.river,
      presupposition: parsed.presupposition,
      sheetName: targetSheetName || undefined
    };

    const sheetsResult = await postToSheets(payload);
    if (sheetsResult?.ok === false) {
      throw new Error(sheetsResult.error || 'Apps Script вернул ошибку.');
    }
    clearProfileCacheForOpponent(opponent);

    return res.json({
      ok: true,
      transcript,
      parsed,
      row: sheetsResult?.row || null,
      sheetName: sheetsResult?.sheetName || targetSheetName || null,
      parser: {
        source: parserSource,
        model: semanticResult.modelUsed,
        confidence: semanticResult.confidence,
        unresolved: semanticResult.unresolved,
        semanticError: semanticError || null
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка сервера.' });
  }
});

app.post('/api/record-hand-history', async (req, res) => {
  try {
    const opponent = String(req.body?.opponent || '').trim();
    const handHistory = String(req.body?.handHistory || '').trim();

    if (!handHistory) {
      return res.status(400).json({ error: 'Hand history пустая.' });
    }
    const vocabulary = loadVocabulary();
    const runId = beginHhImportRun(HH_DB_PATH, { sourceType: 'single', fileCount: 1 });
    let result = null;
    try {
      result = await processHandHistoryRecord(handHistory, opponent, vocabulary, { dbRunId: runId });
      finishHhImportRun(HH_DB_PATH, runId, {
        handCount: 1,
        savedCount: result.dbInsertedHand ? 1 : 0,
        failedCount: 0,
        errors: []
      });
    } catch (error) {
      finishHhImportRun(HH_DB_PATH, runId, {
        handCount: 1,
        savedCount: 0,
        failedCount: 1,
        errors: [{ handIndex: 1, error: error.message || 'Ошибка разбора hand history.' }]
      });
      throw error;
    }
    clearProfileCacheForOpponent(opponent || result.targetPlayer || '');

    return res.json({
      ok: true,
      transcript: handHistory,
      parsed: result.parsed,
      row: result.row,
      dbNoteId: result.dbNoteId || null,
      sheetName: null,
      inserted: result.dbInsertedHand,
      storage: result.storage || HH_STORAGE,
      targetPlayer: result.targetPlayer || null,
      parser: result.parser
    });
  } catch (error) {
    const message = error.message || 'Ошибка разбора hand history.';
    const code = /Не удалось извлечь структуру/i.test(message) ? 422 : 500;
    return res.status(code).json({ error: message });
  }
});

app.post('/api/record-hand-history-files', upload.array('files', 200), async (req, res) => {
  let runId = 0;
  try {
    const opponent = String(req.body?.opponent || '').trim();
    const files = Array.isArray(req.files) ? req.files : [];
    const maxHandsRaw = Number(req.body?.maxHands);
    const maxHands = Number.isFinite(maxHandsRaw) && maxHandsRaw > 0
      ? Math.trunc(maxHandsRaw)
      : 0;

    if (!files.length) {
      return res.status(400).json({ error: 'Файлы hand history не загружены.' });
    }
    const vocabulary = loadVocabulary();
    const affectedOpponents = new Set();
    let totalHands = 0;
    let savedHands = 0;
    let failedHands = 0;
    let skippedEmptyHands = 0;
    const errors = [];
    const savedRows = [];
    let lastResult = null;
    runId = beginHhImportRun(HH_DB_PATH, { sourceType: 'batch', fileCount: files.length });

    outer:
    for (const file of files) {
      const text = decodeTextBuffer(file.buffer);
      const hands = splitHandHistoryText(text);
      for (let i = 0; i < hands.length; i += 1) {
        if (maxHands > 0 && totalHands >= maxHands) {
          break outer;
        }
        const handHistory = hands[i];
        if (!handHistory) continue;
        totalHands += 1;

        try {
          const result = await processHandHistoryRecord(handHistory, opponent, vocabulary, {
            dbRunId: runId,
            allowEmpty: true
          });
          if (result.skippedEmpty) {
            skippedEmptyHands += 1;
            continue;
          }
          if (opponent) affectedOpponents.add(opponent);
          if (result?.targetPlayer) affectedOpponents.add(result.targetPlayer);
          if (result.dbInsertedHand) {
            savedHands += 1;
          }
          lastResult = {
            transcript: handHistory,
            ...result
          };
          if (savedRows.length < 150) {
            savedRows.push({
              file: file.originalname || `file_${savedRows.length + 1}`,
              handIndex: i + 1,
              row: result.row || null,
              dbNoteId: result.dbNoteId || null,
              inserted: result.dbInsertedHand
            });
          }
        } catch (error) {
          failedHands += 1;
          if (errors.length < 80) {
            errors.push({
              file: file.originalname || '',
              handIndex: i + 1,
              error: error.message || 'Ошибка разбора hand history.'
            });
          }
        }
      }
    }

    if (!totalHands) {
      if (runId) {
        finishHhImportRun(HH_DB_PATH, runId, { handCount: 0, savedCount: 0, failedCount: 0, errors: [] });
      }
      return res.status(422).json({ error: 'В загруженных файлах не найдено ни одной hand history.' });
    }

    if (savedHands > 0) {
      affectedOpponents.forEach((name) => clearProfileCacheForOpponent(name));
    }
    finishHhImportRun(HH_DB_PATH, runId, {
      handCount: totalHands,
      savedCount: savedHands,
      failedCount: failedHands,
      errors
    });

    return res.json({
      ok: true,
      opponent: opponent || null,
      storage: HH_STORAGE,
      dbRunId: runId || null,
      files: files.length,
      totalHands,
      savedHands,
      duplicateHands: Math.max(0, totalHands - savedHands - failedHands - skippedEmptyHands),
      skippedEmptyHands,
      failedHands,
      sheetName: null,
      rows: savedRows,
      errors,
      last: lastResult
        ? {
          transcript: lastResult.transcript,
          parsed: lastResult.parsed,
          row: lastResult.row,
          dbNoteId: lastResult.dbNoteId || null,
          inserted: lastResult.dbInsertedHand,
          sheetName: null,
          parser: lastResult.parser
        }
        : null
    });
  } catch (error) {
    if (runId) {
      try {
        finishHhImportRun(HH_DB_PATH, runId, {
          handCount: 0,
          savedCount: 0,
          failedCount: 1,
          errors: [{ error: error.message || 'Ошибка пакетного разбора hand history.' }]
        });
      } catch {}
    }
    return res.status(500).json({ error: error.message || 'Ошибка пакетного разбора hand history.' });
  }
});

app.get('/api/hh-folder-import-status', (req, res) => {
  const inbox = HH_IMPORT_INBOX_DIR ? path.resolve(HH_IMPORT_INBOX_DIR) : '';
  const imported = HH_IMPORT_IMPORTED_DIR ? path.resolve(HH_IMPORT_IMPORTED_DIR) : '';
  const filesFound = inbox && fs.existsSync(inbox) ? listHandHistoryFilesRecursive(inbox).length : 0;
  return res.json({
    ok: true,
    enabled: HH_IMPORT_ENABLED,
    running: hhFolderImportLock,
    inboxDir: inbox || null,
    importedDir: imported || null,
    filesFound
  });
});

app.post('/api/hh-folder-import', async (req, res) => {
  try {
    const inputDir = String(req.body?.inputDir || HH_IMPORT_INBOX_DIR || '').trim();
    const importedDir = String(req.body?.importedDir || HH_IMPORT_IMPORTED_DIR || '').trim();
    const opponent = String(req.body?.opponent || '').trim();
    const maxHandsRaw = Number(req.body?.maxHands);
    const maxHands = Number.isFinite(maxHandsRaw) && maxHandsRaw > 0 ? Math.trunc(maxHandsRaw) : 0;

    const result = await importHandHistoryFoldersOnce({
      inputDir,
      importedDir,
      opponent,
      maxHands
    });
    if (result?.skipped) {
      return res.status(409).json({ error: 'Импорт уже выполняется.', status: result });
    }
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка пакетного импорта папки HH.' });
  }
});

app.post('/api/record-field', upload.single('audio'), async (req, res) => {
  try {
    const opponent = String(req.body.opponent || '').trim();
    const field = String(req.body.field || '').trim().toLowerCase();
    const row = Number(req.body.row);
    const targetSheetName = normalizeSheetName(req.body.sheetName, voiceSheetName());

    if (!opponent) {
      return res.status(400).json({ error: 'Не выбран оппонент.' });
    }
    if (!FIELD_KEYS.has(field)) {
      return res.status(400).json({ error: 'Некорректное поле для передиктовки.' });
    }
    if (!Number.isFinite(row) || row < 2) {
      return res.status(400).json({ error: 'Некорректный номер строки для правки.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Аудио не получено.' });
    }
    if (!SHEETS_WEBHOOK_URL) {
      return res.status(400).json({ error: 'SHEETS_WEBHOOK_URL не задан.' });
    }

    const transcript = await transcribeAudio(req.file.buffer, req.file.originalname, req.file.mimetype);
    const vocabulary = loadVocabulary();
    let semanticError = '';
    let semanticResult = { value: '', confidence: null, unresolved: [], modelUsed: null };

    if (NOTS_SEMANTIC_ENABLED) {
      try {
        semanticResult = await parseFieldSemantic(transcript, field, vocabulary);
      } catch (error) {
        semanticError = error.message || 'Ошибка semantic parser.';
      }
    }

    const parserSource = semanticResult.value ? 'semantic_llm' : 'rules';
    const value = semanticResult.value || normalizeFieldContent(transcript, vocabulary, { spellingMode: SPELLING_MODE });

    if (!value) {
      const detail = semanticError ? ` Semantic parser: ${semanticError}` : '';
      return res.status(422).json({ error: `Не удалось распознать текст для выбранного поля.${detail}`, transcript });
    }

    const sheetsResult = await postToSheets({
      action: 'update_field',
      row,
      field,
      value,
      opponent,
      sheetName: targetSheetName || undefined
    });

    if (sheetsResult?.ok === false) {
      throw new Error(sheetsResult.error || 'Apps Script вернул ошибку при обновлении поля.');
    }
    clearProfileCacheForOpponent(opponent);

    return res.json({
      ok: true,
      transcript,
      row,
      field,
      value,
      sheetName: sheetsResult?.sheetName || targetSheetName || null,
      parser: {
        source: parserSource,
        model: semanticResult.modelUsed,
        confidence: semanticResult.confidence,
        unresolved: semanticResult.unresolved,
        semanticError: semanticError || null
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка сервера.' });
  }
});

app.post('/api/update-field-text', async (req, res) => {
  try {
    const opponent = String(req.body.opponent || '').trim();
    const field = String(req.body.field || '').trim().toLowerCase();
    const row = Number(req.body.row);
    const value = normalizeOutputPunctuation(String(req.body.value || ''));
    const targetSheetName = normalizeSheetName(req.body.sheetName, voiceSheetName());

    if (!opponent) {
      return res.status(400).json({ error: 'Не выбран оппонент.' });
    }
    if (!FIELD_KEYS.has(field)) {
      return res.status(400).json({ error: 'Некорректное поле для ручной правки.' });
    }
    if (!Number.isFinite(row) || row < 2) {
      return res.status(400).json({ error: 'Некорректный номер строки для правки.' });
    }
    if (!SHEETS_WEBHOOK_URL) {
      return res.status(400).json({ error: 'SHEETS_WEBHOOK_URL не задан.' });
    }

    const sheetsResult = await postToSheets({
      action: 'update_field',
      row,
      field,
      value,
      opponent,
      sheetName: targetSheetName || undefined
    });

    if (sheetsResult?.ok === false) {
      throw new Error(sheetsResult.error || 'Apps Script вернул ошибку при ручной правке поля.');
    }
    clearProfileCacheForOpponent(opponent);

    return res.json({
      ok: true,
      row,
      field,
      value,
      sheetName: sheetsResult?.sheetName || targetSheetName || null
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка сервера.' });
  }
});

app.post('/api/hh-manual-presupp-text', async (req, res) => {
  try {
    const opponent = String(req.body?.opponent || '').trim();
    const field = String(req.body?.field || '').trim().toLowerCase();
    const value = normalizeOutputPunctuation(String(req.body?.value || ''));
    if (!HH_PRESUPP_FIELDS.has(field)) {
      return res.status(400).json({ error: 'Некорректное поле HH presupposition.' });
    }
    if (!opponent) {
      return res.status(400).json({ error: 'Не выбран целевой игрок.' });
    }

    const resolved = resolveHhManualKey({
      opponent,
      row: req.body?.row,
      handNumber: req.body?.handNumber,
      room: req.body?.room
    });

    const saved = upsertHhManualPresupposition(HH_DB_PATH, {
      targetIdentity: resolved.targetIdentity || extractTargetIdentity(opponent),
      handNumber: resolved.handNumber,
      room: resolved.room,
      field,
      value
    });
    clearProfileCacheForOpponent(opponent);

    return res.json({
      ok: true,
      field,
      value,
      handNumber: saved.handNumber,
      room: saved.room,
      fields: saved.fields
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка сохранения HH presupposition.' });
  }
});

app.post('/api/hh-manual-presupp-audio', upload.single('audio'), async (req, res) => {
  try {
    const opponent = String(req.body?.opponent || '').trim();
    const field = String(req.body?.field || '').trim().toLowerCase();
    if (!HH_PRESUPP_FIELDS.has(field)) {
      return res.status(400).json({ error: 'Некорректное поле HH presupposition.' });
    }
    if (!opponent) {
      return res.status(400).json({ error: 'Не выбран целевой игрок.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Аудио не получено.' });
    }

    const resolved = resolveHhManualKey({
      opponent,
      row: req.body?.row,
      handNumber: req.body?.handNumber,
      room: req.body?.room
    });

    const transcript = await transcribeAudio(req.file.buffer, req.file.originalname, req.file.mimetype);
    const vocabulary = loadVocabulary();
    const semanticField = field === 'hand_presupposition' ? 'presupposition' : field;

    let semanticError = '';
    let semanticResult = { value: '', confidence: null, unresolved: [], modelUsed: null };
    if (NOTS_SEMANTIC_ENABLED) {
      try {
        semanticResult = await parseFieldSemantic(transcript, semanticField, vocabulary);
      } catch (error) {
        semanticError = error.message || 'Ошибка semantic parser.';
      }
    }

    const value = semanticResult.value || normalizeFieldContent(transcript, vocabulary, { spellingMode: SPELLING_MODE });
    if (!value) {
      const detail = semanticError ? ` Semantic parser: ${semanticError}` : '';
      return res.status(422).json({ error: `Не удалось распознать текст для поля.${detail}`, transcript });
    }

    const saved = upsertHhManualPresupposition(HH_DB_PATH, {
      targetIdentity: resolved.targetIdentity || extractTargetIdentity(opponent),
      handNumber: resolved.handNumber,
      room: resolved.room,
      field,
      value
    });
    clearProfileCacheForOpponent(opponent);

    return res.json({
      ok: true,
      transcript,
      field,
      value,
      handNumber: saved.handNumber,
      room: saved.room,
      fields: saved.fields,
      parser: {
        source: semanticResult.value ? 'semantic_llm' : 'rules',
        model: semanticResult.modelUsed,
        confidence: semanticResult.confidence,
        unresolved: semanticResult.unresolved,
        semanticError: semanticError || null
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка голосового HH presupposition.' });
  }
});

app.post('/api/hh-clear-opponent', async (req, res) => {
  try {
    const opponent = String(req.body?.opponent || '').trim();
    if (!opponent) {
      return res.status(400).json({ error: 'Не выбран игрок для очистки HH DB.' });
    }
    const result = clearHhHandsByOpponent(HH_DB_PATH, { opponent });
    clearProfileCacheForOpponent(opponent);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка очистки HH DB по игроку.' });
  }
});

app.post('/api/hh-clear-all', async (_req, res) => {
  try {
    const result = clearAllHhHands(HH_DB_PATH);
    visualProfileCache.clear();
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка полной очистки HH DB.' });
  }
});

app.post('/api/save-report', async (req, res) => {
  try {
    const report = createReportRecord(req.body || {});
    const result = appendReportJsonl(REPORTS_PATH, report);
    return res.json({
      ok: true,
      id: report.id,
      path: result.path,
      savedAt: report.savedAt
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Не удалось сохранить report.' });
  }
});

let hhAutoImportTimer = null;

function startHhAutoImportLoop() {
  if (!HH_IMPORT_ENABLED) return;
  if (!HH_IMPORT_INBOX_DIR || !HH_IMPORT_IMPORTED_DIR) {
    console.warn('HH auto-import disabled: set HH_IMPORT_INBOX_DIR and HH_IMPORT_IMPORTED_DIR.');
    return;
  }

  const runTick = async () => {
    try {
      const result = await importHandHistoryFoldersOnce({
        inputDir: HH_IMPORT_INBOX_DIR,
        importedDir: HH_IMPORT_IMPORTED_DIR
      });
      if (result?.ok && (result.savedHands > 0 || result.duplicateHands > 0 || result.skippedEmptyHands > 0 || result.failedHands > 0)) {
        console.log(
          `HH auto-import: files=${result.filesFound}, moved=${result.filesMoved}, hands=${result.totalHands}, saved=${result.savedHands}, dup=${result.duplicateHands}, skipped=${result.skippedEmptyHands || 0}, failed=${result.failedHands}`
        );
      }
    } catch (error) {
      console.error('HH auto-import tick error:', error.message || error);
    }
  };

  runTick();
  hhAutoImportTimer = setInterval(runTick, HH_IMPORT_INTERVAL_SEC * 1000);
}

const server = app.listen(port, host, () => {
  console.log(`Poker Voice Logger: http://${host}:${port}`);
  console.log(`STT config: model=${OPENAI_MODEL} language=${OPENAI_LANGUAGE || 'auto'} prompt=${OPENAI_PROMPT ? 'set' : 'empty'} vocab=${VOCAB_PATH} spelling_mode=${SPELLING_MODE ? 'on' : 'off'}`);
  console.log(`Semantic parser: ${NOTS_SEMANTIC_ENABLED ? 'on' : 'off'} primary=${NOTS_SEMANTIC_MODEL} fallbacks=[${NOTS_SEMANTIC_MODEL_FALLBACKS.join(', ')}] dict=${NOTS_SEMANTIC_DICTIONARY_PATH}`);
  console.log(`HH storage: ${HH_STORAGE}, parser=${HH_PARSER_MODE}, db=${HH_DB_PATH}`);
  console.log(`HH profile rows: default=${HH_PROFILE_ROWS_DEFAULT} max=${HH_PROFILE_ROWS_MAX}`);
  console.log(`Sheets config: voice=${voiceSheetName() || 'active-sheet'}`);
  if (HH_IMPORT_ENABLED) {
    console.log(`HH auto-import: inbox=${HH_IMPORT_INBOX_DIR || '-'} imported=${HH_IMPORT_IMPORTED_DIR || '-'} interval=${HH_IMPORT_INTERVAL_SEC}s`);
  }
  console.log(`Reports path: ${REPORTS_PATH}`);
  startHhAutoImportLoop();
});

// Imports can run for many minutes; keep HTTP responses open for long-running HH jobs.
server.requestTimeout = 0;

server.on('error', (error) => {
  if (error && (error.code === 'EADDRINUSE' || error.code === 'EPERM')) {
    console.error(`Не удалось запустить сервер на ${host}:${port}: ${error.code}`);
    return;
  }
  console.error('Ошибка запуска сервера:', error);
});

server.on('close', () => {
  if (hhAutoImportTimer) {
    clearInterval(hhAutoImportTimer);
    hhAutoImportTimer = null;
  }
});
