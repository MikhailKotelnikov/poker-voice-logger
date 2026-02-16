import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeVocabulary } from '../src/core.js';
import {
  coerceSemanticResult,
  extractFirstJsonObject,
  hasAnyParsedField,
  mergeParsedFields,
  normalizeSemanticParsed,
  parseSemanticModelContent
} from '../src/semantic.js';

const vocabulary = normalizeVocabulary({
  textAliases: {
    ставка: 'b',
    я: 'i',
    'против меня': 'vsme'
  }
});

test('extractFirstJsonObject supports fenced markdown payload', () => {
  const input = `\`\`\`json
{"flop":"cb33","confidence":0.9}
\`\`\``;
  assert.equal(extractFirstJsonObject(input), '{"flop":"cb33","confidence":0.9}');
});

test('parseSemanticModelContent parses embedded json object', () => {
  const content = 'model output: {"flop":"cb33","turn":"xb"}';
  const parsed = parseSemanticModelContent(content);
  assert.equal(parsed.flop, 'cb33');
  assert.equal(parsed.turn, 'xb');
});

test('coerceSemanticResult keeps allowed structure', () => {
  const result = coerceSemanticResult({
    flop: 'cb33',
    confidence: 1.5,
    unresolved: ['missing river', '', '  ']
  });

  assert.equal(result.parsed.flop, 'cb33');
  assert.equal(result.parsed.turn, '');
  assert.equal(result.confidence, 1);
  assert.deepEqual(result.unresolved, ['missing river']);
});

test('normalizeSemanticParsed applies vocab aliases and canonical light marker', () => {
  const parsed = normalizeSemanticParsed({
    flop: 'L1 ставка 33',
    river: 'я ставка 100 против меня'
  }, vocabulary);

  assert.equal(parsed.flop, 'L b33');
  assert.equal(parsed.river, 'i b100 vsme');
});

test('hasAnyParsedField and mergeParsedFields keep fallback values', () => {
  assert.equal(hasAnyParsedField({ flop: '' }), false);
  assert.equal(hasAnyParsedField({ flop: 'cb33' }), true);

  const merged = mergeParsedFields(
    { flop: 'cb33' },
    { preflop: '3b', turn: 'xb' }
  );

  assert.equal(merged.preflop, '3b');
  assert.equal(merged.flop, 'cb33');
  assert.equal(merged.turn, 'xb');
});
