import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildSheetRangeUrl,
  normalizeVocabulary,
  parseTranscript
} from './src/core.js';

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
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini-transcribe';
const OPENAI_LANGUAGE = process.env.OPENAI_LANGUAGE || 'en';
const OPENAI_PROMPT = process.env.OPENAI_PROMPT || 'Transcribe poker dictation with lowercase English and ASCII only. Never output Cyrillic. Prefer poker shorthand: d, b, bb, bbb, xr, xb, ai, cb, tp, nutstr, l1, lt1, 3bp, 4bp, vs, i, my, 0t, t, ?, /.';
const SPELLING_MODE = String(process.env.SPELLING_MODE || '1') !== '0';

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || '';
const SHEET_URL = process.env.SHEET_URL || '';
const SHEET_NAME = process.env.SHEET_NAME || '';
const VOCAB_PATH = process.env.VOCAB_PATH || path.resolve(process.cwd(), 'vocab.json');

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

app.get('/api/open-link', async (req, res) => {
  try {
    const opponent = String(req.query.opponent || '').trim();
    if (!opponent) {
      return res.status(400).json({ error: 'Не выбран оппонент.' });
    }
    if (!SHEETS_WEBHOOK_URL) {
      return res.status(400).json({ error: 'SHEETS_WEBHOOK_URL не задан.' });
    }

    const lookupResult = await postToSheets({
      action: 'find_first_row',
      opponent,
      sheetName: SHEET_NAME || undefined
    });

    if (lookupResult?.ok === false) {
      return res.status(500).json({ error: lookupResult.error || 'Ошибка поиска строки в Sheets.' });
    }

    if (!lookupResult?.found || !lookupResult?.row) {
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
      url
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка открытия таблицы.' });
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
    const { parsed, error } = parseTranscript(transcript, vocabulary, { spellingMode: SPELLING_MODE });

    if (error) {
      return res.status(422).json({ error, transcript });
    }

    const payload = {
      opponent,
      preflop: parsed.preflop,
      flop: parsed.flop,
      turn: parsed.turn,
      river: parsed.river,
      presupposition: parsed.presupposition,
      sheetName: SHEET_NAME || undefined
    };

    const sheetsResult = await postToSheets(payload);
    if (sheetsResult?.ok === false) {
      throw new Error(sheetsResult.error || 'Apps Script вернул ошибку.');
    }

    return res.json({
      ok: true,
      transcript,
      parsed,
      row: sheetsResult?.row || null
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Ошибка сервера.' });
  }
});

const server = app.listen(port, host, () => {
  console.log(`Poker Voice Logger: http://${host}:${port}`);
  console.log(`STT config: model=${OPENAI_MODEL} language=${OPENAI_LANGUAGE} prompt=${OPENAI_PROMPT ? 'set' : 'empty'} vocab=${VOCAB_PATH} spelling_mode=${SPELLING_MODE ? 'on' : 'off'}`);
});

server.on('error', (error) => {
  if (error && (error.code === 'EADDRINUSE' || error.code === 'EPERM')) {
    console.error(`Не удалось запустить сервер на ${host}:${port}: ${error.code}`);
    return;
  }
  console.error('Ошибка запуска сервера:', error);
});
