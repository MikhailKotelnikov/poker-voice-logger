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
const SHEET_NAME_HAND_HISTORY = process.env.SHEET_NAME_HAND_HISTORY || 'Sheet2';
const VOCAB_PATH = process.env.VOCAB_PATH || path.resolve(process.cwd(), 'vocab.json');
const REPORTS_PATH = process.env.REPORTS_PATH || path.resolve(process.cwd(), 'reports', 'nots_reports.jsonl');
const FIELD_KEYS = new Set(['preflop', 'flop', 'turn', 'river', 'presupposition']);
const VISUAL_PROFILE_CACHE_TTL_MS = Number(process.env.VISUAL_PROFILE_CACHE_TTL_MS || '180000');

const visualProfileCache = new Map();

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

function voiceSheetName() {
  return normalizeSheetName('', SHEET_NAME_VOICE);
}

function handHistorySheetName() {
  return normalizeSheetName('', SHEET_NAME_HAND_HISTORY || SHEET_NAME_VOICE);
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
  if (mode === 'hh' || mode === 'handhistory' || mode === 'hand_history') {
    return uniqueSheetNames([handHistorySheetName()]);
  }
  return uniqueSheetNames([voiceSheetName(), handHistorySheetName()]);
}

function makeVisualProfileCacheKey(opponent, scope = 'all') {
  return `${String(scope || 'all').toLowerCase()}::${String(opponent || '').trim().toLowerCase()}`;
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

async function processHandHistoryToSheets(handHistory, opponent, vocabulary, targetSheetName) {
  const parsedHH = parseHandHistory(handHistory, opponent);
  const parsedContext = buildHandHistoryContext(parsedHH);

  const semanticResult = await parseHandHistorySemantic(handHistory, opponent, parsedContext, vocabulary);

  let parsed = normalizeHandHistoryParsed(semanticResult.parsed, vocabulary);
  parsed = canonicalizeHandHistoryUnits(parsed, parsedHH);
  parsed = enrichHandHistoryParsed(parsed, parsedHH);

  if (!hasAnyParsedField(parsed)) {
    throw new Error('Не удалось извлечь структуру раздачи из hand history.');
  }

  const sheetsResult = await postToSheets({
    source: 'hh',
    opponent: 'HH',
    preflop: parsed.preflop,
    flop: parsed.flop,
    turn: parsed.turn,
    river: parsed.river,
    presupposition: parsed.presupposition,
    sheetName: targetSheetName || undefined
  });

  if (sheetsResult?.ok === false) {
    throw new Error(sheetsResult.error || 'Apps Script вернул ошибку.');
  }

  return {
    parsed,
    row: sheetsResult?.row || null,
    sheetName: sheetsResult?.sheetName || targetSheetName || null,
    parser: {
      source: 'semantic_llm',
      model: semanticResult.modelUsed,
      confidence: semanticResult.confidence,
      unresolved: [...(semanticResult.unresolved || []), `target_player=${parsedHH.targetPlayer || 'none'}`],
      semanticError: null
    },
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
  res.json({ ok: true });
});

app.get('/api/opponent-suggestions', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(5000, Math.trunc(limitRaw)))
      : 50;

    if (!SHEETS_WEBHOOK_URL) {
      return res.json({ ok: true, opponents: [] });
    }

    const sheets = resolveSheetNamesBySource('all');
    const lists = [];
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
      lists.push(Array.isArray(result?.opponents) ? result.opponents : []);
    }

    const merged = [];
    const seen = new Set();
    for (const items of lists) {
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
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(5000, Math.trunc(limitRaw)))
      : 2000;

    if (!opponent) {
      return res.status(400).json({ error: 'Не выбран оппонент.' });
    }
    if (!SHEETS_WEBHOOK_URL) {
      return res.status(400).json({ error: 'SHEETS_WEBHOOK_URL не задан.' });
    }

    const sheets = resolveSheetNamesBySource(source || 'all');
    const scopeLabel = `${source || 'all'}:${sheets.join('|').toLowerCase()}`;
    const cacheKey = makeVisualProfileCacheKey(opponent, scopeLabel);
    const now = Date.now();
    const cached = visualProfileCache.get(cacheKey);
    if (!force && cached && (now - cached.savedAt) < VISUAL_PROFILE_CACHE_TTL_MS) {
      return res.json({ ok: true, cached: true, profile: cached.profile });
    }

    const allRows = [];
    const bySheet = [];
    const hhSheetNameLc = String(handHistorySheetName() || '').trim().toLowerCase();

    for (const sheetName of sheets) {
      const requestedSheetName = String(sheetName || '').trim();
      const isHandHistorySheet = requestedSheetName.toLowerCase() === hhSheetNameLc;
      const requiresGlobalScan = Boolean(targetIdentity) && (Boolean(targetId) || isHandHistorySheet);
      const action = requiresGlobalScan ? 'get_all_rows' : 'get_opponent_rows';
      const rowsResult = await postToSheets({
        action,
        opponent,
        limit,
        sheetName: sheetName || undefined
      });

      if (rowsResult?.ok === false) {
        return res.status(500).json({ error: rowsResult.error || `Ошибка чтения строк оппонента из листа ${sheetName || 'active'}.` });
      }

      const rowsRaw = Array.isArray(rowsResult?.rows) ? rowsResult.rows : [];
      const rows = requiresGlobalScan
        ? rowsRaw.filter((row) => rowMatchesTargetProfile(row, opponent, targetIdentity))
        : rowsRaw;
      const resolvedSheetName = String(rowsResult?.sheetName || sheetName || '').trim();
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

    const profile = buildOpponentVisualProfile(allRows, { opponent });
    profile.sources = bySheet;

    visualProfileCache.set(cacheKey, {
      savedAt: now,
      profile
    });

    return res.json({
      ok: true,
      cached: false,
      profile
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка построения визуального профиля.' });
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
    if (!SHEETS_WEBHOOK_URL) {
      return res.status(400).json({ error: 'SHEETS_WEBHOOK_URL не задан.' });
    }
    if (!NOTS_SEMANTIC_ENABLED) {
      return res.status(400).json({ error: 'Для hand history нужен semantic parser (NOTS_SEMANTIC_ENABLED=1).' });
    }

    const targetSheetName = handHistorySheetName();
    const vocabulary = loadVocabulary();
    const result = await processHandHistoryToSheets(handHistory, opponent, vocabulary, targetSheetName);
    clearProfileCacheForOpponent(opponent || result.targetPlayer || '');

    return res.json({
      ok: true,
      transcript: handHistory,
      parsed: result.parsed,
      row: result.row,
      sheetName: result.sheetName,
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
    if (!SHEETS_WEBHOOK_URL) {
      return res.status(400).json({ error: 'SHEETS_WEBHOOK_URL не задан.' });
    }
    if (!NOTS_SEMANTIC_ENABLED) {
      return res.status(400).json({ error: 'Для hand history нужен semantic parser (NOTS_SEMANTIC_ENABLED=1).' });
    }

    const targetSheetName = handHistorySheetName();
    const vocabulary = loadVocabulary();
    const affectedOpponents = new Set();
    let totalHands = 0;
    let savedHands = 0;
    let failedHands = 0;
    const errors = [];
    const savedRows = [];
    let lastResult = null;

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
          const result = await processHandHistoryToSheets(handHistory, opponent, vocabulary, targetSheetName);
          if (opponent) affectedOpponents.add(opponent);
          if (result?.targetPlayer) affectedOpponents.add(result.targetPlayer);
          savedHands += 1;
          lastResult = {
            transcript: handHistory,
            ...result
          };
          if (savedRows.length < 150) {
            savedRows.push({
              file: file.originalname || `file_${savedRows.length + 1}`,
              handIndex: i + 1,
              row: result.row,
              sheetName: result.sheetName
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
      return res.status(422).json({ error: 'В загруженных файлах не найдено ни одной hand history.' });
    }

    if (savedHands > 0) {
      affectedOpponents.forEach((name) => clearProfileCacheForOpponent(name));
    }

    return res.json({
      ok: true,
      opponent: opponent || null,
      files: files.length,
      totalHands,
      savedHands,
      failedHands,
      sheetName: targetSheetName || null,
      rows: savedRows,
      errors,
      last: lastResult
        ? {
          transcript: lastResult.transcript,
          parsed: lastResult.parsed,
          row: lastResult.row,
          sheetName: lastResult.sheetName,
          parser: lastResult.parser
        }
        : null
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка пакетного разбора hand history.' });
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

const server = app.listen(port, host, () => {
  console.log(`Poker Voice Logger: http://${host}:${port}`);
  console.log(`STT config: model=${OPENAI_MODEL} language=${OPENAI_LANGUAGE || 'auto'} prompt=${OPENAI_PROMPT ? 'set' : 'empty'} vocab=${VOCAB_PATH} spelling_mode=${SPELLING_MODE ? 'on' : 'off'}`);
  console.log(`Semantic parser: ${NOTS_SEMANTIC_ENABLED ? 'on' : 'off'} primary=${NOTS_SEMANTIC_MODEL} fallbacks=[${NOTS_SEMANTIC_MODEL_FALLBACKS.join(', ')}] dict=${NOTS_SEMANTIC_DICTIONARY_PATH}`);
  console.log(`Sheets config: voice=${voiceSheetName() || 'active-sheet'} hand_history=${handHistorySheetName() || voiceSheetName() || 'active-sheet'}`);
  console.log(`Reports path: ${REPORTS_PATH}`);
});

server.on('error', (error) => {
  if (error && (error.code === 'EADDRINUSE' || error.code === 'EPERM')) {
    console.error(`Не удалось запустить сервер на ${host}:${port}: ${error.code}`);
    return;
  }
  console.error('Ошибка запуска сервера:', error);
});
