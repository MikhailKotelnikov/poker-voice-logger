import { normalizeFieldContent } from './core.js';

export const PARSED_FIELD_KEYS = ['preflop', 'flop', 'turn', 'river', 'presupposition'];

export function emptyParsedFields() {
  return {
    preflop: '',
    flop: '',
    turn: '',
    river: '',
    presupposition: ''
  };
}

export function hasAnyParsedField(parsed = {}) {
  return PARSED_FIELD_KEYS.some((key) => String(parsed[key] || '').trim() !== '');
}

export function mergeParsedFields(primary = {}, fallback = {}) {
  const merged = emptyParsedFields();
  for (const key of PARSED_FIELD_KEYS) {
    merged[key] = String(primary[key] || fallback[key] || '').trim();
  }
  return merged;
}

export function normalizeSemanticFieldValue(raw, vocabulary) {
  return normalizeFieldContent(raw, vocabulary, { spellingMode: false });
}

export function normalizeSemanticParsed(rawParsed, vocabulary) {
  const parsed = emptyParsedFields();
  for (const key of PARSED_FIELD_KEYS) {
    parsed[key] = normalizeSemanticFieldValue(rawParsed[key] || '', vocabulary);
  }
  return parsed;
}

export function extractFirstJsonObject(text) {
  const source = String(text || '').trim();
  if (!source) {
    return '';
  }

  const fencedMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  if (source.startsWith('{') && source.endsWith('}')) {
    return source;
  }

  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return '';
  }

  return source.slice(start, end + 1).trim();
}

export function parseSemanticModelContent(content) {
  if (content && typeof content === 'object') {
    return content;
  }

  const jsonText = extractFirstJsonObject(String(content || ''));
  if (!jsonText) {
    throw new Error('Semantic model returned non-JSON output.');
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Semantic model JSON parse error: ${error.message}`);
  }
}

export function coerceSemanticResult(raw) {
  const rawObj = raw && typeof raw === 'object' ? raw : {};
  const parsed = emptyParsedFields();

  for (const key of PARSED_FIELD_KEYS) {
    const value = rawObj[key];
    parsed[key] = typeof value === 'string' ? value.trim() : '';
  }

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

  return {
    parsed,
    confidence,
    unresolved
  };
}
