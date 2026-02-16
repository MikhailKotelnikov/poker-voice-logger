export const STREET_KEYS = new Set(['preflop', 'flop', 'turn', 'river', 'presupposition']);

export const BASE_STREET_MARKERS = [
  { key: 'preflop', variants: ['префлоп', 'preflop', 'пре флоп', 'пф', 'p r e f l o p'] },
  { key: 'flop', variants: ['флоп', 'флопа', 'флопер', 'flop', 'f l o p'] },
  { key: 'turn', variants: ['терн', 'тёрн', 'терм', 'turn', 't u r n'] },
  { key: 'river', variants: ['ривер', 'ривир', 'river', 'r i v e r'] },
  {
    key: 'presupposition',
    variants: [
      'пресуппозиция', 'пресуппозицию', 'пресуппозиции',
      'прессуппозиция', 'прессуппозицию', 'прессуппозиции',
      'пресуп', 'суппозиция', 'суппозицию', 'суппозиции',
      'пресс оппозиция', 'пресс-оппозиция',
      'пресс позиция', 'пресс-позиция', 'пресспозиция',
      'пресс', 'press', 'p r e s s',
      'presupposition', 'presupp',
      'предпосылка', 'предпосылки'
    ]
  }
];

export function normalizeSpoken(value) {
  return String(value || '')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .trim();
}

export function normalizeVocabulary(rawVocabulary) {
  const normalized = {
    streetAliases: {},
    textAliases: {},
    spellingAliases: {}
  };

  if (!rawVocabulary || typeof rawVocabulary !== 'object') {
    return normalized;
  }

  if (rawVocabulary.streetAliases && typeof rawVocabulary.streetAliases === 'object') {
    for (const [spokenRaw, targetRaw] of Object.entries(rawVocabulary.streetAliases)) {
      const spoken = normalizeSpoken(spokenRaw);
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

  if (rawVocabulary.spellingAliases && typeof rawVocabulary.spellingAliases === 'object') {
    for (const [spokenRaw, targetRaw] of Object.entries(rawVocabulary.spellingAliases)) {
      const spoken = normalizeSpoken(spokenRaw);
      const target = String(targetRaw || '').trim();
      if (!spoken || !target) continue;
      normalized.spellingAliases[spoken] = target;
    }
  }

  return normalized;
}

export function buildStreetMarkers(vocabulary) {
  const variantsByKey = new Map();
  for (const marker of BASE_STREET_MARKERS) {
    variantsByKey.set(marker.key, new Set(marker.variants.map((variant) => normalizeSpoken(variant))));
  }

  for (const [spoken, targetKey] of Object.entries(vocabulary.streetAliases || {})) {
    if (!variantsByKey.has(targetKey)) continue;
    variantsByKey.get(targetKey).add(normalizeSpoken(spoken));
  }

  return BASE_STREET_MARKERS.map((marker) => ({
    key: marker.key,
    variants: Array.from(variantsByKey.get(marker.key))
  }));
}

export function findNextMarker(lowerText, startIndex, streetMarkers) {
  let best = null;
  for (const marker of streetMarkers) {
    for (const variant of marker.variants) {
      const regex = buildSpokenRegex(variant);
      regex.lastIndex = startIndex;
      const match = regex.exec(lowerText);
      if (!match) continue;
      const idx = match.index;
      const length = match[0].length;
      if (!best || idx < best.index || (idx === best.index && length > best.length)) {
        best = {
          key: marker.key,
          index: idx,
          length
        };
      }
    }
  }
  return best;
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildAliasRegex(spoken) {
  return buildSpokenRegex(spoken);
}

function buildSpokenRegex(spoken) {
  const escaped = escapeRegExp(spoken);
  const isSingleToken = /^[\p{L}\p{N}_-]+$/u.test(spoken);
  if (!isSingleToken) {
    return new RegExp(escaped, 'giu');
  }

  return new RegExp(`(?<![\\p{L}\\p{N}_-])${escaped}(?![\\p{L}\\p{N}_-])`, 'giu');
}

export function applyTextAliases(text, textAliases) {
  const aliases = Object.entries(textAliases || {})
    .filter(([spoken]) => spoken)
    .sort((a, b) => b[0].length - a[0].length);

  let result = text;
  for (const [spoken, replacement] of aliases) {
    const regex = buildAliasRegex(spoken);
    result = result.replace(regex, replacement);
  }
  return result.trim();
}

export function applySpellingAliases(text, spellingAliases) {
  const aliases = Object.entries(spellingAliases || {})
    .filter(([spoken, target]) => spoken && target)
    .sort((a, b) => b[0].length - a[0].length);

  let result = normalizeSpoken(text);
  for (const [spoken, replacement] of aliases) {
    const regex = buildAliasRegex(spoken);
    result = result.replace(regex, replacement);
  }
  return result.trim();
}

export const BUILTIN_MIXED_LANGUAGE_ALIASES = {
  'вопросительный знак': 'question mark',
  'вопр знак': 'question mark',
  'вопрос': 'question mark',
  'чек рейс': 'check raise',
  'чек рейз': 'check raise',
  'чек-рейс': 'check raise',
  'чек бек': 'check back',
  'чек-бек': 'check back',
  'чекбэк': 'check back',
  'чекбек': 'check back',
  'чек': 'check',
  'версус': 'versus',
  'весус': 'versus',
  'везус': 'versus',
  'вс': 'versus',
  'слеш': 'slash',
  'слэш': 'slash',
  'спейс': 'space',
  'спэйс': 'space',
  'ноль тайм': '0 time',
  'нулевой тайм': '0 time',
  'тайм': 'time',
  'т': 'time',
  'бет': 'bet',
  'бетбет': 'bet bet',
  'бат': 'bet',
  'бут': 'but',
  'донк': 'donk',
  'донг': 'dong',
  'д': 'dong',
  'рейс': 'raise',
  'рейз': 'raise',
  'колл': 'call',
  'кол': 'call',
  'пуш': 'push',
  'стрит': 'straight',
  'флеш': 'flush',
  'дро': 'draw',
  'дрон': 'draw',
  'агрит': 'agro',
  'агро': 'agro',
  'хим': 'him',
  'хи': 'he',
  '3 вей': '3w',
  '3-вей': '3w',
  '3 нац': '3 nuts',
  '3-нац': '3 nuts',
  'нац': 'nuts',
  'анблаф': 'unbluff',
  'туппер': 'tp',
  'топпер': 'tp',
  'пропс': 'tp',
  'мидл': 'middle',
  'пот': 'pot',
  'вей': 'way',
  'три': '3',
  'ноль': '0',
  'хьюдж': 'huge',
  'олл ин': 'all in',
  'ол-ин': 'all in',
  'ай': 'i',
  'май': 'my'
};

const CYRILLIC_TO_LATIN = {
  А: 'A', а: 'a', Б: 'B', б: 'b', В: 'V', в: 'v', Г: 'G', г: 'g', Д: 'D', д: 'd',
  Е: 'E', е: 'e', Ё: 'E', ё: 'e', Ж: 'Zh', ж: 'zh', З: 'Z', з: 'z', И: 'I', и: 'i',
  Й: 'Y', й: 'y', К: 'K', к: 'k', Л: 'L', л: 'l', М: 'M', м: 'm', Н: 'N', н: 'n',
  О: 'O', о: 'o', П: 'P', п: 'p', Р: 'R', р: 'r', С: 'S', с: 's', Т: 'T', т: 't',
  У: 'U', у: 'u', Ф: 'F', ф: 'f', Х: 'Kh', х: 'kh', Ц: 'Ts', ц: 'ts', Ч: 'Ch', ч: 'ch',
  Ш: 'Sh', ш: 'sh', Щ: 'Sch', щ: 'sch', Ъ: '', ъ: '', Ы: 'Y', ы: 'y', Ь: '', ь: '',
  Э: 'E', э: 'e', Ю: 'Yu', ю: 'yu', Я: 'Ya', я: 'ya'
};

export function transliterateCyrillicText(text) {
  return String(text || '').replace(/[А-Яа-яЁё]/g, (char) => CYRILLIC_TO_LATIN[char] ?? char);
}

export function normalizeMixedLanguageText(text) {
  const normalized = normalizeSpoken(text);
  const bridged = applyTextAliases(normalized, BUILTIN_MIXED_LANGUAGE_ALIASES);
  return transliterateCyrillicText(bridged);
}

export function applySpellingModeText(text, options = {}) {
  const spaceTokens = new Set((options.spaceTokens || ['space']).map((value) => normalizeSpoken(value)));
  const normalized = normalizeSpoken(text)
    .replace(/[,\u2026]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return '';
  }

  const parts = [];
  for (const token of normalized.split(' ')) {
    if (!token) continue;

    if (spaceTokens.has(token)) {
      continue;
    }

    const cleanToken = token
      .replace(/[‐‑‒–—−-]/g, '')
      .replace(/[^a-z0-9?\/+_|.]/g, '');

    if (!cleanToken) continue;
    parts.push(cleanToken);
  }

  return parts.join(' ').trim();
}

export function removeAllDashes(text) {
  return String(text || '').replace(/[‐‑‒–—−-]/g, '');
}

export function removeNonDecimalDots(text) {
  const source = String(text || '');
  let out = '';

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch !== '.') {
      out += ch;
      continue;
    }

    const prev = source[i - 1] || '';
    const next = source[i + 1] || '';
    if (/\d/.test(prev) && /\d/.test(next)) {
      out += '.';
    }
  }

  return out;
}

export function normalizeOutputPunctuation(text) {
  return removeNonDecimalDots(removeAllDashes(text))
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalizeAceRankCase(text) {
  let out = String(text || '');

  // board context like ona72 -> onA72
  out = out.replace(/\bona(?=[2-9kqjt])/g, 'onA');

  // token-leading Ace rank: a72, ak, aa_nfd -> A72, Ak, AA_nfd
  out = out.replace(/\baa(?=[_2-9kqjt]|$)/g, 'AA');
  out = out.replace(/\ba(?=[2-9kqjt])/g, 'A');
  out = out.replace(/\ba(?=\d)/g, 'A');

  // underscore-joined segments: *_a72, *_ak, *_aa_*
  out = out.replace(/(?<=_)aa(?=[_2-9kqjt]|$)/g, 'AA');
  out = out.replace(/(?<=_)a(?=[2-9kqjt])/g, 'A');
  out = out.replace(/(?<=_)a(?=\d)/g, 'A');
  out = out.replace(/\baads\b/g, 'AAds');

  return out;
}

export function canonicalizeLineAndSizing(text) {
  let out = String(text || '');

  out = out.replace(
    /\b(bbb|bb|cb|tpb|tp|xr|bl|b|r|d|c)\s+((?:\d+(?:\.\d+)?)|(?:\d+x\+?))\b/g,
    '$1$2'
  );
  out = out.replace(
    /\bvs\s+((?:\d+(?:\.\d+)?)|(?:[a-z_]+\d+(?:\.\d+)?))\b/g,
    'vs$1'
  );
  out = out.replace(/\b(\d+(?:\.\d+)?)\s+tb\b/g, '$1tb');
  out = out.replace(/\bxrai\b/g, 'xr_ai');

  return out;
}

export function canonicalizeLightMarkers(text) {
  let out = String(text || '');
  out = out.replace(/\bl\d+\b/g, 'L');
  out = out.replace(/\bl([ftr])\b/g, 'L$1');
  out = out.replace(/\bl\b/g, 'L');
  return out;
}

export function canonicalizeCompositeSpecs(text) {
  const suffixTokens = new Set(['naked', 'fd', 'nfd', 'oe', 'wrap', 'mp', 'mpp', 't']);
  const basePattern = /^(topset|set|2p|low2p|mp|mpp|aa|AA|AAds|bluff|t)(?:_[a-z0-9]+)*$/;

  const tokens = String(text || '').split(/\s+/).filter(Boolean);
  const out = [];

  for (let i = 0; i < tokens.length; i += 1) {
    let current = tokens[i];
    while (
      i + 1 < tokens.length
      && suffixTokens.has(tokens[i + 1])
      && (current.includes('_') || basePattern.test(current))
    ) {
      current = `${current}_${tokens[i + 1]}`;
      i += 1;
    }
    out.push(current);
  }

  return out.join(' ').trim();
}

export function canonicalizeBoardContexts(text) {
  let out = String(text || '');
  out = out.replace(/\bon_str_turn\b/gi, 'onStrTurn');
  out = out.replace(/\bonstrturn\b/gi, 'onStrTurn');
  return out;
}

export function canonicalizeGcMarkers(text) {
  let out = String(text || '');
  // keep gc as local interpretation marker.
  out = out.replace(/(?<!\[)\bgc(\+{1,3})(?!\])/gi, (_match, suffix) => `[gc${suffix}]`);
  out = out.replace(/(?<!\[)\bgc\b(?!\])/gi, '[gc]');
  return out;
}

export function normalizeFieldContent(rawText, vocabulary, options = {}) {
  const spellingMode = Boolean(options.spellingMode);
  const cleaned = String(rawText || '')
    .trim()
    .replace(/^[:,\-–—\s]+/, '')
    .replace(/[,\s]+$/, '')
    .trim();

  if (!cleaned) {
    return '';
  }

  // Pass 1: spelling normalization by explicit spoken variants.
  const spellingPass1 = applySpellingAliases(normalizeSpoken(cleaned), vocabulary.spellingAliases);
  // Pass 2: apply user vocab directly on raw (supports Russian keys in vocab.json).
  const vocabPass1 = applyTextAliases(spellingPass1, vocabulary.textAliases);
  // Pass 2: bridge mixed-language/translit tokens into English.
  const mixedLanguageNormalized = normalizeMixedLanguageText(vocabPass1);
  // Pass 3: apply user vocab and spelling aliases again after bridge.
  const vocabPass2 = applyTextAliases(mixedLanguageNormalized, vocabulary.textAliases);
  const spellingPass2 = applySpellingAliases(vocabPass2, vocabulary.spellingAliases);
  const normalizedValue = transliterateCyrillicText(spellingPass2)
    .replace(/\s+/g, ' ')
    .trim();

  const modeValue = spellingMode ? applySpellingModeText(normalizedValue) : normalizedValue;
  const punctuation = normalizeOutputPunctuation(modeValue);
  const lineAndSizing = spellingMode ? punctuation : canonicalizeLineAndSizing(punctuation);
  const boardContexts = spellingMode ? lineAndSizing : canonicalizeBoardContexts(lineAndSizing);
  const composites = spellingMode ? boardContexts : canonicalizeCompositeSpecs(boardContexts);
  const lights = spellingMode ? composites : canonicalizeLightMarkers(composites);
  const gcMarkers = spellingMode ? lights : canonicalizeGcMarkers(lights);
  return canonicalizeAceRankCase(gcMarkers);
}

export function parseTranscript(transcript, vocabulary, options = {}) {
  const spellingMode = Boolean(options.spellingMode);
  const text = (transcript || '').trim();
  if (!text) {
    return { parsed: {}, error: 'Пустая транскрипция.' };
  }

  const lower = normalizeSpoken(text);
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
    const raw = text.slice(start, end);
    const finalValue = normalizeFieldContent(raw, vocabulary, { spellingMode });

    if (!finalValue) {
      continue;
    }

    if (parsed[current.key]) {
      parsed[current.key] = `${parsed[current.key]} | ${finalValue}`.trim();
    } else {
      parsed[current.key] = finalValue;
    }
  }

  return { parsed, error: null };
}

export function buildSheetRangeUrl({ row, gid, spreadsheetId, sheetUrl = '' }) {
  const rowNumber = Number(row);
  if (!Number.isFinite(rowNumber) || rowNumber < 1) {
    return '';
  }

  let base = String(sheetUrl || '').trim();
  if (!base && spreadsheetId) {
    base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  }
  if (!base) {
    return '';
  }

  const cleanBase = base.split('#')[0];
  const sheetGid = Number(gid);
  const gidPart = Number.isFinite(sheetGid) ? sheetGid : 0;
  return `${cleanBase}#gid=${gidPart}&range=A${rowNumber}`;
}
