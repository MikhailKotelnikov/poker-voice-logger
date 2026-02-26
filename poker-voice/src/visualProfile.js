import { extractTargetIdentity } from './profileTarget.js';

const SIZED_BUCKET_ORDER = ['2', '3', '5', '6', '7', 'P'];
const DEFAULT_BUCKET_ORDER = [...SIZED_BUCKET_ORDER, 'Miss'];
const WITH_DONK_BUCKET_ORDER = [...DEFAULT_BUCKET_ORDER, 'Donk', 'Miss Donk'];
const STRENGTH_ORDER = [
  'nuts',
  'strong',
  'conditionalStrong',
  'fragileStrong',
  'overpair',
  'twoPair',
  'topPair',
  'strongDraw',
  'weakDraw',
  'lightFold',
  'weak',
  'unknown'
];

const LEGEND = [
  { key: 'nuts', label: 'nuts / top full+', color: '#8f2a5c' },
  { key: 'strong', label: 'strong made', color: '#d76575' },
  { key: 'conditionalStrong', label: 'Sx fold-out strong', color: '#efb8bf' },
  { key: 'fragileStrong', label: 'fragile strong (board discount)', color: '#f8d8df' },
  { key: 'overpair', label: 'overpair', color: '#c9a77a' },
  { key: 'twoPair', label: 'two pair', color: '#f09b4e' },
  { key: 'topPair', label: 'top pair', color: '#f1c84c' },
  { key: 'strongDraw', label: 'strong draw', color: '#325cbc' },
  { key: 'weakDraw', label: 'weak draw', color: '#73b7ff' },
  { key: 'lightFold', label: 'Lx fold after bet', color: '#d2d7dd' },
  { key: 'weak', label: 'weak / one pair / air', color: '#97d578' },
  { key: 'unknown', label: 'no showdown / unknown', color: '#f2f5f3' }
];

const SEMANTIC_TAG_ALIASES = {
  nutfd: 'nfd',
  monsterwrap: 'wrap'
};

const SEMANTIC_TAGS = new Set([
  'nutfull',
  'nutstr',
  'nutflush',
  'topfull',
  'quads',
  'quad',
  'strflush',
  'topset',
  'set',
  'tri',
  'full',
  'str',
  'flush',
  '2ndflush',
  'midflush',
  'lowflush',
  '2p',
  'ov',
  'ovp',
  'ov_p',
  'p',
  'mp',
  'bp',
  'bu',
  'wrap',
  'oe',
  'g',
  'nfd',
  'fd',
  'air',
  'lf',
  'lt',
  'lr',
  'sf',
  'st',
  'sr',
  'strb',
  'flb',
  'pairedboard',
  'lowstr',
  '2ndstr',
  '3rdfull',
  'lowfull'
]);

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildSamplePayload(rowLabel, streets, focusStreet = '') {
  return JSON.stringify({
    type: 'profile_sample_v2',
    rowLabel: cleanText(rowLabel),
    focusStreet: String(focusStreet || '').toLowerCase(),
    streets: {
      preflop: cleanText(streets?.preflop),
      flop: cleanText(streets?.flop),
      turn: cleanText(streets?.turn),
      river: cleanText(streets?.river)
    }
  });
}

function parseActorToken(segment) {
  const text = cleanText(segment);
  if (!text) return null;
  const match = text.match(/^(?:\(\d+(?:\.\d+)?\)\s*)?([A-Za-z0-9]+)_([A-Za-z0-9]{2,24})\b/i);
  if (!match) return null;
  return {
    actor: `${match[1]}_${match[2]}`,
    identity: String(match[2] || '').toLowerCase()
  };
}

function filterStreetByTargetActor(streetText, targetIdentity) {
  const text = cleanText(streetText);
  if (!text || !targetIdentity) return text;

  const segments = text.split(/\s*\/\s*/).map(cleanText).filter(Boolean);
  if (!segments.length) return '';

  const actorSegments = segments.filter((segment) => Boolean(parseActorToken(segment)));
  if (!actorSegments.length) return text;

  const targetSegments = actorSegments.filter((segment) => {
    const actor = parseActorToken(segment);
    return actor && actor.identity === targetIdentity;
  });

  if (!targetSegments.length) return '';
  return targetSegments.join(' / ');
}

function createBucketCounters(bucketOrder = DEFAULT_BUCKET_ORDER) {
  const out = {};
  bucketOrder.forEach((bucket) => {
    out[bucket] = {
      total: 0,
      nuts: 0,
      strong: 0,
      conditionalStrong: 0,
      fragileStrong: 0,
      overpair: 0,
      twoPair: 0,
      topPair: 0,
      strongDraw: 0,
      weakDraw: 0,
      lightFold: 0,
      weak: 0,
      unknown: 0,
      samples: {
        all: [],
        nuts: [],
        strong: [],
        conditionalStrong: [],
        fragileStrong: [],
        overpair: [],
        twoPair: [],
        topPair: [],
        strongDraw: [],
        weakDraw: [],
        lightFold: [],
        weak: [],
        unknown: []
      }
    };
  });
  return out;
}

function createSectionState(title, groups, bucketOrder = DEFAULT_BUCKET_ORDER) {
  const groupMap = {};
  groups.forEach((group) => {
    groupMap[group] = createBucketCounters(bucketOrder);
  });
  return {
    title,
    groups: groupMap,
    bucketOrder: [...bucketOrder]
  };
}

function detectBucket(textRaw) {
  const text = cleanText(textRaw).toLowerCase();
  if (!text) return null;

  const sizingTokenRegex = /\b(cb|bbb|bb|bxb|tpb|tp|fp|d|r|b)\s*(\d+(?:\.\d+)?)(x)?\b/ig;
  let hasSizedAction = false;
  let hasRaiseByX = false;
  for (const match of text.matchAll(sizingTokenRegex)) {
    const prefix = String(match?.[1] || '').toLowerCase();
    const isRaiseByX = prefix === 'r' && String(match?.[3] || '').toLowerCase() === 'x';
    if (isRaiseByX) {
      hasRaiseByX = true;
      continue;
    }
    hasSizedAction = true;
    const size = Number(match?.[2]);
    if (Number.isFinite(size)) {
      if (size <= 0) return null;
      if (size < 30) return '2';
      if (size < 45) return '3';
      if (size < 55) return '5';
      if (size < 70) return '6';
      if (size < 95) return '7';
      return 'P';
    }
  }

  if (/\bmiss\b/i.test(text)) return 'Miss';
  const hasCheck = /\b(?:x|xb|xc|xf)\b/i.test(text);
  if (hasCheck && !hasSizedAction && !hasRaiseByX) return 'Miss';

  return null;
}

const RANK_VALUE = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

function parseStreetActionToken(actionRaw) {
  const token = String(actionRaw || '').trim().toLowerCase();
  if (!token) return { kind: 'other', size: null };
  if (/^(?:x|xb)$/.test(token)) return { kind: 'check', size: null };
  if (/^(?:f|xf)$/.test(token)) return { kind: 'fold', size: null };
  if (/^c(?:\d+(?:\.\d+)?(?:bb)?)?$/.test(token)) return { kind: 'call', size: null };
  if (/^r\d+(?:\.\d+)?x$/i.test(token)) return { kind: 'raise', size: null };
  const sizeMatch = token.match(/^(?:cb|bbb|bb|bxb|tpb|tp|fp|d|r|b)(\d+(?:\.\d+)?)(?:x)?$/i);
  if (sizeMatch) {
    const size = Number(sizeMatch[1]);
    if (Number.isFinite(size) && size > 0) return { kind: 'bet', size };
  }
  if (/^(?:cb|bbb|bb|bxb|tpb|tp|fp|d|r|b)$/i.test(token)) return { kind: 'bet', size: null };
  return { kind: 'other', size: null };
}

function parseStreetSegments(textRaw) {
  const text = cleanText(textRaw);
  if (!text) return [];
  const segments = text.split(/\s*\/\s*/).map(cleanText).filter(Boolean);
  return segments.map((segment) => {
    const actor = parseActorToken(segment);
    const match = segment.match(/^(?:\(\d+(?:\.\d+)?\)\s*)?(?:[A-Za-z0-9]+_[A-Za-z0-9]{2,24})\s+([^\s/]+)/i);
    const actionToken = String(match?.[1] || '').trim();
    const action = parseStreetActionToken(actionToken);
    return {
      segment,
      actor: actor?.actor || '',
      identity: actor?.identity || '',
      actionToken,
      ...action
    };
  });
}

function streetHasActorContext(segments) {
  return Array.isArray(segments) && segments.some((segment) => Boolean(segment?.identity));
}

function streetAllChecked(segments) {
  if (!Array.isArray(segments) || !segments.length) return false;
  const actionable = segments.filter((segment) => segment?.kind && segment.kind !== 'other');
  if (!actionable.length) return false;
  return actionable.every((segment) => segment.kind === 'check');
}

function findTargetCallVsAggressor(segments, targetIdentity) {
  if (!Array.isArray(segments) || !segments.length || !targetIdentity) return null;
  let lastAggressorIdentity = '';
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment || !segment.identity || segment.kind === 'other') continue;
    if (segment.identity !== targetIdentity && (segment.kind === 'bet' || segment.kind === 'raise')) {
      lastAggressorIdentity = segment.identity;
      continue;
    }
    if (segment.identity === targetIdentity && segment.kind === 'call' && lastAggressorIdentity) {
      return {
        aggressorIdentity: lastAggressorIdentity,
        targetCallIndex: index
      };
    }
  }
  return null;
}

function firstActionIndex(segments, identity) {
  if (!Array.isArray(segments) || !segments.length || !identity) return -1;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment || segment.identity !== identity || segment.kind === 'other') continue;
    return index;
  }
  return -1;
}

function detectDonkOutcome(segments, targetIdentity, aggressorIdentity) {
  if (!Array.isArray(segments) || !segments.length || !targetIdentity || !aggressorIdentity) return '';
  const targetIndex = firstActionIndex(segments, targetIdentity);
  const aggressorIndex = firstActionIndex(segments, aggressorIdentity);
  if (targetIndex < 0 || aggressorIndex < 0 || targetIndex >= aggressorIndex) return '';

  const targetAction = segments[targetIndex];
  if (!targetAction || targetAction.kind === 'other') return '';
  if (targetAction.kind === 'bet') return 'Donk';
  if (targetAction.kind === 'check') return 'Miss Donk';
  return '';
}

function extractStreetActionSummary(textRaw) {
  const segments = parseStreetSegments(textRaw);
  if (!segments.length) {
    return {
      hasAction: false,
      hasBet: false,
      hasCheck: false,
      hasCall: false,
      hasFold: false,
      bucket: null
    };
  }

  let hasAction = false;
  let hasBet = false;
  let hasCheck = false;
  let hasCall = false;
  let hasFold = false;
  let bucket = null;

  for (const parsed of segments) {
    if (parsed.kind === 'other') continue;
    hasAction = true;
    if (parsed.kind === 'bet' || parsed.kind === 'raise') hasBet = true;
    if (parsed.kind === 'check') hasCheck = true;
    if (parsed.kind === 'call') hasCall = true;
    if (parsed.kind === 'fold') hasFold = true;
    if (!bucket && parsed.kind === 'bet' && Number.isFinite(parsed.size) && parsed.size > 0) {
      bucket = detectBucket(`b${parsed.size}`);
    }
  }

  return { hasAction, hasBet, hasCheck, hasCall, hasFold, bucket };
}

function extractCardsToken(textRaw, expectedCards = 5) {
  const text = cleanText(textRaw);
  if (!text) return '';
  const regex = expectedCards === 5
    ? /\b((?:[2-9TJQKA][cdhs]){5})\b/i
    : /\bon((?:[2-9TJQKA][cdhs]){3,5})\b/i;
  const match = text.match(regex);
  return String(match?.[1] || '').trim();
}

function extractClassToken(textRaw) {
  const tags = extractClassTags(textRaw);
  return tags[0] || '';
}

function extractClassTags(textRaw) {
  const text = cleanText(textRaw).toLowerCase();
  if (!text) return [];

  const tags = [];
  const tokenSet = new Set();
  const addSemanticTag = (valueRaw) => {
    const value = String(valueRaw || '').trim().toLowerCase();
    if (!value) return;
    const normalized = SEMANTIC_TAG_ALIASES[value] || value;
    if (!SEMANTIC_TAGS.has(normalized)) return;
    tokenSet.add(normalized);
  };

  const cardWithTagsRegex = /\b(?:[2-9tjqka][cdhs]){2,5}(?:_([a-z0-9_+.-]+))?\b/ig;
  for (const match of text.matchAll(cardWithTagsRegex)) {
    const suffix = String(match?.[1] || '').trim();
    if (!suffix) continue;
    suffix
      .split(/[_+.-]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .forEach(addSemanticTag);
  }

  text
    .split(/[^a-z0-9]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .forEach(addSemanticTag);

  tokenSet.forEach((tag) => tags.push(tag));
  return tags;
}

function ranksFromCardsToken(token) {
  const chunks = String(token || '').match(/([2-9TJQKA])[cdhs]/ig) || [];
  return chunks.map((card) => String(card[0] || '').toUpperCase()).filter(Boolean);
}

function boardIsPairedFromText(textRaw) {
  const boardToken = extractCardsToken(textRaw, 3);
  const boardRanks = ranksFromCardsToken(boardToken);
  if (!boardRanks.length) return false;
  const seen = new Set();
  for (const rank of boardRanks) {
    if (seen.has(rank)) return true;
    seen.add(rank);
  }
  return false;
}

function boardCardsFromText(textRaw) {
  const token = extractCardsToken(textRaw, 3);
  const cards = String(token || '').match(/([2-9TJQKA])([cdhs])/ig) || [];
  return cards
    .map((card) => ({
      rank: String(card[0] || '').toUpperCase(),
      suit: String(card[1] || '').toLowerCase()
    }))
    .filter((card) => card.rank && card.suit);
}

function boardMaxSuitCountFromText(textRaw) {
  const cards = boardCardsFromText(textRaw);
  if (!cards.length) return 0;
  const counts = new Map();
  cards.forEach((card) => counts.set(card.suit, (counts.get(card.suit) || 0) + 1));
  return Math.max(0, ...Array.from(counts.values()));
}

function choose(values, size) {
  const out = [];
  if (!Array.isArray(values) || size <= 0 || values.length < size) return out;
  const stack = [];
  function walk(start) {
    if (stack.length === size) {
      out.push(stack.slice());
      return;
    }
    for (let i = start; i < values.length; i += 1) {
      stack.push(values[i]);
      walk(i + 1);
      stack.pop();
    }
  }
  walk(0);
  return out;
}

function boardRankVariants(textRaw) {
  const ranks = boardCardsFromText(textRaw)
    .map((card) => RANK_VALUE[card.rank])
    .filter(Number.isFinite);
  if (!ranks.length) return [];
  const uniqueHigh = Array.from(new Set(ranks)).sort((a, b) => a - b);
  const variants = [uniqueHigh];
  if (uniqueHigh.includes(14)) {
    variants.push(Array.from(new Set(uniqueHigh.map((value) => (value === 14 ? 1 : value)))).sort((a, b) => a - b));
  }
  return variants;
}

function boardHasNToStraight(textRaw, n) {
  if (!Number.isInteger(n) || n < 3 || n > 5) return false;
  const variants = boardRankVariants(textRaw);
  for (const values of variants) {
    if (values.length < n) continue;
    const combos = choose(values, n);
    for (const combo of combos) {
      const min = Math.min(...combo);
      const max = Math.max(...combo);
      if (max - min <= 4) return true;
    }
  }
  return false;
}

function hasTagLike(tags, text, values = []) {
  return values.some((tag) => tags.has(tag) || new RegExp(`\\b${tag}\\b`, 'i').test(text));
}

function isFragileStrong(textRaw) {
  const text = ` ${cleanText(textRaw).toLowerCase()} `;
  const tags = new Set(extractClassTags(textRaw));
  if (!tags.size) return false;

  const hasStrBoardTag = hasTagLike(tags, text, ['strb', 'strboard']);
  const hasFlushBoardTag = hasTagLike(tags, text, ['flb', 'flushboard']);
  const hasPairedBoardTag = hasTagLike(tags, text, ['pairedboard']);
  const hasLowStraightTag = hasTagLike(tags, text, ['lowstr']);

  if (hasStrBoardTag || hasFlushBoardTag || hasPairedBoardTag || hasLowStraightTag) {
    return true;
  }

  const boardPaired = boardIsPairedFromText(textRaw);
  const boardFlushy = boardMaxSuitCountFromText(textRaw) >= 3;
  const boardThreeToStraight = boardHasNToStraight(textRaw, 3);
  const boardFourOrFiveToStraight = boardHasNToStraight(textRaw, 4) || boardHasNToStraight(textRaw, 5);

  const setLike = hasTagLike(tags, text, ['set', 'topset', 'tri']);
  const straightLike = hasTagLike(tags, text, ['str', 'nutstr', '2ndstr']);
  const flushLike = hasTagLike(tags, text, ['flush', '2ndflush', 'midflush', 'lowflush']);
  const nutStraight = hasTagLike(tags, text, ['nutstr']);

  if (setLike && boardThreeToStraight) return true;
  if ((setLike || straightLike) && boardFlushy) return true;
  if ((straightLike || flushLike) && boardPaired) return true;
  if (straightLike && !nutStraight && boardFourOrFiveToStraight) return true;
  return false;
}

function classifyPairSubtype(textRaw) {
  const text = cleanText(textRaw).toLowerCase();
  if (!text) return '';
  const boardPaired = boardIsPairedFromText(textRaw);
  const tags = new Set(extractClassTags(textRaw));
  if (tags.has('2p') && !boardPaired) {
    return 'twoPair';
  }

  const hasPairClass = tags.has('p') || tags.has('mp') || tags.has('bp') || tags.has('bu') || (tags.has('2p') && boardPaired);
  if (!hasPairClass) return '';

  const holeToken = extractCardsToken(textRaw, 5);
  const boardToken = extractCardsToken(textRaw, 3);
  if (!holeToken || !boardToken) return '';

  const holeRanks = ranksFromCardsToken(holeToken);
  const boardRanks = ranksFromCardsToken(boardToken);
  if (!holeRanks.length || !boardRanks.length) return '';

  const boardValues = boardRanks.map((rank) => RANK_VALUE[rank]).filter(Number.isFinite);
  if (!boardValues.length) return '';
  const boardTop = Math.max(...boardValues);

  const holeCounts = new Map();
  holeRanks.forEach((rank) => {
    holeCounts.set(rank, (holeCounts.get(rank) || 0) + 1);
  });
  for (const [rank, count] of holeCounts.entries()) {
    if (count < 2) continue;
    const rankValue = RANK_VALUE[rank];
    const boardHasRank = boardRanks.includes(rank);
    if (Number.isFinite(rankValue) && rankValue > boardTop && !boardHasRank) {
      return 'overpair';
    }
  }

  const topBoardRanks = boardRanks.filter((rank) => RANK_VALUE[rank] === boardTop);
  if (topBoardRanks.some((rank) => holeRanks.includes(rank))) {
    return 'topPair';
  }
  return '';
}

function hasShowdownClassToken(textRaw) {
  const tags = new Set(extractClassTags(textRaw));
  if (!tags.size) return false;
  return [
    'nutfull', 'nutstr', 'nutflush', 'topfull', 'quads', 'quad', 'strflush',
    'topset', 'set', '2p', 'tri', 'full', 'str', 'flush', '2ndflush', 'midflush', 'lowflush',
    'ov_p', 'ovp', 'ov',
    'wrap', 'oe', 'g', 'nfd', 'fd',
    'air', 'mp', 'bp', 'bu', 'p'
  ].some((tag) => tags.has(tag));
}

function detectLightFoldTag(actionByStreet, hasShowdownClass) {
  if (hasShowdownClass) return '';
  const flop = actionByStreet.flop || {};
  const turn = actionByStreet.turn || {};
  const river = actionByStreet.river || {};

  if (river.hasFold) return 'Lr';
  if (turn.hasFold) return 'Lt';
  if (flop.hasFold) return 'Lf';
  return '';
}

function detectConditionalStrongTag(streetTextRaw, targetIdentity, street) {
  if (!targetIdentity) return '';
  const segments = parseStreetSegments(streetTextRaw);
  if (!segments.length) return '';

  const letter = street === 'river' ? 'r' : street === 'turn' ? 't' : 'f';
  for (let i = 0; i < segments.length; i += 1) {
    const current = segments[i];
    if (!current || current.identity !== targetIdentity || current.kind !== 'bet') continue;
    const later = segments
      .slice(i + 1)
      .filter((item) => item && item.identity !== targetIdentity && item.kind !== 'other');
    if (!later.length) continue;
    if (later.every((item) => item.kind === 'fold')) {
      return `S${letter}`;
    }
  }
  return '';
}

function classifyStrength(textRaw) {
  const text = ` ${cleanText(textRaw).toLowerCase()} `;
  const tags = new Set(extractClassTags(textRaw));
  const boardPaired = boardIsPairedFromText(textRaw);

  if (['nuts', 'nutstr', 'nutfull', 'nutflush', 'topfull', 'quads', 'quad', 'strflush'].some((tag) => tags.has(tag))) {
    return 'nuts';
  }

  if (tags.has('ov_p') || tags.has('ovp') || tags.has('ov')) {
    return 'overpair';
  }

  if (tags.has('2p') && !boardPaired) {
    return 'twoPair';
  }

  const pairSubtype = classifyPairSubtype(textRaw);
  if (pairSubtype) return pairSubtype;

  if (isFragileStrong(textRaw)) {
    return 'fragileStrong';
  }

  if (['topset', 'set', 'tri', 'full', 'str', 'flush', '2ndflush', 'midflush', 'lowflush', 'lowfull', '2ndstr', '3rdfull'].some((tag) => tags.has(tag)) || /\b(?:lowfull|2ndstr|3rdfull)\b/.test(text)) {
    return 'strong';
  }

  const hasFd = tags.has('nfd') || tags.has('fd');
  const hasStraightDraw = tags.has('wrap') || tags.has('oe') || tags.has('g');
  if (tags.has('wrap') || (hasFd && hasStraightDraw) || tags.has('nfd')) {
    return 'strongDraw';
  }

  if (hasFd || hasStraightDraw || /\bdraws?\b/.test(text)) {
    return 'weakDraw';
  }

  if (tags.has('sf') || tags.has('st') || tags.has('sr')) {
    return 'conditionalStrong';
  }

  if (tags.has('lf') || tags.has('lt') || tags.has('lr')) {
    return 'lightFold';
  }

  const hasWeakToken = tags.has('air') || tags.has('mp') || tags.has('bp') || tags.has('bu') || tags.has('p') || /\bweak\b/.test(text);
  if (hasWeakToken) {
    return 'weak';
  }

  return 'unknown';
}

function hasAnyToken(textRaw, pattern) {
  return pattern.test(cleanText(textRaw).toLowerCase());
}

function detectMultiwayMarker(textRaw) {
  return hasAnyToken(textRaw, /\b(?:3w|4w|5w|mw|3-way|4-way|multiway|multi-way)\b/i);
}

function detectMultiwayByActorCount(textRaw) {
  const text = cleanText(textRaw);
  if (!text) return false;
  const matches = text.match(/\b(?:SB|BB|BTN|CO|HJ|UTG|UTG1|LJ|MP|P\d+)_[A-Za-z0-9]{2,24}\b/ig) || [];
  if (!matches.length) return false;
  const unique = new Set(matches.map((token) => String(token).toLowerCase()));
  return unique.size > 2;
}

function detectMultiway(textRaw) {
  return detectMultiwayByActorCount(textRaw) || detectMultiwayMarker(textRaw);
}

function detectProbeLine(textRaw) {
  return hasAnyToken(textRaw, /\b(?:tpb\d*|tp\d*|fp\d*|probe|prob)\b/i);
}

function detectTripleBarrelLine(textRaw) {
  return hasAnyToken(textRaw, /\bbbb(?:\d|\b)/i);
}

function detectBetBetLine(textRaw) {
  return hasAnyToken(textRaw, /\b(?:bb\d*|bxb|tpb)\b/i);
}

function detectSingleRiverBetLine(textRaw) {
  const text = cleanText(textRaw).toLowerCase();
  if (!text) return false;
  if (detectTripleBarrelLine(text) || detectBetBetLine(text)) return false;
  return /\b(?:cb|b|r|d)\s*\d+(?:\.\d+)?\b/i.test(text);
}

function addSample(samples, key, text) {
  if (!samples || !key || !text) return;
  const list = samples[key];
  if (!Array.isArray(list)) return;
  list.push(text);
}

function addCount(section, group, bucket, strength, sampleText = '') {
  if (!section || !section.groups[group] || !bucket || !section.groups[group][bucket]) return;
  const entry = section.groups[group][bucket];
  entry.total += 1;
  if (STRENGTH_ORDER.includes(strength)) {
    entry[strength] += 1;
  }
  if (sampleText) {
    addSample(entry.samples, 'all', sampleText);
    if (STRENGTH_ORDER.includes(strength)) {
      addSample(entry.samples, strength, sampleText);
    }
  }
}

function groupToRows(groupCounters, bucketOrder = DEFAULT_BUCKET_ORDER) {
  return bucketOrder.map((bucket) => {
    const row = groupCounters[bucket];
    return {
      bucket,
      total: row.total,
      counts: {
        nuts: row.nuts,
        strong: row.strong,
        conditionalStrong: row.conditionalStrong,
        fragileStrong: row.fragileStrong,
        overpair: row.overpair,
        twoPair: row.twoPair,
        topPair: row.topPair,
        strongDraw: row.strongDraw,
        weakDraw: row.weakDraw,
        lightFold: row.lightFold,
        weak: row.weak,
        unknown: row.unknown
      },
      samples: row.samples
    };
  });
}

export function buildOpponentVisualProfile(rows, options = {}) {
  const items = Array.isArray(rows) ? rows : [];
  const targetIdentity = extractTargetIdentity(options?.opponent);
  const sections = {
    flop: createSectionState('Flop Bets', ['HU', 'MW'], DEFAULT_BUCKET_ORDER),
    betbet: createSectionState('BetBet', ['All'], WITH_DONK_BUCKET_ORDER),
    probes: createSectionState('Probes', ['HU', 'MW'], DEFAULT_BUCKET_ORDER),
    riverXbb: createSectionState('Check-Bet-Bet', ['All'], WITH_DONK_BUCKET_ORDER),
    riverBxb: createSectionState('Bet-Check-Bet', ['All'], WITH_DONK_BUCKET_ORDER),
    riverOnce: createSectionState('River Once', ['All'], DEFAULT_BUCKET_ORDER),
    betbetbet: createSectionState('BetBetBet', ['All'], WITH_DONK_BUCKET_ORDER),
    total: createSectionState('TOT', ['All'], DEFAULT_BUCKET_ORDER)
  };

  let analyzedRows = 0;
  for (const row of items) {
    const rowLabel = cleanText(row?.rowLabel) || (row?.row ? `#${row.row}` : '#?');
    const preflopRaw = cleanText(row?.preflop);
    const flopRaw = cleanText(row?.flop);
    const turnRaw = cleanText(row?.turn);
    const riverRaw = cleanText(row?.river);
    const preflopText = filterStreetByTargetActor(row?.preflop, targetIdentity);
    const flopText = filterStreetByTargetActor(row?.flop, targetIdentity);
    const turnText = filterStreetByTargetActor(row?.turn, targetIdentity);
    const riverText = filterStreetByTargetActor(row?.river, targetIdentity);
    const sampleBase = {
      preflop: preflopRaw,
      flop: flopRaw,
      turn: turnRaw,
      river: riverRaw
    };
    const actionByStreet = {
      flop: extractStreetActionSummary(flopText),
      turn: extractStreetActionSummary(turnText),
      river: extractStreetActionSummary(riverText)
    };
    const segmentsByStreet = {
      flop: parseStreetSegments(flopRaw),
      turn: parseStreetSegments(turnRaw),
      river: parseStreetSegments(riverRaw)
    };
    const hasActorContext = streetHasActorContext(segmentsByStreet.flop)
      || streetHasActorContext(segmentsByStreet.turn)
      || streetHasActorContext(segmentsByStreet.river);
    const flopAllChecked = hasActorContext
      ? streetAllChecked(segmentsByStreet.flop)
      : (actionByStreet.flop.hasAction && actionByStreet.flop.hasCheck && !actionByStreet.flop.hasBet);
    const turnAllChecked = hasActorContext
      ? streetAllChecked(segmentsByStreet.turn)
      : (actionByStreet.turn.hasAction && actionByStreet.turn.hasCheck && !actionByStreet.turn.hasBet);
    const flopCallVsAggressor = hasActorContext
      ? findTargetCallVsAggressor(segmentsByStreet.flop, targetIdentity)
      : null;
    const turnCallVsAggressor = hasActorContext
      ? findTargetCallVsAggressor(segmentsByStreet.turn, targetIdentity)
      : null;
    const hasShowdownClassByStreet = {
      flop: hasShowdownClassToken(flopText),
      turn: hasShowdownClassToken(turnText),
      river: hasShowdownClassToken(riverText)
    };
    const hasShowdownClass = hasShowdownClassByStreet.flop || hasShowdownClassByStreet.turn || hasShowdownClassByStreet.river;
    const lightFoldTag = detectLightFoldTag(actionByStreet, hasShowdownClass);
    const explicitConditionalStrongTag = (() => {
      const combined = [flopText, turnText, riverText].filter(Boolean).join(' ');
      if (/\bsr\b/i.test(combined)) return 'Sr';
      if (/\bst\b/i.test(combined)) return 'St';
      if (/\bsf\b/i.test(combined)) return 'Sf';
      return '';
    })();
    const conditionalStrongTag = hasShowdownClass
      ? ''
      : explicitConditionalStrongTag
        || detectConditionalStrongTag(riverRaw || riverText, targetIdentity, 'river')
        || detectConditionalStrongTag(turnRaw || turnText, targetIdentity, 'turn')
        || detectConditionalStrongTag(flopRaw || flopText, targetIdentity, 'flop');
    const strengthFor = (street, streetText) => {
      if (!streetText) return 'unknown';
      if (lightFoldTag) return 'lightFold';
      if (conditionalStrongTag) {
        return 'conditionalStrong';
      }
      return classifyStrength(streetText);
    };

    if (flopText) {
      const bucket = actionByStreet.flop.bucket || detectBucket(flopText);
      if (bucket) {
        const group = detectMultiway(flopRaw || flopText) ? 'MW' : 'HU';
        const strength = strengthFor('flop', flopText);
        addCount(
          sections.flop,
          group,
          bucket,
          strength,
          buildSamplePayload(rowLabel, sampleBase, 'flop')
        );
        analyzedRows += 1;
      }
    }

    if (turnText) {
      const targetFlopHasBet = actionByStreet.flop.hasBet;
      const targetTurnHasBet = actionByStreet.turn.hasBet;
      const targetTurnHasCheck = actionByStreet.turn.hasCheck;
      const turnBucket = actionByStreet.turn.bucket || detectBucket(turnText);
      const turnStrength = strengthFor('turn', turnText);

      if (targetFlopHasBet) {
        if (targetTurnHasBet && turnBucket) {
          addCount(sections.betbet, 'All', turnBucket, turnStrength, buildSamplePayload(rowLabel, sampleBase, 'turn'));
        } else if (actionByStreet.turn.hasAction && targetTurnHasCheck && !targetTurnHasBet) {
          addCount(sections.betbet, 'All', 'Miss', turnStrength, buildSamplePayload(rowLabel, sampleBase, 'turn'));
        }
      }

      const turnDonkOutcome = hasActorContext
        ? detectDonkOutcome(segmentsByStreet.turn, targetIdentity, flopCallVsAggressor?.aggressorIdentity)
        : '';
      if (turnDonkOutcome) {
        addCount(sections.betbet, 'All', turnDonkOutcome, turnStrength, buildSamplePayload(rowLabel, sampleBase, 'turn'));
      }

      const isTurnProbe = detectProbeLine(turnText) || (flopAllChecked && targetTurnHasBet);
      if (isTurnProbe && turnBucket) {
        const group = detectMultiway(turnRaw || turnText) ? 'MW' : 'HU';
        addCount(sections.probes, group, turnBucket, turnStrength, buildSamplePayload(rowLabel, sampleBase, 'turn'));
      }
    }

    if (riverText) {
      const hasFlopBet = actionByStreet.flop.hasBet;
      const hasTurnBet = actionByStreet.turn.hasBet;
      const hasRiverBet = actionByStreet.river.hasBet;
      const hasRiverCheck = actionByStreet.river.hasCheck;
      const hasRiverAction = actionByStreet.river.hasAction;
      const riverBucket = actionByStreet.river.bucket || detectBucket(riverText);
      const riverStrength = strengthFor('river', riverText);

      if (riverBucket) {
        addCount(sections.total, 'All', riverBucket, riverStrength, buildSamplePayload(rowLabel, sampleBase, 'river'));
      }

      // Check-Bet-Bet (flop all checks, target bets turn, then acts on river).
      const isXbbLine = flopAllChecked && hasTurnBet;
      if (isXbbLine) {
        if (hasRiverBet && riverBucket) {
          addCount(sections.riverXbb, 'All', riverBucket, riverStrength, buildSamplePayload(rowLabel, sampleBase, 'river'));
        } else if (hasRiverAction && hasRiverCheck) {
          addCount(sections.riverXbb, 'All', 'Miss', riverStrength, buildSamplePayload(rowLabel, sampleBase, 'river'));
        }
      }

      // River donk after turn aggressor (x-b-c turn, then river lead/check before aggressor).
      const riverDonkOutcome = hasActorContext
        ? detectDonkOutcome(segmentsByStreet.river, targetIdentity, turnCallVsAggressor?.aggressorIdentity)
        : '';
      if (riverDonkOutcome && (isXbbLine || (flopAllChecked && turnCallVsAggressor))) {
        addCount(sections.riverXbb, 'All', riverDonkOutcome, riverStrength, buildSamplePayload(rowLabel, sampleBase, 'river'));
      }

      // Bet-Check-Bet (target bets flop, turn checks through, then acts on river).
      const isBxbLine = hasFlopBet && turnAllChecked;
      if (isBxbLine) {
        if (hasRiverBet && riverBucket) {
          addCount(sections.riverBxb, 'All', riverBucket, riverStrength, buildSamplePayload(rowLabel, sampleBase, 'river'));
        } else if (hasRiverAction && hasRiverCheck) {
          addCount(sections.riverBxb, 'All', 'Miss', riverStrength, buildSamplePayload(rowLabel, sampleBase, 'river'));
        }
      }

      if (riverDonkOutcome && (isBxbLine || (hasFlopBet && actionByStreet.turn.hasCheck && turnCallVsAggressor))) {
        addCount(sections.riverBxb, 'All', riverDonkOutcome, riverStrength, buildSamplePayload(rowLabel, sampleBase, 'river'));
      }

      // River once after x/x flop and x/x turn.
      const isRiverOnceLine = flopAllChecked && turnAllChecked;
      if (isRiverOnceLine) {
        if (hasRiverBet && riverBucket) {
          addCount(sections.riverOnce, 'All', riverBucket, riverStrength, buildSamplePayload(rowLabel, sampleBase, 'river'));
        } else if (hasRiverAction && hasRiverCheck) {
          addCount(sections.riverOnce, 'All', 'Miss', riverStrength, buildSamplePayload(rowLabel, sampleBase, 'river'));
        }
      } else if (!hasActorContext && detectSingleRiverBetLine(riverText) && riverBucket) {
        // Voice-format fallback without structured actors.
        addCount(sections.riverOnce, 'All', riverBucket, riverStrength, buildSamplePayload(rowLabel, sampleBase, 'river'));
      }

      // BetBetBet and misses.
      const isTriple = hasFlopBet && hasTurnBet && hasRiverBet;
      const isTripleMiss = hasFlopBet && hasTurnBet && !hasRiverBet && hasRiverAction && hasRiverCheck;
      if (detectTripleBarrelLine(riverText) || isTriple) {
        if (riverBucket) {
          addCount(sections.betbetbet, 'All', riverBucket, riverStrength, buildSamplePayload(rowLabel, sampleBase, 'river'));
        }
      } else if (isTripleMiss) {
        addCount(sections.betbetbet, 'All', 'Miss', riverStrength, buildSamplePayload(rowLabel, sampleBase, 'river'));
      }

      const hasCallFlopAndTurnVsAggressor = Boolean(flopCallVsAggressor && turnCallVsAggressor);
      if (riverDonkOutcome && hasCallFlopAndTurnVsAggressor) {
        addCount(sections.betbetbet, 'All', riverDonkOutcome, riverStrength, buildSamplePayload(rowLabel, sampleBase, 'river'));
      }

      if (riverBucket || isTripleMiss || isRiverOnceLine || riverDonkOutcome || isXbbLine || isBxbLine) {
        analyzedRows += 1;
      }
    }
  }

  return {
    opponent: options.opponent || '',
    generatedAt: new Date().toISOString(),
    totalRows: items.length,
    analyzedRows,
    bucketOrder: [...DEFAULT_BUCKET_ORDER],
    legend: LEGEND.map((item) => ({ ...item })),
    sections: [
      {
        id: 'flop',
        title: sections.flop.title,
        groups: [
          { id: 'HU', title: 'HU', rows: groupToRows(sections.flop.groups.HU, sections.flop.bucketOrder) },
          { id: 'MW', title: 'MW', rows: groupToRows(sections.flop.groups.MW, sections.flop.bucketOrder) }
        ]
      },
      {
        id: 'betbet',
        title: sections.betbet.title,
        groups: [{ id: 'All', title: 'All', rows: groupToRows(sections.betbet.groups.All, sections.betbet.bucketOrder) }]
      },
      {
        id: 'probes',
        title: sections.probes.title,
        groups: [
          { id: 'HU', title: 'HU', rows: groupToRows(sections.probes.groups.HU, sections.probes.bucketOrder) },
          { id: 'MW', title: 'MW', rows: groupToRows(sections.probes.groups.MW, sections.probes.bucketOrder) }
        ]
      },
      {
        id: 'riverXbb',
        title: sections.riverXbb.title,
        groups: [{ id: 'All', title: 'All', rows: groupToRows(sections.riverXbb.groups.All, sections.riverXbb.bucketOrder) }]
      },
      {
        id: 'riverBxb',
        title: sections.riverBxb.title,
        groups: [{ id: 'All', title: 'All', rows: groupToRows(sections.riverBxb.groups.All, sections.riverBxb.bucketOrder) }]
      },
      {
        id: 'riverOnce',
        title: sections.riverOnce.title,
        groups: [{ id: 'All', title: 'All', rows: groupToRows(sections.riverOnce.groups.All, sections.riverOnce.bucketOrder) }]
      },
      {
        id: 'betbetbet',
        title: sections.betbetbet.title,
        groups: [{ id: 'All', title: 'All', rows: groupToRows(sections.betbetbet.groups.All, sections.betbetbet.bucketOrder) }]
      },
      {
        id: 'tot',
        title: sections.total.title,
        groups: [{ id: 'All', title: 'All', rows: groupToRows(sections.total.groups.All, sections.total.bucketOrder) }]
      }
    ]
  };
}

export const __testables = {
  detectBucket,
  classifyStrength,
  detectProbeLine,
  detectBetBetLine,
  detectMultiwayByActorCount,
  detectTripleBarrelLine,
  detectSingleRiverBetLine,
  filterStreetByTargetActor,
  extractStreetActionSummary
};
