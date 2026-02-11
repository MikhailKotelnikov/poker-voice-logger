import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  removeAllDashes,
  applySpellingModeText,
  applyTextAliases,
  BUILTIN_MIXED_LANGUAGE_ALIASES,
  buildSheetRangeUrl,
  normalizeMixedLanguageText,
  normalizeVocabulary,
  parseTranscript
} from '../src/core.js';

const vocabulary = normalizeVocabulary({
  streetAliases: {
    'нулевая улица': 'preflop',
    'первая улица': 'flop',
    'вторая улица': 'turn',
    'третья улица': 'river',
    'пресуппозиция': 'presupposition',
    'пресс-оппозиция': 'presupposition'
  },
  textAliases: {
    slash: '/',
    'miss term prop': 'miss turn prob',
    'light turn 1': 'lt1',
    'question mark': '?',
    missibet: 'miss cb',
    'but but but': 'bbb',
    'but but': 'bb',
    'двойная ставка': 'bb',
    'тройная ставка': 'bbb',
    'ставка': 'b',
    'слабая': 'l1',
    'агро': 'agro',
    'я': 'i'
  }
});

test('parseTranscript maps street aliases to correct fields', () => {
  const transcript = 'нулевая улица ставка, первая улица двойная ставка 33, вторая улица агро, третья улица я, пресуппозиция слабая';
  const { parsed, error } = parseTranscript(transcript, vocabulary);

  assert.equal(error, null);
  assert.equal(parsed.preflop, 'b');
  assert.equal(parsed.flop, 'bb 33');
  assert.equal(parsed.turn, 'agro');
  assert.equal(parsed.river, 'i');
  assert.equal(parsed.presupposition, 'l1');
});

test('parseTranscript supports noisy presupposition marker variants', () => {
  const transcript = 'первая улица топ сет, вторая улица чек чек, третья улица колл, пресс-оппозиция под контроль ривера';
  const { parsed, error } = parseTranscript(transcript, vocabulary);

  assert.equal(error, null);
  assert.equal(parsed.flop, 'top set');
  assert.equal(parsed.turn, 'check check');
  assert.equal(parsed.river, 'call');
  assert.equal(parsed.presupposition, 'pod kontrol rivera');
});

test('applyTextAliases replaces standalone tokens only', () => {
  assert.equal(applyTextAliases('я агро', vocabulary.textAliases), 'i agro');
  assert.equal(applyTextAliases('моя игра', vocabulary.textAliases), 'моя игра');
});

test('applyTextAliases prioritizes longer phrase aliases', () => {
  const input = 'missibet light turn 1 but but but question mark';
  assert.equal(applyTextAliases(input, vocabulary.textAliases), 'miss cb lt1 bbb ?');
});

test('normalizeMixedLanguageText converts ru/translit tokens before vocab aliases', () => {
  const input = 'чек рейс 100, весус май 33, слеш ай кол';
  const normalized = normalizeMixedLanguageText(input);
  assert.equal(normalized, 'check raise 100, versus my 33, slash i call');
});

test('builtin mixed-language aliases keep key translit variants', () => {
  assert.equal(BUILTIN_MIXED_LANGUAGE_ALIASES['весус'], 'versus');
  assert.equal(BUILTIN_MIXED_LANGUAGE_ALIASES['донг'], 'dong');
  assert.equal(BUILTIN_MIXED_LANGUAGE_ALIASES['тайм'], 'time');
});

test('applySpellingModeText preserves token spaces and drops space token marker', () => {
  const spoken = 'x r space 1 0 0 space 2 n d f d space v s m y 3 3 space / space i g c';
  assert.equal(applySpellingModeText(spoken), 'x r 1 0 0 2 n d f d v s m y 3 3 / i g c');
});

test('removeAllDashes strips all dash variants', () => {
  const input = '3-3 0–1 1—2 2−3 4‑5';
  assert.equal(removeAllDashes(input), '33 01 12 23 45');
});

test('parseTranscript returns explicit error when no street markers', () => {
  const { parsed, error } = parseTranscript('просто заметка без улиц', vocabulary);
  assert.equal(parsed.preflop, undefined);
  assert.match(error, /Не найдены маркеры улиц/);
});

test('buildSheetRangeUrl builds stable deep link', () => {
  const url = buildSheetRangeUrl({
    row: 23,
    gid: 125,
    spreadsheetId: 'abc123',
    sheetUrl: ''
  });

  assert.equal(url, 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=125&range=A23');
});

test('project vocab normalizes dictated aliases from noisy speech', () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const raw = JSON.parse(fs.readFileSync(path.join(testDir, '..', 'vocab.json'), 'utf8'));
  const vocabFromFile = normalizeVocabulary(raw);

  const spoken = [
    'Dong seventy-five A1',
    'Question mark',
    'Missibet',
    'Light turn 1'
  ].join('. ');

  const normalized = applyTextAliases(spoken, vocabFromFile.textAliases);

  assert.match(normalized, /\bd 75 A1\b/i);
  assert.match(normalized, /\?/i);
  assert.match(normalized, /\bmiss cb\b/i);
  assert.match(normalized, /\blt1\b/i);
});

test('project vocab normalizes slash tighten and bb/xr/xb patterns', () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const raw = JSON.parse(fs.readFileSync(path.join(testDir, '..', 'vocab.json'), 'utf8'));
  const vocabFromFile = normalizeVocabulary(raw);

  const spoken = '75 cb l1 titan pre great call vs my50 d 75 l1 0 time slash i raise 100 i bet bet push straight light 4 bet pot light kk push vs my check raise 100 i check back 3 bet pot he fold 4 vs my33';
  const normalized = applyTextAliases(spoken, vocabFromFile.textAliases);

  assert.match(normalized, /\btighten pre\b/i);
  assert.match(normalized, /\b0t\s*\/\s*i\b/i);
  assert.match(normalized, /\bi bb push straight\b/i);
  assert.match(normalized, /\blite 4 b pot\b/i);
  assert.match(normalized, /\bxr 100\b/i);
  assert.match(normalized, /\bxb 3 b pot\b/i);
  assert.match(normalized, /\bhe fold 4 vs my33\b/i);
});

test('project vocab maps t-prod tprob rprob to/plyus/pair and this-is->vs', () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const raw = JSON.parse(fs.readFileSync(path.join(testDir, '..', 'vocab.json'), 'utf8'));
  const vocabFromFile = normalizeVocabulary(raw);

  const spoken = 'turn t-prod 75 to pair, river rprob 100, 0 time, plyus this is me and this is cap.';
  const normalized = applyTextAliases(spoken, vocabFromFile.textAliases);

  assert.match(normalized, /\btp 75 2 p\b/i);
  assert.match(normalized, /\brp 100\b/i);
  assert.match(normalized, /\b0t\b/i);
  assert.match(normalized, /\+\s+vs me\s+vs cap/i);
});

test('project vocab maps pilot ru codewords to poker shorthand', () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const raw = JSON.parse(fs.readFileSync(path.join(testDir, '..', 'vocab.json'), 'utf8'));
  const vocabFromFile = normalizeVocabulary(raw);

  const spoken = 'флоп фул алынкод спр 1, терн тпроб семьпять двепары, ривер тпб сто алын нольтайм плюс шоу противменя противкапа';
  const normalized = applyTextAliases(spoken, vocabFromFile.textAliases);

  assert.ok(normalized.includes('флоп full ai spr 1'));
  assert.ok(normalized.includes('терн tp 75 2p'));
  assert.ok(normalized.includes('ривер tpb 100 ai 0t + show vsme vscap'));
});

test('parseTranscript supports spelling mode for letter-by-letter dictation', () => {
  const transcript = 'флоп x r space 1 0 0 space 2 n d f d space v s space m e space slash space i g c';
  const { parsed, error } = parseTranscript(transcript, vocabulary, { spellingMode: true });
  assert.equal(error, null);
  assert.equal(parsed.flop, 'x r 1 0 0 2 n d f d v s m e / i g c');
});

test('parseTranscript recognizes spaced street markers and press marker', () => {
  const transcript = 'f l o p xr 100, t u r n tp 75, r i v e r bb 100, press vs me vs cap';
  const { parsed, error } = parseTranscript(transcript, vocabulary);
  assert.equal(error, null);
  assert.equal(parsed.flop, 'xr 100');
  assert.equal(parsed.turn, 'tp 75');
  assert.equal(parsed.river, 'bb 100');
  assert.equal(parsed.presupposition, 'vs me vs cap');
});
