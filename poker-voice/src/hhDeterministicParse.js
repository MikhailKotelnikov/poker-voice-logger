import {
  emptyParsedFields,
  hasAnyParsedField
} from './semantic.js';
import {
  canonicalizeHandHistoryUnits,
  enrichHandHistoryParsed,
  parseHandHistory
} from './handHistory.js';

export function parseHandHistoryDeterministic(handHistory, opponent = '', options = {}) {
  const allowEmpty = Boolean(options?.allowEmpty);
  const text = String(handHistory || '').trim();
  if (!text) {
    if (allowEmpty) {
      return {
        parsedHH: null,
        parsed: emptyParsedFields(),
        targetPlayer: '',
        skippedEmpty: true
      };
    }
    throw new Error('Пустая hand history.');
  }

  const parsedHH = parseHandHistory(text, opponent);
  let parsed = emptyParsedFields();
  parsed = canonicalizeHandHistoryUnits(parsed, parsedHH);
  parsed = enrichHandHistoryParsed(parsed, parsedHH);

  const hasFields = hasAnyParsedField(parsed);
  if (!hasFields && !allowEmpty) {
    throw new Error('Не удалось извлечь структуру раздачи из hand history.');
  }

  return {
    parsedHH,
    parsed,
    targetPlayer: parsedHH?.targetPlayer || '',
    skippedEmpty: !hasFields
  };
}
