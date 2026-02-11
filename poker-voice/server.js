import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

const app = express();
const port = process.env.PORT || 8787;

app.use(express.static('public'));
app.use(express.json({ limit: '2mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'whisper-1';
const OPENAI_LANGUAGE = process.env.OPENAI_LANGUAGE || 'ru';
const OPENAI_PROMPT = process.env.OPENAI_PROMPT || '';

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || '';
const SHEET_NAME = process.env.SHEET_NAME || '';
const VOCAB_PATH = process.env.VOCAB_PATH || path.resolve(process.cwd(), 'vocab.json');

const STREET_KEYS = new Set(['preflop', 'flop', 'turn', 'river', 'presupposition']);

const BASE_STREET_MARKERS = [
  { key: 'preflop', variants: ['префлоп', 'preflop', 'пре флоп', 'пф'] },
  { key: 'flop', variants: ['флоп', 'flop'] },
  { key: 'turn', variants: ['терн', 'turn'] },
  { key: 'river', variants: ['ривер', 'river'] },
  { key: 'presupposition', variants: ['пресуппозиция', 'пресуппозицию', 'пресуппозиции', 'пресуп', 'presupposition', 'presupp', 'предпосылка', 'предпосылки'] }
];

function normalizeVocabulary(rawVocabulary) {
  const normalized = {
    streetAliases: {},
    textAliases: {}
  };

  if (!rawVocabulary || typeof rawVocabulary !== 'object') {
    return normalized;
  }

  if (rawVocabulary.streetAliases && typeof rawVocabulary.streetAliases === 'object') {
    for (const [spokenRaw, targetRaw] of Object.entries(rawVocabulary.streetAliases)) {
      const spoken = String(spokenRaw || '').trim().toLowerCase();
      const target = String(targetRaw || '').trim().toLowerCase();
      if (!spoken || !STREET_KEYS.has(target)) continue;
      normalized.streetAliases[spoken] = target;
    }
  }

  if (rawVocabulary.textAliases && typeof rawVocabulary.textAliases === 'object') {
    for (const [spokenRaw, targetRaw] of Object.entries(rawVocabulary.textAliases)) {
      const spoken = String(spokenRaw || '').trim();
      const target = String(targetRaw || '').trim();
      if (!spoken) continue;
      normalized.textAliases[spoken] = target;
    }
  }

  return normalized;
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

function buildStreetMarkers(vocabulary) {
  const variantsByKey = new Map();
  for (const marker of BASE_STREET_MARKERS) {
    variantsByKey.set(marker.key, new Set(marker.variants.map((variant) => variant.toLowerCase())));
  }

  for (const [spoken, targetKey] of Object.entries(vocabulary.streetAliases || {})) {
    if (!variantsByKey.has(targetKey)) continue;
    variantsByKey.get(targetKey).add(spoken.toLowerCase());
  }

  return BASE_STREET_MARKERS.map((marker) => ({
    key: marker.key,
    variants: Array.from(variantsByKey.get(marker.key))
  }));
}

function findNextMarker(lowerText, startIndex, streetMarkers) {
  let best = null;
  for (const marker of streetMarkers) {
    for (const variant of marker.variants) {
      const idx = lowerText.indexOf(variant, startIndex);
      if (idx === -1) continue;
      if (!best || idx < best.index || (idx === best.index && variant.length > best.length)) {
        best = {
          key: marker.key,
          index: idx,
          length: variant.length
        };
      }
    }
  }
  return best;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyTextAliases(text, textAliases) {
  const aliases = Object.entries(textAliases || {})
    .filter(([spoken]) => spoken)
    .sort((a, b) => b[0].length - a[0].length);

  let result = text;
  for (const [spoken, replacement] of aliases) {
    const regex = new RegExp(escapeRegExp(spoken), 'gi');
    result = result.replace(regex, replacement);
  }
  return result.trim();
}

function parseTranscript(transcript, vocabulary) {
  const text = (transcript || '').trim();
  if (!text) {
    return { parsed: {}, error: 'Пустая транскрипция.' };
  }

  const lower = text.toLowerCase();
  const streetMarkers = buildStreetMarkers(vocabulary);
  const markers = [];
  let cursor = 0;
  while (cursor < lower.length) {
    const next = findNextMarker(lower, cursor, streetMarkers);
    if (!next) break;
    markers.push(next);
    cursor = next.index + next.length;
  }

  if (!markers.length) {
    return { parsed: {}, error: 'Не найдены маркеры улиц (например “флоп”, “терн”, “ривер”, “пресуппозиция”).' };
  }

  const parsed = {
    preflop: '',
    flop: '',
    turn: '',
    river: '',
    presupposition: ''
  };

  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    const start = current.index + current.length;
    const end = next ? next.index : text.length;
    const raw = text.slice(start, end).trim();
    const cleaned = raw.replace(/^[:\-–—\s]+/, '').trim();
    const normalizedValue = applyTextAliases(cleaned, vocabulary.textAliases);

    if (parsed[current.key]) {
      parsed[current.key] = `${parsed[current.key]} | ${normalizedValue}`.trim();
    } else {
      parsed[current.key] = normalizedValue;
    }
  }

  return { parsed, error: null };
}

async function transcribeAudio(buffer, filename, mimetype) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY не задан.');
  }

  const form = new FormData();
  const blob = new Blob([buffer], { type: mimetype || 'audio/webm' });
  form.append('file', blob, filename || 'audio.webm');
  form.append('model', OPENAI_MODEL);
  form.append('language', OPENAI_LANGUAGE);
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

async function postToSheets(payload) {
  if (!SHEETS_WEBHOOK_URL) {
    return { skipped: true };
  }

  const response = await fetch(SHEETS_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ошибка при записи в Sheets: ${text}`);
  }

  return response.json().catch(() => ({ ok: true }));
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
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
    const { parsed, error } = parseTranscript(transcript, vocabulary);

    if (error) {
      return res.status(422).json({ error, transcript });
    }

    const timing = new Date().toISOString();
    const payload = {
      opponent,
      preflop: parsed.preflop,
      flop: parsed.flop,
      turn: parsed.turn,
      river: parsed.river,
      presupposition: parsed.presupposition,
      timing,
      transcript,
      sheetName: SHEET_NAME || undefined
    };

    await postToSheets(payload);

    return res.json({ ok: true, transcript, parsed, timing });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка сервера.' });
  }
});

app.listen(port, () => {
  console.log(`Poker Voice Logger: http://localhost:${port}`);
});
