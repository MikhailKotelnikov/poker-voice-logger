const opponentInput = document.getElementById('opponent-name');
const opponentSuggestions = document.getElementById('opponent-suggestions');
const addOpponentBtn = document.getElementById('add-opponent');
const clearOpponentsBtn = document.getElementById('clear-opponents');
const clearHhDbBtn = document.getElementById('clear-hh-db');
const opponentList = document.getElementById('opponent-list');
const activeOpponentEl = document.getElementById('active-opponent');
const recordStatusEl = document.getElementById('record-status');
const recordHint = document.getElementById('record-hint');
const stopRecordBtn = document.getElementById('stop-record');
const handHistoryInput = document.getElementById('hand-history-input');
const handHistoryFilesInput = document.getElementById('hand-history-files');
const submitHandHistoryFilesBtn = document.getElementById('submit-hand-history-files');
const submitHandHistoryBtn = document.getElementById('submit-hand-history');
const previewHandHistoryBtn = document.getElementById('preview-hand-history');
const clearHandHistoryBtn = document.getElementById('clear-hand-history');
const hhOpponentList = document.getElementById('hh-opponent-list');
const handVisualEl = document.getElementById('hand-visual');
const transcriptEl = document.getElementById('transcript');
const parsedEl = document.getElementById('parsed-fields');
const saveReportBtn = document.getElementById('save-report');
const statusEl = document.getElementById('status');
const profileModalEl = document.getElementById('profile-modal');
const profileCloseBtn = document.getElementById('profile-close');
const profileContentEl = document.getElementById('profile-content');
const profileMetaEl = document.getElementById('profile-meta');
const profileTitleEl = document.getElementById('profile-title');
const profileTooltipEl = document.getElementById('profile-tooltip');

const STORAGE_KEY = 'pokerVoiceOpponents';
const PARSED_FIELDS = ['preflop', 'flop', 'turn', 'river', 'presupposition'];
const HH_MANUAL_FIELD_DEFS = [
  { apiField: 'preflop', key: 'preflop', label: 'preflop' },
  { apiField: 'flop', key: 'flop', label: 'flop' },
  { apiField: 'turn', key: 'turn', label: 'turn' },
  { apiField: 'river', key: 'river', label: 'river' },
  { apiField: 'hand_presupposition', key: 'handPresupposition', label: 'hand presupposition' }
];
const HH_MANUAL_PRESUPP_PRESETS = [
  'i agro',
  'i gc',
  'i gc+++'
];
const HH_TIMING_OPTIONS = [
  '0% t',
  '10% t',
  '20% t',
  '30% t',
  '40% t',
  '50% t',
  '60% t',
  '70% t',
  '80% t',
  '90% t',
  '100% t',
  '50% tb',
  '70% tb',
  '90% tb',
  '100% tb'
];
const HH_STREET_KEYS = new Set(['preflop', 'flop', 'turn', 'river']);
const HH_MANUAL_REPORT_SOURCE = 'poker-voice-web-hh-manual';
const HH_REPORT_FIELD_MAP = {
  preflop: 'preflop',
  flop: 'flop',
  turn: 'turn',
  river: 'river',
  hand_presupposition: 'presupposition'
};

let opponents = loadOpponents();
let allOpponentIndex = [];
let activeOpponent = '';
let mediaRecorder = null;
let audioChunks = [];
let currentRecordMode = 'main';
let currentEditField = '';
let lastParsed = {
  preflop: '',
  flop: '',
  turn: '',
  river: '',
  presupposition: ''
};
let lastSavedRow = null;
let lastSavedSheetName = '';
let opponentIndexLoaded = false;
let suggestionsRequestId = 0;
let lastTranscript = '';
let reportDraft = null;
let profileModalOpponent = '';
let profileModalSource = 'voice';
let isBatchProcessing = false;
const profileCache = new Map();
const profileListCache = new Map();
const PROFILE_DEFAULT_SOURCE = 'voice';
const PROFILE_MY_NICK_BY_ROOM_KEY = 'pokerVoiceMyNickByRoomV1';
let profileViewMode = 'chart';
let hhManualRecorder = null;
let hhManualChunks = [];
let hhManualRecordingKey = '';
let hhManualRecordingContext = null;
const hhManualReportDrafts = new Map();

function loadProfileMyNickByRoom() {
  try {
    const raw = localStorage.getItem(PROFILE_MY_NICK_BY_ROOM_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    Object.entries(parsed).forEach(([key, value]) => {
      const roomKey = String(key || '').trim().toLowerCase();
      const nickname = String(value || '').trim();
      if (!roomKey || !nickname) return;
      out[roomKey] = nickname;
    });
    return out;
  } catch {
    return {};
  }
}

function saveProfileMyNickByRoom(map = {}) {
  try {
    localStorage.setItem(PROFILE_MY_NICK_BY_ROOM_KEY, JSON.stringify(map));
  } catch {}
}

let profileMyNickByRoom = loadProfileMyNickByRoom();
let profileTooltipPinned = false;
let profileTooltipSampleInput = null;
let profileVsMeEnabled = false;
let profileMirrorFilters = null;
let profileMirrorFilterOptions = { rooms: [] };
let profileMirrorVsHimEnabled = true;
let profileMirrorRequestId = 0;

function createDefaultProfileFilters() {
  return {
    playerGroups: [],
    datePreset: 'all',
    gameCards: [],
    rooms: [],
    potBuckets: [],
    limits: [],
    vsOpponent: '',
    cardsVisibility: 'showdown',
    recentLimit: 'all',
    manualOnly: false
  };
}

let profileFilters = createDefaultProfileFilters();
let profileFilterOptions = { rooms: [] };
profileMirrorFilters = createDefaultProfileFilters();

function normalizeProfileSource(source) {
  const value = String(source || PROFILE_DEFAULT_SOURCE).trim().toLowerCase();
  if (['hh', 'handhistory', 'hand_history'].includes(value)) return 'hh';
  if (value === 'voice') return 'voice';
  return 'all';
}

function serializeProfileFilters(filters = profileFilters) {
  const normalizeList = (value) => {
    const list = Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
    list.sort();
    return list.join(',');
  };
  return [
    `players=${normalizeList(filters.playerGroups)}`,
    `date=${String(filters.datePreset || 'all')}`,
    `games=${normalizeList(filters.gameCards)}`,
    `rooms=${normalizeList(filters.rooms)}`,
    `pots=${normalizeList(filters.potBuckets)}`,
    `limits=${normalizeList(filters.limits)}`,
    `vs=${String(filters.vsOpponent || '').trim().toLowerCase()}`,
    `cards=${String(filters.cardsVisibility || 'showdown')}`,
    `recent=${String(filters.recentLimit || 'all')}`,
    `manual=${filters.manualOnly ? '1' : '0'}`
  ].join('|');
}

function profileCacheKey(opponent, source = PROFILE_DEFAULT_SOURCE, filters = profileFilters) {
  return `${normalizeProfileSource(source)}::${serializeProfileFilters(filters)}::${String(opponent || '').trim()}`;
}

function profileListCacheKey(opponent, source = PROFILE_DEFAULT_SOURCE, filters = profileFilters) {
  return `${normalizeProfileSource(source)}::${serializeProfileFilters(filters)}::${String(opponent || '').trim()}`;
}

function loadOpponents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveOpponents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(opponents));
}

function setStatus(message, type = 'ok') {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', type === 'error');
}

function emptyParsedFields() {
  return {
    preflop: '',
    flop: '',
    turn: '',
    river: '',
    presupposition: ''
  };
}

function createSessionId() {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneParsedFields(source = {}) {
  const out = emptyParsedFields();
  PARSED_FIELDS.forEach((field) => {
    out[field] = String(source[field] || '');
  });
  return out;
}

function canSaveReport() {
  return Boolean(
    reportDraft
    && reportDraft.opponent
    && (reportDraft.row || lastSavedRow)
    && !isAnyRecordingActive()
    && !isBatchProcessing
  );
}

function resetCurrentSelection() {
  activeOpponent = '';
  lastSavedRow = null;
  lastSavedSheetName = '';
  lastParsed = emptyParsedFields();
  lastTranscript = '';
  reportDraft = null;
  transcriptEl.textContent = '—';
  renderHandVisual(null);
}

function mergeIntoOpponentIndex(items = []) {
  const seen = new Set(allOpponentIndex.map((name) => String(name || '').toLowerCase()));
  items.forEach((name) => {
    const value = String(name || '').trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    allOpponentIndex.push(value);
  });
}

function mergedSuggestions(query = '') {
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    return [];
  }

  const merged = [];
  const seen = new Set();
  const sources = [...allOpponentIndex];

  sources.forEach((name) => {
    if (!name) return;
    const lower = name.toLowerCase();
    if (!lower.includes(q)) return;
    if (seen.has(lower)) return;
    seen.add(lower);
    merged.push(name);
  });

  return merged.slice(0, 20);
}

function profileLegendColor(legend, key) {
  const item = (legend || []).find((entry) => entry.key === key);
  return item?.color || '#cccccc';
}

const PROFILE_ACTION_RE = /^(?:x\/x|x|xb|xc|xf|f|c(?:\d+(?:\.\d+)?)?|r(?:\d+(?:\.\d+)?(?:x)?)?|b(?:\d+(?:\.\d+)?)?|cb(?:\d+(?:\.\d+)?)?|bb(?:\d+(?:\.\d+)?)?|bbb(?:\d+(?:\.\d+)?)?|d(?:\d+(?:\.\d+)?)?|tpb(?:\d+(?:\.\d+)?)?|tp(?:\d+(?:\.\d+)?)?)$/i;

function isPackedCardsToken(token, minCards = 1) {
  const value = String(token || '').trim();
  if (!value || value.length % 2 !== 0) return false;
  const chunks = value.match(/([2-9TJQKA][cdhs])/ig);
  return Boolean(chunks && chunks.length >= minCards && chunks.join('').toLowerCase() === value.toLowerCase());
}

function parsePackedCards(token) {
  const value = String(token || '').trim();
  const matches = value.match(/([2-9TJQKA])([cdhs])/ig) || [];
  return matches.map((chunk) => ({
    rank: chunk[0].toUpperCase(),
    suit: chunk[1].toLowerCase()
  }));
}

const TOOLTIP_RANK_VALUE = {
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

function sortHoleCardsDesc(cards = []) {
  return cards
    .map((card, index) => ({ ...card, __i: index }))
    .sort((a, b) => {
      const av = TOOLTIP_RANK_VALUE[a.rank] || 0;
      const bv = TOOLTIP_RANK_VALUE[b.rank] || 0;
      if (bv !== av) return bv - av;
      return a.__i - b.__i;
    })
    .map(({ __i, ...card }) => card);
}

function isPositionToken(token) {
  const value = String(token || '').trim();
  if (!value) return false;
  if (PROFILE_ACTION_RE.test(value)) return false;
  return /^[A-Za-z][A-Za-z0-9]{0,7}(?:_[A-Za-z0-9]{2,20})?$/.test(value);
}

function normalizeTooltipToken(token) {
  return String(token || '')
    .trim()
    .replace(/^[\[{('"`]+/, '')
    .replace(/[)\]},'"`:;.!?]+$/, '');
}

function parseTooltipSegment(text) {
  const rawTokens = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const tokens = rawTokens
    .map((token) => normalizeTooltipToken(token))
    .filter(Boolean);
  const parsed = {
    pos: '',
    hero: false,
    pot: '',
    allIn: false,
    action: '',
    cards: [],
    handTags: [],
    board: [],
    extras: [],
    raw: String(text || '').trim()
  };
  if (!tokens.length) return parsed;

  let index = 0;
  const firstRaw = rawTokens[0] || '';
  const potMatch = firstRaw.match(/^\((\d+(?:\.\d+)?)\)$/);
  if (potMatch?.[1]) {
    parsed.pot = potMatch[1];
    index += 1;
  }

  if (isPositionToken(tokens[index])) {
    parsed.hero = false;
    parsed.pos = tokens[index].toUpperCase();
    index += 1;
  }
  if (index < tokens.length && PROFILE_ACTION_RE.test(tokens[index])) {
    parsed.action = tokens[index];
    index += 1;
  }

  for (; index < tokens.length; index += 1) {
    const token = tokens[index];
    const lower = token.toLowerCase();
    if (lower === 'on') {
      const nextToken = tokens[index + 1] || '';
      if (isPackedCardsToken(nextToken, 3)) {
        parsed.board = parsePackedCards(nextToken);
        index += 1;
        continue;
      }
      const boardCards = [];
      let cursor = index + 1;
      while (cursor < tokens.length && /^[2-9TJQKA][cdhs]$/i.test(tokens[cursor])) {
        boardCards.push(tokens[cursor]);
        cursor += 1;
      }
      if (boardCards.length >= 3) {
        parsed.board = parsePackedCards(boardCards.join(''));
        index = cursor - 1;
        continue;
      }
      parsed.extras.push(token);
      continue;
    }
    if (lower.startsWith('on') && isPackedCardsToken(token.slice(2), 3)) {
      parsed.board = parsePackedCards(token.slice(2));
      continue;
    }
    const cardsWithTags = token.match(/^([2-9TJQKA][cdhs](?:[2-9TJQKA][cdhs]){1,})_([a-z0-9_+.-]+)$/i);
    if (cardsWithTags?.[1] && cardsWithTags?.[2] && isPackedCardsToken(cardsWithTags[1], 2)) {
      parsed.cards = sortHoleCardsDesc(parsePackedCards(cardsWithTags[1]));
      parsed.handTags = cardsWithTags[2]
        .split('_')
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }
    if (!parsed.cards.length && isPackedCardsToken(token, 2)) {
      parsed.cards = sortHoleCardsDesc(parsePackedCards(token));
      continue;
    }
    if (lower === 'allin' || lower === 'all-in') {
      parsed.allIn = true;
      continue;
    }
    parsed.extras.push(token);
  }
  return parsed;
}

function parseTooltipSampleLegacy(sampleText) {
  const text = String(sampleText || '').trim();
  const match = text.match(/^(#[^\s]+)\s+([a-z]+)\s*:\s*(.+)$/i);
  const order = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];
  if (!match) {
    return {
      rowId: '',
      focusStreet: '',
      meta: null,
      streets: order.map((name) => ({
        name,
        raw: name === 'FLOP' ? text : '',
        segments: name === 'FLOP' && text ? [parseTooltipSegment(text)] : []
      }))
    };
  }
  const details = String(match[3] || '').trim();
  const focus = String(match[2] || '').toUpperCase();
  return {
    rowId: match[1],
    focusStreet: focus,
    meta: null,
    streets: order.map((name) => {
      const raw = name === focus ? details : '';
      return {
        name,
        raw,
        segments: raw
          .split(/\s*\/\s*/)
          .map((part) => parseTooltipSegment(part))
          .filter((part) => part.raw)
      };
    })
  };
}

function buildTooltipAction(action, isHero) {
  const token = String(action || '').trim();
  if (!token) return null;
  const span = document.createElement('span');
  span.className = `pt-action ${actionKind(token)} ${isHero ? 'hero' : ''}`.trim();
  span.textContent = token;
  return span;
}

function buildTooltipCards(cards = [], options = {}) {
  const board = options.board === true;
  const wrap = document.createElement('span');
  wrap.className = `pt-cards ${board ? 'pt-board-cards' : ''}`.trim();
  cards.forEach((card) => wrap.appendChild(cardElement(card, { mini: true, board })));
  return wrap;
}

function parseTooltipSample(sampleText) {
  const text = String(sampleText || '').trim();
  if (!text) return parseTooltipSampleLegacy(text);

  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.type === 'profile_sample_v2') {
      const order = ['preflop', 'flop', 'turn', 'river'];
      const streets = order.map((street) => {
        const raw = String(parsed?.streets?.[street] || '').trim();
        return {
          name: street.toUpperCase(),
          raw,
          segments: raw ? raw
            .split(/\s*\/\s*/)
            .map((part) => parseTooltipSegment(part))
            .filter((part) => part.raw)
            : []
        };
      });
      return {
        rowId: String(parsed.rowLabel || '').trim(),
        focusStreet: String(parsed.focusStreet || '').toUpperCase(),
        meta: parsed?.meta && typeof parsed.meta === 'object' ? parsed.meta : null,
        manual: normalizeHhManualValues(parsed?.manual),
        context: parsed?.context && typeof parsed.context === 'object'
          ? {
            row: Number.isFinite(Number(parsed.context.row)) && Number(parsed.context.row) > 0
              ? Math.trunc(Number(parsed.context.row))
              : null,
            handNumber: String(parsed.context.handNumber || ''),
            room: String(parsed.context.room || ''),
            opponent: String(parsed.context.opponent || ''),
            source: String(parsed.context.source || ''),
            targetIdentity: String(parsed.context.targetIdentity || '')
          }
          : null,
        timings: normalizeHhTimingEntries(parsed?.timings),
        streets
      };
    }
  } catch (error) {
    // fallback to legacy format
  }

  return parseTooltipSampleLegacy(text);
}

function normalizeTooltipSamples(sampleInput) {
  if (Array.isArray(sampleInput)) {
    return sampleInput.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof sampleInput === 'string') {
    return [sampleInput];
  }
  return [];
}

function tooltipMetaTokens(metaRaw) {
  const meta = metaRaw && typeof metaRaw === 'object' ? metaRaw : null;
  if (!meta) return [];
  const out = [];
  const handNumber = String(meta.handNumber || '').trim();
  const playedAt = String(meta.playedAtUtc || '').trim();
  const game = String(meta.game || '').trim();
  const players = Number(meta.activePlayers);
  const room = String(meta.room || '').trim();
  const limit = String(meta.limit || '').trim();
  const finalPotBb = Number(meta.finalPotBb);
  const potBucket = String(meta.potBucket || '').trim();

  if (handNumber) out.push(`#${handNumber}`);
  if (playedAt) out.push(playedAt);
  if (game) out.push(game);
  if (Number.isFinite(players) && players > 0) out.push(`${players}p`);
  if (limit) out.push(limit);
  if (room) out.push(room);
  if (Number.isFinite(finalPotBb) && finalPotBb > 0) out.push(`${Math.round(finalPotBb * 100) / 100}bb`);
  if (potBucket) out.push(potBucket);
  return out;
}

function extractTargetId(value) {
  const match = String(value || '').match(/\d{4,}/g);
  if (!match || !match.length) return '';
  return match[match.length - 1];
}

function extractActorTokenIdentityHint(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  const match = source.match(/^(?:SB|BB|BTN|CO|HJ|UTG|UTG1|LJ|MP|P\d+)_([A-Za-z0-9]{2,24})$/i);
  if (!match?.[1]) return '';
  return String(match[1] || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function extractTargetIdentity(value) {
  const id = extractTargetId(value);
  if (id) return id;
  const actorHint = extractActorTokenIdentityHint(value);
  if (actorHint) return actorHint;
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function emptyHhManualValues() {
  return {
    preflop: '',
    flop: '',
    turn: '',
    river: '',
    handPresupposition: ''
  };
}

function normalizeHhManualValues(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    preflop: String(source.preflop || ''),
    flop: String(source.flop || ''),
    turn: String(source.turn || ''),
    river: String(source.river || ''),
    handPresupposition: String(source.handPresupposition || source.hand_presupposition || '')
  };
}

function normalizeHhTimingEntries(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => ({
      street: String(item?.street || '').trim().toLowerCase(),
      actionIndex: Number(item?.actionIndex),
      actionKey: String(item?.actionKey || ''),
      timing: String(item?.timing || '').trim().toLowerCase()
    }))
    .filter((item) => ['preflop', 'flop', 'turn', 'river'].includes(item.street)
      && Number.isFinite(item.actionIndex)
      && item.actionIndex >= 0);
}

function normalizeTimingValue(value) {
  return String(value || '').trim().toLowerCase();
}

function applyTimingSelectWidth(selectEl) {
  if (!selectEl) return;
  const normalizedValue = normalizeTimingValue(selectEl.value);
  const selectedOption = selectEl.options[selectEl.selectedIndex];
  const selectedLabel = String(selectedOption?.textContent || selectEl.value || '').trim();
  const contentLength = selectedLabel.length || 1;
  const widthCh = normalizedValue
    ? Math.max(4.8, Math.min(13.5, contentLength + 2.4))
    : 2.2;
  selectEl.style.width = `${widthCh}ch`;
  selectEl.classList.toggle('pt-timing-select-empty', !normalizedValue);
}

function canEditHhSample(parsed) {
  const context = parsed?.context && typeof parsed.context === 'object' ? parsed.context : null;
  if (!context) return false;
  if (String(context.source || '').trim().toLowerCase() !== 'hh') return false;
  return Boolean(String(context.handNumber || '').trim());
}

function timingLookupKey(street, actionIndex) {
  return `${String(street || '').trim().toLowerCase()}::${Number(actionIndex)}`;
}

function getParsedTimingValue(parsed, street, actionIndex, actionKey = '') {
  const timings = normalizeHhTimingEntries(parsed?.timings);
  const normalizedActionKey = String(actionKey || '').trim();
  if (normalizedActionKey) {
    for (const item of timings) {
      if (String(item.street || '').trim().toLowerCase() !== String(street || '').trim().toLowerCase()) continue;
      if (Number(item.actionIndex) !== Number(actionIndex)) continue;
      if (String(item.actionKey || '').trim() === normalizedActionKey) {
        return String(item.timing || '');
      }
    }
  }
  const key = timingLookupKey(street, actionIndex);
  for (const item of timings) {
    if (timingLookupKey(item.street, item.actionIndex) === key) {
      return String(item.timing || '');
    }
  }
  return '';
}

function setParsedManualFieldsFromApi(parsed, fields = {}) {
  if (!parsed || typeof parsed !== 'object') return;
  parsed.manual = normalizeHhManualValues({
    preflop: fields.preflop,
    flop: fields.flop,
    turn: fields.turn,
    river: fields.river,
    handPresupposition: fields.hand_presupposition
  });
}

function manualFieldValueFromApi(apiField, fields = {}) {
  const def = hhManualFieldDef(apiField);
  if (!def) return null;
  const source = fields && typeof fields === 'object' ? fields : {};
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(source, key);

  if (hasOwn(apiField)) return String(source[apiField] || '');
  if (apiField === 'hand_presupposition') {
    if (hasOwn('handPresupposition')) return String(source.handPresupposition || '');
    if (hasOwn('hand_presupposition')) return String(source.hand_presupposition || '');
  } else if (hasOwn(def.key)) {
    return String(source[def.key] || '');
  }
  return null;
}

function applyParsedManualFieldFromApi(parsed, apiField, fields = {}) {
  if (!parsed || typeof parsed !== 'object') return;
  const def = hhManualFieldDef(apiField);
  if (!def) {
    setParsedManualFieldsFromApi(parsed, fields);
    return;
  }
  const nextValue = manualFieldValueFromApi(apiField, fields);
  if (nextValue === null) return;
  parsed.manual = normalizeHhManualValues(parsed?.manual);
  parsed.manual[def.key] = String(nextValue || '');
}

function setParsedTimingFieldsFromApi(parsed, timings = []) {
  if (!parsed || typeof parsed !== 'object') return;
  parsed.timings = normalizeHhTimingEntries(timings);
}

function resolveProfileModalOpponent(parsed) {
  const contextOpponent = String(parsed?.context?.opponent || '').trim();
  if (contextOpponent) return contextOpponent;
  return String(profileModalOpponent || '').trim();
}

function normalizeManualReportField(field) {
  const key = String(field || '').trim().toLowerCase();
  return String(HH_REPORT_FIELD_MAP[key] || '');
}

function buildHhManualReportKey(parsed) {
  const context = parsed?.context && typeof parsed.context === 'object' ? parsed.context : {};
  const hand = String(context.handNumber || '').trim();
  const room = String(context.room || '').trim().toLowerCase();
  const row = Number(context.row);
  if (hand) return `${hand}|${room}`;
  if (Number.isFinite(row) && row > 0) return `row:${Math.trunc(row)}`;
  return '';
}

function parsedSampleMatchContext(parsedContext = {}, sampleContext = {}) {
  const parsedHandNumber = String(parsedContext.handNumber || '').trim();
  const sampleHandNumber = String(sampleContext.handNumber || '').trim();
  const parsedRoom = String(parsedContext.room || '').trim().toLowerCase();
  const sampleRoom = String(sampleContext.room || '').trim().toLowerCase();
  if (parsedHandNumber && sampleHandNumber && parsedRoom && sampleRoom) {
    if (parsedHandNumber === sampleHandNumber && parsedRoom === sampleRoom) {
      const parsedTarget = String(parsedContext.targetIdentity || '').trim().toLowerCase();
      const sampleTarget = String(sampleContext.targetIdentity || '').trim().toLowerCase();
      return !parsedTarget || !sampleTarget || parsedTarget === sampleTarget;
    }
  }
  const parsedRow = Number(parsedContext.row);
  const sampleRow = Number(sampleContext.row);
  return Number.isFinite(parsedRow) && parsedRow > 0 && parsedRow === sampleRow;
}

function patchSamplePayloadWithParsed(sampleText, parsedContext, manual, timings) {
  const text = String(sampleText || '').trim();
  if (!text) return sampleText;
  try {
    const payload = JSON.parse(text);
    if (!payload || payload.type !== 'profile_sample_v2') return sampleText;
    const sampleContext = payload.context && typeof payload.context === 'object' ? payload.context : {};
    if (!parsedSampleMatchContext(parsedContext, sampleContext)) return sampleText;
    payload.manual = normalizeHhManualValues(manual);
    if (timings.length) {
      payload.timings = timings;
    } else {
      delete payload.timings;
    }
    return JSON.stringify(payload);
  } catch {
    return sampleText;
  }
}

function patchCachedProfileSamples(parsedContext, manual, timings) {
  const patchArray = (arr) => {
    if (!Array.isArray(arr)) return;
    for (let index = 0; index < arr.length; index += 1) {
      arr[index] = patchSamplePayloadWithParsed(arr[index], parsedContext, manual, timings);
    }
  };

  for (const entry of profileCache.values()) {
    const profile = entry?.status === 'ready' ? entry.profile : null;
    if (!profile || !Array.isArray(profile.sections)) continue;
    for (const section of profile.sections) {
      const groups = Array.isArray(section?.groups) ? section.groups : [];
      for (const group of groups) {
        const rows = Array.isArray(group?.rows) ? group.rows : [];
        for (const row of rows) {
          patchArray(row?.samples?.all);
          Object.values(row?.samples || {}).forEach((items) => patchArray(items));
          Object.values(row?.samplesNormal || {}).forEach((items) => patchArray(items));
          Object.values(row?.samplesAllIn || {}).forEach((items) => patchArray(items));
        }
      }
    }
  }
}

function patchCachedProfileLists(parsedContext, manual, timings) {
  const normalizedTimings = timings.map((item) => ({
    street: String(item.street || '').trim().toLowerCase(),
    actionIndex: Number(item.actionIndex || 0),
    actionKey: String(item.actionKey || ''),
    timing: String(item.timing || '').trim().toLowerCase()
  }));
  for (const entry of profileListCache.values()) {
    const payload = entry?.status === 'ready' ? entry.payload : null;
    const rows = Array.isArray(payload?.list) ? payload.list : [];
    for (const row of rows) {
      const rowContext = {
        row: Number(row?.row),
        handNumber: String(row?.handNumber || ''),
        room: String(row?.room || '').trim().toLowerCase(),
        targetIdentity: extractTargetIdentity(payload?.opponent || '')
      };
      if (!parsedSampleMatchContext(parsedContext, rowContext)) continue;
      row.manualPreflop = String(manual.preflop || '');
      row.manualFlop = String(manual.flop || '');
      row.manualTurn = String(manual.turn || '');
      row.manualRiver = String(manual.river || '');
      row.handPresupposition = String(manual.handPresupposition || '');
      row.manualTimings = normalizedTimings.map((item) => ({ ...item }));
    }
  }
}

function syncProfileTooltipSampleInput(parsed) {
  if (!parsed) return;
  const parsedContext = parsed.context && typeof parsed.context === 'object' ? parsed.context : null;
  if (!parsedContext) return;
  const manual = normalizeHhManualValues(parsed.manual);
  const timings = normalizeHhTimingEntries(parsed.timings);

  patchCachedProfileSamples(parsedContext, manual, timings);
  patchCachedProfileLists(parsedContext, manual, timings);

  if (Array.isArray(profileTooltipSampleInput)) {
    // Keep the same array reference: rendered chart/list segment handlers
    // may still hold this exact samples array between tooltip reopen events.
    for (let index = 0; index < profileTooltipSampleInput.length; index += 1) {
      profileTooltipSampleInput[index] = patchSamplePayloadWithParsed(
        profileTooltipSampleInput[index],
        parsedContext,
        manual,
        timings
      );
    }
    return;
  }
  if (typeof profileTooltipSampleInput === 'string') {
    profileTooltipSampleInput = patchSamplePayloadWithParsed(profileTooltipSampleInput, parsedContext, manual, timings);
  }
}

function isMainRecordingActive() {
  return Boolean(mediaRecorder && mediaRecorder.state === 'recording');
}

function isHhManualRecordingActive() {
  return Boolean(hhManualRecorder && hhManualRecorder.state === 'recording');
}

function isAnyRecordingActive() {
  return isMainRecordingActive() || isHhManualRecordingActive();
}

function canMutateHhManual() {
  return !isAnyRecordingActive() && !isBatchProcessing;
}

function markHeroSegments(streets = [], targetIdentity = '') {
  if (!targetIdentity) return streets;
  const suffix = `_${targetIdentity}`;
  streets.forEach((street) => {
    (street?.segments || []).forEach((segment) => {
      const pos = String(segment?.pos || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');
      segment.hero = pos.endsWith(suffix);
    });
  });
  return streets;
}

function renderTooltipSegmentLine(segments = [], options = {}) {
  const showPot = options.showPot !== false;
  const showAction = options.showAction !== false;
  const showCards = options.showCards !== false;
  const showTags = options.showTags !== false;
  const showBoard = options.showBoard !== false;
  const showExtras = options.showExtras !== false;
  const showAllIn = options.showAllIn !== false;
  const enableTiming = options.enableTiming === true;
  const timingStreet = String(options.timingStreet || '').trim().toLowerCase();
  const onTimingChange = typeof options.onTimingChange === 'function' ? options.onTimingChange : null;
  const getTimingValue = typeof options.getTimingValue === 'function' ? options.getTimingValue : null;
  const hideEmptyTimingControls = options.hideEmptyTimingControls === true;

  const line = document.createElement('div');
  line.className = 'pt-line';

  segments.forEach((segment, index) => {
    if (index > 0) {
      const sep = document.createElement('span');
      sep.className = 'pt-sep';
      sep.textContent = '/';
      line.appendChild(sep);
    }

    const item = document.createElement('span');
    item.className = 'pt-segment';
    if (showAllIn && segment.allIn) {
      item.classList.add('pt-segment-allin');
    }

    if (showPot && segment.pot) {
      const pot = document.createElement('span');
      pot.className = 'pt-pot';
      pot.textContent = `(${segment.pot})`;
      item.appendChild(pot);
    }

    if (segment.pos) {
      const pos = document.createElement('span');
      pos.className = `pt-pos ${segment.hero ? 'hero' : ''}`.trim();
      pos.textContent = segment.pos;
      item.appendChild(pos);
    }

    if (showAction) {
      const action = buildTooltipAction(segment.action, segment.hero);
      if (action) {
        item.appendChild(action);
      }
    }

    if (showCards && segment.cards.length) {
      item.appendChild(buildTooltipCards(segment.cards));
    }

    if (showTags && segment.handTags.length) {
      const tags = document.createElement('span');
      tags.className = 'pt-hand-tags';
      segment.handTags.forEach((tag) => {
        const badge = document.createElement('span');
        badge.className = 'pt-hand-tag';
        badge.textContent = tag;
        tags.appendChild(badge);
      });
      item.appendChild(tags);
    }

    if (showBoard && segment.board.length) {
      const on = document.createElement('span');
      on.className = 'pt-on';
      on.textContent = 'on';
      item.appendChild(on);
      item.appendChild(buildTooltipCards(segment.board, { board: true }));
    }

    if (showExtras && segment.extras.length) {
      const extra = document.createElement('span');
      extra.className = 'pt-extra';
      extra.textContent = segment.extras.join(' ');
      item.appendChild(extra);
    }

    const hasTimingContext = Boolean(timingStreet && showAction && segment.action);
    const currentTiming = hasTimingContext && getTimingValue
      ? normalizeTimingValue(getTimingValue(timingStreet, index, segment))
      : '';
    if (hasTimingContext) {
      if (enableTiming) {
        if (!(hideEmptyTimingControls && !currentTiming)) {
          const timingSelect = document.createElement('select');
          timingSelect.className = 'pt-timing-select';
          const emptyOption = document.createElement('option');
          emptyOption.value = '';
          emptyOption.textContent = 't';
          timingSelect.appendChild(emptyOption);
          HH_TIMING_OPTIONS.forEach((value) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            timingSelect.appendChild(option);
          });
          timingSelect.value = currentTiming;
          applyTimingSelectWidth(timingSelect);
          const previousTiming = { value: currentTiming };
          timingSelect.addEventListener('focus', () => {
            previousTiming.value = timingSelect.value;
          });
          timingSelect.addEventListener('change', async () => {
            if (!onTimingChange) return;
            const selected = normalizeTimingValue(timingSelect.value);
            timingSelect.disabled = true;
            const ok = await onTimingChange({
              street: timingStreet,
              actionIndex: index,
              actionKey: String(segment.raw || '').trim(),
              timing: selected
            });
            timingSelect.disabled = false;
            if (!ok) {
              timingSelect.value = previousTiming.value;
            } else {
              previousTiming.value = selected;
            }
            applyTimingSelectWidth(timingSelect);
          });
          item.appendChild(timingSelect);
        }
      } else if (currentTiming) {
        const timingBadge = document.createElement('span');
        timingBadge.className = 'pt-timing-badge';
        timingBadge.textContent = currentTiming;
        item.appendChild(timingBadge);
      }
    }

    if (!segment.pos && !segment.action && !segment.cards.length && !segment.board.length && !segment.extras.length) {
      const raw = document.createElement('span');
      raw.className = 'pt-extra';
      raw.textContent = segment.raw;
      item.appendChild(raw);
    }

    line.appendChild(item);
  });

  return line;
}

function collectTooltipHandsSegments(streets = []) {
  const byActor = new Map();
  const order = [];

  streets.forEach((street) => {
    (street?.segments || []).forEach((segment) => {
      const pos = String(segment?.pos || '').trim();
      if (!pos || !Array.isArray(segment?.cards) || !segment.cards.length) return;
      const key = pos.toLowerCase();
      if (!byActor.has(key)) {
        byActor.set(key, {
          pos,
          hero: Boolean(segment.hero),
          cards: segment.cards.map((card) => ({ ...card }))
        });
        order.push(key);
        return;
      }
      const existing = byActor.get(key);
      existing.hero = existing.hero || Boolean(segment.hero);
      if (!existing.cards.length) {
        existing.cards = segment.cards.map((card) => ({ ...card }));
      }
    });
  });

  const heroKeys = order.filter((key) => byActor.get(key)?.hero);
  const otherKeys = order.filter((key) => !byActor.get(key)?.hero);
  const finalOrder = [...heroKeys, ...otherKeys];

  return finalOrder.map((key) => {
    const item = byActor.get(key);
    return {
      pos: item?.pos || '',
      hero: Boolean(item?.hero),
      cards: Array.isArray(item?.cards) ? item.cards : [],
      handTags: [],
      board: [],
      extras: [],
      action: '',
      pot: '',
      allIn: false,
      raw: ''
    };
  });
}

function handleProfileTooltipWheel(event) {
  if (!profileTooltipEl || profileTooltipEl.classList.contains('hidden')) return;
  if (!profileModalEl || !profileModalEl.contains(event.target)) return;
  if (profileTooltipEl.scrollHeight <= profileTooltipEl.clientHeight + 1) return;
  profileTooltipEl.scrollTop += event.deltaY;
  event.preventDefault();
}

function refreshPinnedProfileTooltip() {
  if (!profileTooltipPinned || !profileTooltipEl || profileTooltipEl.classList.contains('hidden')) return;
  if (!profileTooltipSampleInput) return;
  profileTooltipEl.innerHTML = '';
  profileTooltipEl.appendChild(buildProfileTooltipContent(profileTooltipSampleInput, { interactive: true }));
}

function pinProfileTooltip() {
  if (!profileTooltipEl || profileTooltipEl.classList.contains('hidden')) return;
  if (profileTooltipPinned) return;
  profileTooltipPinned = true;
  profileTooltipEl.classList.add('pinned');
  refreshPinnedProfileTooltip();
}

function unpinProfileTooltip() {
  profileTooltipPinned = false;
  if (!profileTooltipEl) return;
  profileTooltipEl.classList.remove('pinned');
}

function hhManualFieldDef(apiField) {
  return HH_MANUAL_FIELD_DEFS.find((item) => item.apiField === String(apiField || '').trim().toLowerCase()) || null;
}

function hhManualFieldValue(parsed, apiField) {
  const def = hhManualFieldDef(apiField);
  if (!def) return '';
  return String(parsed?.manual?.[def.key] || '');
}

function setHhManualFieldValue(parsed, apiField, value) {
  const def = hhManualFieldDef(apiField);
  if (!def) return;
  parsed.manual = normalizeHhManualValues(parsed?.manual);
  parsed.manual[def.key] = String(value || '');
}

function getHhManualInputLabel(apiField) {
  const def = hhManualFieldDef(apiField);
  return def?.label || String(apiField || '');
}

async function saveHhManualTextField(parsed, apiField, value) {
  if (!canEditHhSample(parsed)) {
    setStatus('Эта раздача не из HH DB — редактирование недоступно.', 'error');
    return false;
  }
  if (!canMutateHhManual()) {
    setStatus('Сначала завершите текущую запись.', 'error');
    return false;
  }

  const opponent = resolveProfileModalOpponent(parsed);
  if (!opponent) {
    setStatus('Не удалось определить выбранного игрока.', 'error');
    return false;
  }
  const context = parsed.context || {};
  const field = String(apiField || '').trim().toLowerCase();
  const label = getHhManualInputLabel(field);

  try {
    setStatus(`Сохраняю ${label}...`);
    const response = await fetch('/api/hh-manual-presupp-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opponent,
        row: context.row,
        handNumber: context.handNumber,
        room: context.room,
        targetIdentity: context.targetIdentity,
        field,
        value
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка сохранения HH presupposition.');
    }
    applyParsedManualFieldFromApi(parsed, field, data.fields || {});
    syncProfileTooltipSampleInput(parsed);
    clearProfileCacheByOpponent(opponent);
    refreshPinnedProfileTooltip();
    setStatus(`${label} сохранено.`, 'ok');
    return true;
  } catch (error) {
    setStatus(error.message || 'Ошибка сохранения HH presupposition.', 'error');
    return false;
  }
}

async function saveHhManualTiming(parsed, { street, actionIndex, actionKey, timing }) {
  if (!canEditHhSample(parsed)) {
    setStatus('Эта раздача не из HH DB — тайминги недоступны.', 'error');
    return false;
  }
  if (!canMutateHhManual()) {
    setStatus('Сначала завершите текущую запись.', 'error');
    return false;
  }
  const opponent = resolveProfileModalOpponent(parsed);
  if (!opponent) {
    setStatus('Не удалось определить выбранного игрока.', 'error');
    return false;
  }
  const context = parsed.context || {};
  const normalizedStreet = String(street || '').trim().toLowerCase();
  if (!HH_STREET_KEYS.has(normalizedStreet)) {
    setStatus('Некорректная улица для тайминга.', 'error');
    return false;
  }

  try {
    const response = await fetch('/api/hh-manual-timing-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opponent,
        row: context.row,
        handNumber: context.handNumber,
        room: context.room,
        targetIdentity: context.targetIdentity,
        street: normalizedStreet,
        actionIndex,
        actionKey,
        timing: normalizeTimingValue(timing)
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка сохранения HH timing.');
    }
    setParsedTimingFieldsFromApi(parsed, data.timings || []);
    syncProfileTooltipSampleInput(parsed);
    clearProfileCacheByOpponent(opponent);
    refreshPinnedProfileTooltip();
    if (normalizeTimingValue(timing)) {
      setStatus('Тайминг сохранен.', 'ok');
    } else {
      setStatus('Тайминг очищен.', 'ok');
    }
    return true;
  } catch (error) {
    setStatus(error.message || 'Ошибка сохранения HH timing.', 'error');
    return false;
  }
}

function resetHhManualRecordingState() {
  hhManualRecorder = null;
  hhManualChunks = [];
  hhManualRecordingKey = '';
  hhManualRecordingContext = null;
}

async function submitHhManualAudioRecording() {
  const context = hhManualRecordingContext;
  if (!context) {
    resetHhManualRecordingState();
    return;
  }
  if (!hhManualChunks.length) {
    setStatus('Нет аудио для сохранения поля.', 'error');
    resetHhManualRecordingState();
    return;
  }

  const {
    parsed,
    apiField,
    opponent,
    reportScopeKey,
    previousValue,
    onStateChange
  } = context;
  const resolvedOpponent = String(opponent || resolveProfileModalOpponent(parsed) || '').trim();
  const payloadContext = parsed?.context && typeof parsed.context === 'object' ? parsed.context : {};
  const field = String(apiField || '').trim().toLowerCase();
  const reportField = normalizeManualReportField(field);
  const fieldLabel = getHhManualInputLabel(field);
  const blob = new Blob(hhManualChunks, { type: 'audio/webm' });
  const formData = new FormData();
  formData.append('audio', blob, 'hh-manual.webm');
  formData.append('opponent', resolvedOpponent);
  formData.append('field', field);
  formData.append('row', String(payloadContext.row || ''));
  formData.append('handNumber', String(payloadContext.handNumber || ''));
  formData.append('room', String(payloadContext.room || ''));
  formData.append('targetIdentity', String(payloadContext.targetIdentity || ''));

  try {
    setStatus(`Транскрибирую ${fieldLabel}...`);
    const response = await fetch('/api/hh-manual-presupp-audio', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка голосового HH presupposition.');
    }

    applyParsedManualFieldFromApi(parsed, field, data.fields || {});
    syncProfileTooltipSampleInput(parsed);
    clearProfileCacheByOpponent(resolvedOpponent);
    refreshPinnedProfileTooltip();

    if (reportScopeKey && reportField) {
      hhManualReportDrafts.set(reportScopeKey, {
        source: HH_MANUAL_REPORT_SOURCE,
        sessionId: createSessionId(),
        createdAt: new Date().toISOString(),
        opponent: resolvedOpponent,
        row: Number.isFinite(Number(payloadContext.row)) ? Number(payloadContext.row) : null,
        handNumber: String(payloadContext.handNumber || ''),
        room: String(payloadContext.room || ''),
        field: reportField,
        transcript: String(data.transcript || ''),
        previousValue: String(previousValue || ''),
        newValue: String(data.value || ''),
        parser: data.parser || null
      });
    }

    setStatus(`${fieldLabel} обновлено голосом.`, 'ok');
  } catch (error) {
    setStatus(error.message || 'Ошибка голосового HH presupposition.', 'error');
  } finally {
    resetHhManualRecordingState();
    if (typeof onStateChange === 'function') onStateChange();
  }
}

async function startHhManualAudioRecording(parsed, apiField, onStateChange) {
  if (!canEditHhSample(parsed)) {
    setStatus('Эта раздача не из HH DB — редактирование недоступно.', 'error');
    return;
  }
  if (isMainRecordingActive() || isBatchProcessing) {
    setStatus('Сначала завершите текущую запись.', 'error');
    return;
  }

  const reportScopeKey = buildHhManualReportKey(parsed);
  if (!reportScopeKey) {
    setStatus('Не удалось определить ключ раздачи для записи.', 'error');
    return;
  }
  const recordKey = `manual:${reportScopeKey}|${String(apiField || '').trim().toLowerCase()}`;
  if (isHhManualRecordingActive()) {
    if (hhManualRecordingKey === recordKey) {
      hhManualRecorder.stop();
      return;
    }
    setStatus('Уже идет запись другого поля. Остановите ее сначала.', 'error');
    return;
  }

  const opponent = resolveProfileModalOpponent(parsed);
  if (!opponent) {
    setStatus('Не удалось определить выбранного игрока.', 'error');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    hhManualChunks = [];
    hhManualRecorder = new MediaRecorder(stream, { mimeType });
    hhManualRecordingKey = recordKey;
    hhManualRecordingContext = {
      parsed,
      apiField,
      opponent,
      reportScopeKey,
      previousValue: hhManualFieldValue(parsed, apiField),
      onStateChange
    };

    hhManualRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        hhManualChunks.push(event.data);
      }
    };
    hhManualRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      await submitHhManualAudioRecording();
    };
    hhManualRecorder.onerror = () => {
      stream.getTracks().forEach((track) => track.stop());
      setStatus('Ошибка записи аудио для HH поля.', 'error');
      resetHhManualRecordingState();
      if (typeof onStateChange === 'function') onStateChange();
    };

    hhManualRecorder.start();
    setStatus(`Запись поля ${getHhManualInputLabel(apiField)} запущена. Нажмите "стоп".`, 'ok');
    if (typeof onStateChange === 'function') onStateChange();
  } catch (error) {
    setStatus('Не удалось получить доступ к микрофону.', 'error');
    resetHhManualRecordingState();
    if (typeof onStateChange === 'function') onStateChange();
  }
}

async function saveHhManualReport(parsed) {
  const reportKey = buildHhManualReportKey(parsed);
  if (!reportKey || !hhManualReportDrafts.has(reportKey)) {
    setStatus('Нет голосового черновика для репорта по этой раздаче.', 'error');
    return false;
  }

  const draft = hhManualReportDrafts.get(reportKey);
  const reportField = normalizeManualReportField(draft?.field || '');
  if (!reportField) {
    setStatus('Поле не поддерживает репорт.', 'error');
    return false;
  }

  const initialParsed = emptyParsedFields();
  const finalParsed = emptyParsedFields();
  initialParsed[reportField] = String(draft.previousValue || '');
  finalParsed[reportField] = String(draft.newValue || '');

  const payload = {
    source: draft.source || HH_MANUAL_REPORT_SOURCE,
    sessionId: draft.sessionId || createSessionId(),
    createdAt: draft.createdAt || new Date().toISOString(),
    savedAt: new Date().toISOString(),
    opponent: String(draft.opponent || resolveProfileModalOpponent(parsed) || profileModalOpponent || '').trim(),
    row: draft.row,
    initialTranscript: String(draft.transcript || ''),
    finalTranscript: String(draft.transcript || ''),
    initialParsed,
    finalParsed,
    parser: draft.parser || null,
    edits: [
      {
        type: 'redictate',
        field: reportField,
        at: new Date().toISOString(),
        transcript: String(draft.transcript || ''),
        previousValue: String(draft.previousValue || ''),
        newValue: String(draft.newValue || ''),
        parser: draft.parser || null
      }
    ]
  };

  try {
    setStatus('Сохраняю репорт...');
    const response = await fetch('/api/save-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Не удалось сохранить репорт.');
    }
    setStatus(`Репорт сохранен (${data.id}).`, 'ok');
    return true;
  } catch (error) {
    setStatus(error.message || 'Ошибка сохранения репорта.', 'error');
    return false;
  }
}

function createHhManualFieldEditor(parsed, apiField, options = {}) {
  const canEdit = canEditHhSample(parsed) && options.readOnly !== true;
  const field = String(apiField || '').trim().toLowerCase();
  const scopeKey = buildHhManualReportKey(parsed);
  const recordKey = scopeKey ? `manual:${scopeKey}|${field}` : '';
  const currentValue = hhManualFieldValue(parsed, field);

  const wrapper = document.createElement('div');
  wrapper.className = 'pt-manual-box';
  if (options.extraClass) {
    wrapper.classList.add(options.extraClass);
  }

  const inputWrap = document.createElement('div');
  inputWrap.className = 'pt-manual-input-wrap';
  const voiceBtn = document.createElement('button');
  voiceBtn.type = 'button';
  voiceBtn.className = 'pt-manual-mic-btn';
  voiceBtn.title = 'голосовой ввод';
  voiceBtn.disabled = !canEdit;
  const refreshVoiceLabel = () => {
    voiceBtn.textContent = isHhManualRecordingActive() && hhManualRecordingKey === recordKey ? '■' : '🎤';
    const disabledByOtherRecord = isHhManualRecordingActive() && hhManualRecordingKey !== recordKey;
    voiceBtn.disabled = !canEdit || disabledByOtherRecord;
  };
  refreshVoiceLabel();

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'pt-manual-input';
  input.value = currentValue;
  const committedValue = { value: currentValue };
  input.placeholder = canEdit ? '' : '—';
  input.disabled = !canEdit;
  const isHandPresuppField = field === 'hand_presupposition';
  if (isHandPresuppField) {
    wrapper.classList.add('pt-manual-box-hand-presup');
  }
  const updateHandPresupLayout = () => {
    if (!isHandPresuppField) return;
    const normalized = String(input.value || '').trim();
    const isExpanded = normalized.length >= 72;
    wrapper.classList.toggle('pt-hand-presup-expanded', isExpanded);
  };
  updateHandPresupLayout();
  const openPresets = () => {
    if (!canEdit) return;
    inputWrap.classList.add('pt-manual-presets-open');
  };
  const closePresets = () => {
    inputWrap.classList.remove('pt-manual-presets-open');
  };
  const appendPreset = (presetValue) => {
    const preset = String(presetValue || '').trim();
    if (!preset) return String(input.value || '');
    const current = String(input.value || '').trim();
    if (!current) return preset;
    if (current.toLowerCase().includes(preset.toLowerCase())) return current;
    return `${current} / ${preset}`;
  };
  input.addEventListener('focus', openPresets);
  input.addEventListener('click', openPresets);
  input.addEventListener('input', () => {
    setHhManualFieldValue(parsed, field, input.value);
    updateHandPresupLayout();
  });
  input.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape') {
      closePresets();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!canEdit) return;
    const ok = await saveHhManualTextField(parsed, field, input.value);
    if (ok) {
      input.value = hhManualFieldValue(parsed, field);
      committedValue.value = input.value;
      updateHandPresupLayout();
    } else {
      setHhManualFieldValue(parsed, field, committedValue.value);
      input.value = committedValue.value;
      updateHandPresupLayout();
    }
  });

  voiceBtn.addEventListener('click', async () => {
    await startHhManualAudioRecording(parsed, field, () => {
      input.value = hhManualFieldValue(parsed, field);
      committedValue.value = input.value;
      updateHandPresupLayout();
      refreshVoiceLabel();
    });
    refreshVoiceLabel();
  });

  const presets = document.createElement('div');
  presets.className = 'pt-manual-presets';
  HH_MANUAL_PRESUPP_PRESETS.forEach((preset) => {
    const presetBtn = document.createElement('button');
    presetBtn.type = 'button';
    presetBtn.className = 'pt-manual-preset-btn';
    presetBtn.textContent = preset;
    presetBtn.disabled = !canEdit;
    let presetCommitInFlight = false;
    const applyPreset = async () => {
      if (!canEdit) return;
      if (presetCommitInFlight) return;
      const previousCommitted = String(committedValue.value || '');
      presetCommitInFlight = true;
      try {
        const nextValue = appendPreset(preset);
        input.value = nextValue;
        setHhManualFieldValue(parsed, field, nextValue);
        updateHandPresupLayout();
        const ok = await saveHhManualTextField(parsed, field, nextValue);
        if (ok) {
          input.value = hhManualFieldValue(parsed, field);
          committedValue.value = input.value;
          updateHandPresupLayout();
        } else {
          setHhManualFieldValue(parsed, field, previousCommitted);
          input.value = previousCommitted;
          updateHandPresupLayout();
        }
        input.focus();
        openPresets();
      } finally {
        presetCommitInFlight = false;
      }
    };
    presetBtn.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      void applyPreset();
    });
    presetBtn.addEventListener('click', (event) => {
      event.preventDefault();
    });
    presets.appendChild(presetBtn);
  });
  input.addEventListener('blur', () => {
    window.setTimeout(() => {
      if (document.activeElement === input) return;
      closePresets();
    }, 120);
  });

  inputWrap.appendChild(input);
  inputWrap.appendChild(voiceBtn);
  inputWrap.appendChild(presets);
  wrapper.appendChild(inputWrap);
  return wrapper;
}

function buildHhTrashIcon() {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9z');
  path.setAttribute('fill', 'currentColor');
  icon.appendChild(path);
  return icon;
}

function buildProfileTooltipContent(sampleInput, options = {}) {
  const interactive = options.interactive === true;
  const hideEmptyTimingControls = options.hideEmptyTimingControls === true;
  const samples = normalizeTooltipSamples(sampleInput);
  const root = document.createElement('div');
  root.className = 'pt-wrap';
  if (hideEmptyTimingControls) {
    root.classList.add('pt-wrap-list');
  }

  samples.forEach((sampleText, sampleIndex) => {
    const parsed = parseTooltipSample(sampleText);
    const metaTokens = tooltipMetaTokens(parsed.meta);
    const editableByContext = canEditHhSample(parsed);
    const editableSample = interactive && editableByContext;
    const entry = document.createElement('div');
    entry.className = 'pt-entry';

    const head = document.createElement('div');
    head.className = 'pt-head';
    const headMain = document.createElement('div');
    headMain.className = 'pt-head-main';
    if (parsed.rowId) {
      const row = document.createElement('span');
      row.className = 'pt-rowid';
      row.textContent = parsed.rowId;
      headMain.appendChild(row);
    }
    if (parsed.focusStreet) {
      const street = document.createElement('span');
      street.className = 'pt-street';
      street.textContent = parsed.focusStreet;
      headMain.appendChild(street);
    }
    if (headMain.childNodes.length) {
      head.appendChild(headMain);
    }
    if (metaTokens.length) {
      const metaWrap = document.createElement('div');
      metaWrap.className = 'pt-head-meta';
      metaTokens.forEach((token) => {
        const item = document.createElement('span');
        item.className = 'pt-meta-token';
        item.textContent = token;
        metaWrap.appendChild(item);
      });
      head.appendChild(metaWrap);
    }
    if (editableByContext) {
      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'pt-meta-actions';
      const reportKey = buildHhManualReportKey(parsed);

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'pt-meta-clear-btn';
      clearBtn.title = 'удалить пресуппозиции и тайминги в этой раздаче';
      clearBtn.disabled = !editableSample || !reportKey;
      clearBtn.appendChild(buildHhTrashIcon());
      clearBtn.addEventListener('click', async () => {
        await clearHhManualForParsedHand(parsed);
      });
      actionsWrap.appendChild(clearBtn);

      const reportBtn = document.createElement('button');
      reportBtn.type = 'button';
      reportBtn.className = 'pt-meta-report-btn';
      reportBtn.textContent = 'сохранить репорт';
      reportBtn.disabled = !editableSample || !reportKey;
      reportBtn.addEventListener('click', async () => {
        await saveHhManualReport(parsed);
      });
      actionsWrap.appendChild(reportBtn);
      head.appendChild(actionsWrap);
    }
    if (head.childNodes.length) {
      entry.appendChild(head);
    }

    const streets = Array.isArray(parsed.streets) ? parsed.streets : [];
    markHeroSegments(streets, extractTargetIdentity(profileModalOpponent));
    const hasManualContext = editableByContext;

    const handsSegments = collectTooltipHandsSegments(streets);
    if (handsSegments.length) {
      const handsRow = document.createElement('div');
      handsRow.className = 'pt-street-row';

      const handsLabel = document.createElement('span');
      handsLabel.className = 'pt-street-label';
      handsLabel.textContent = 'HANDS';
      handsRow.appendChild(handsLabel);

      handsRow.appendChild(
        renderTooltipSegmentLine(handsSegments, {
          showPot: false,
          showAction: false,
          showTags: false,
          showBoard: false,
          showExtras: false,
          showAllIn: false
        })
      );
      entry.appendChild(handsRow);
    }

    streets.forEach((street) => {
      const row = document.createElement('div');
      row.className = `pt-street-row ${hasManualContext ? 'pt-street-row-editable' : ''}`.trim();

      const label = document.createElement('span');
      label.className = 'pt-street-label';
      label.textContent = street.name || '';
      row.appendChild(label);

      const content = document.createElement('div');
      content.className = 'pt-street-main';
      const raw = String(street.raw || '').trim();
      if (!raw) {
        const empty = document.createElement('span');
        empty.className = 'pt-empty';
        empty.textContent = '—';
        content.appendChild(empty);
      } else {
        const segments = street.segments?.length
          ? street.segments
          : [parseTooltipSegment(raw)];
        const timingStreet = String(street.name || '').trim().toLowerCase();
        content.appendChild(renderTooltipSegmentLine(segments, {
          showCards: false,
          enableTiming: editableSample && HH_STREET_KEYS.has(timingStreet),
          timingStreet,
          hideEmptyTimingControls,
          onTimingChange: async ({ street: nextStreet, actionIndex, actionKey, timing }) => saveHhManualTiming(parsed, {
            street: nextStreet,
            actionIndex,
            actionKey,
            timing
          }),
          getTimingValue: (nextStreet, actionIndex, segment) => getParsedTimingValue(
            parsed,
            nextStreet,
            actionIndex,
            String(segment?.raw || '').trim()
          )
        }));
      }
      row.appendChild(content);

      if (hasManualContext) {
        const streetKey = String(street.name || '').trim().toLowerCase();
        row.appendChild(createHhManualFieldEditor(parsed, streetKey, { readOnly: !editableSample }));
      }
      entry.appendChild(row);
    });

    if (hasManualContext) {
      const globalRow = document.createElement('div');
      globalRow.className = 'pt-street-row pt-hand-presup-row';

      const globalLabel = document.createElement('span');
      globalLabel.className = 'pt-street-label';
      globalLabel.textContent = 'PRESUP';
      globalRow.appendChild(globalLabel);

      const globalMain = document.createElement('div');
      globalMain.className = 'pt-street-main';
      globalMain.appendChild(createHhManualFieldEditor(parsed, 'hand_presupposition', { readOnly: !editableSample }));
      globalRow.appendChild(globalMain);
      entry.appendChild(globalRow);
    }

    root.appendChild(entry);

    if (sampleIndex < samples.length - 1) {
      const divider = document.createElement('div');
      divider.className = 'pt-entry-divider';
      root.appendChild(divider);
    }
  });

  return root;
}

function moveProfileTooltip(event) {
  if (!profileTooltipEl || profileTooltipEl.classList.contains('hidden')) return;
  if (profileTooltipPinned) return;
  const offset = 14;
  const maxX = window.innerWidth - profileTooltipEl.offsetWidth - 8;
  const maxY = window.innerHeight - profileTooltipEl.offsetHeight - 8;
  const x = Math.min(maxX, event.clientX + offset);
  const y = Math.min(maxY, event.clientY + offset);
  profileTooltipEl.style.left = `${Math.max(8, x)}px`;
  profileTooltipEl.style.top = `${Math.max(8, y)}px`;
}

function showProfileTooltip(sampleInput, event) {
  if (!profileTooltipEl) return;
  if (profileTooltipPinned) return;
  profileTooltipSampleInput = sampleInput;
  profileTooltipEl.innerHTML = '';
  profileTooltipEl.appendChild(buildProfileTooltipContent(sampleInput, { interactive: false }));
  profileTooltipEl.scrollTop = 0;
  profileTooltipEl.classList.remove('hidden');
  profileTooltipEl.setAttribute('aria-hidden', 'false');
  moveProfileTooltip(event);
}

function hideProfileTooltip(options = {}) {
  if (!profileTooltipEl) return;
  if (profileTooltipPinned && options.force !== true) return;
  unpinProfileTooltip();
  profileTooltipSampleInput = null;
  profileTooltipEl.classList.add('hidden');
  profileTooltipEl.setAttribute('aria-hidden', 'true');
}

function renderProfileRows(rows = [], legend = []) {
  const fragment = document.createDocumentFragment();
  const order = ['nuts', 'strong', 'conditionalStrong', 'fragileStrong', 'overpair', 'twoPair', 'topPair', 'strongDraw', 'weakDraw', 'lightFold', 'weak', 'unknown'];

  const appendLaneSegments = (laneEl, laneTotal, counts = {}, samples = {}, fallbackSamples = []) => {
    if (!(laneTotal > 0)) {
      laneEl.classList.add('profile-lane-empty');
      return;
    }
    order.forEach((key) => {
      const count = Number(counts?.[key] || 0);
      if (!count) return;
      const width = (count / laneTotal) * 100;
      const segment = document.createElement('div');
      segment.className = 'profile-segment';
      segment.style.width = `${width}%`;
      segment.style.background = profileLegendColor(legend, key);
      const samplesForKey = Array.isArray(samples?.[key]) ? samples[key] : [];
      const samplesAll = Array.isArray(samples?.all) ? samples.all : [];
      const tooltipSamples = samplesForKey.length
        ? samplesForKey
        : (samplesAll.length ? samplesAll : fallbackSamples);
      if (tooltipSamples.length) {
        segment.addEventListener('mouseenter', (event) => showProfileTooltip(tooltipSamples, event));
        segment.addEventListener('mousemove', moveProfileTooltip);
        segment.addEventListener('mouseleave', hideProfileTooltip);
        segment.addEventListener('click', (event) => {
          showProfileTooltip(tooltipSamples, event);
          pinProfileTooltip();
          event.preventDefault();
          event.stopPropagation();
        });
      }
      if (width >= 22) {
        segment.textContent = String(count);
      }
      laneEl.appendChild(segment);
    });
  };

  rows.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'profile-row';

    const bucket = document.createElement('div');
    bucket.textContent = row.bucket;

    const total = document.createElement('div');
    total.className = 'profile-row-total';
    total.textContent = row.total > 0 ? String(row.total) : '--';

    const bar = document.createElement('div');
    bar.className = `profile-bar ${row.total > 0 ? '' : 'profile-empty'}`.trim();

    const normalLane = document.createElement('div');
    normalLane.className = 'profile-lane profile-lane-normal';
    const allInLane = document.createElement('div');
    allInLane.className = 'profile-lane profile-lane-allin';

    const fallbackSamples = Array.isArray(row?.samples?.all) ? row.samples.all : [];
    appendLaneSegments(
      normalLane,
      Number(row?.normalTotal || 0),
      row?.countsNormal || {},
      row?.samplesNormal || {},
      fallbackSamples
    );
    appendLaneSegments(
      allInLane,
      Number(row?.allInTotal || 0),
      row?.countsAllIn || {},
      row?.samplesAllIn || {},
      fallbackSamples
    );

    bar.appendChild(normalLane);
    bar.appendChild(allInLane);

    rowEl.appendChild(bucket);
    rowEl.appendChild(total);
    rowEl.appendChild(bar);
    fragment.appendChild(rowEl);
  });
  return fragment;
}

function createFilterButton(label, active, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `profile-filter-btn ${active ? 'active' : ''}`.trim();
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function normalizeRoomKey(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveProfileRoomKey(filters = profileFilters, roomOptions = profileFilterOptions.rooms) {
  const rooms = Array.isArray(filters?.rooms) ? filters.rooms : [];
  if (rooms.length === 1) return normalizeRoomKey(rooms[0]);
  const available = Array.isArray(roomOptions) ? roomOptions : [];
  if (available.length === 1) return normalizeRoomKey(available[0]);
  return '';
}

function profileMyNicknameForRoom(roomKey) {
  const key = normalizeRoomKey(roomKey);
  if (!key) return '';
  return String(profileMyNickByRoom[key] || '').trim();
}

function persistProfileMyNickname(roomKey, nickname) {
  const key = normalizeRoomKey(roomKey);
  if (!key) return;
  const next = { ...profileMyNickByRoom };
  const normalizedNick = String(nickname || '').trim();
  if (!normalizedNick) {
    delete next[key];
  } else {
    next[key] = normalizedNick;
  }
  profileMyNickByRoom = next;
  saveProfileMyNickByRoom(profileMyNickByRoom);
}

function currentMainRoomKey() {
  return resolveProfileRoomKey(profileFilters, profileFilterOptions.rooms);
}

function currentMainMyNickname() {
  return profileMyNicknameForRoom(currentMainRoomKey());
}

function syncMainVsMeFilter() {
  if (!profileVsMeEnabled) return;
  const myNickname = currentMainMyNickname();
  if (!myNickname) {
    profileVsMeEnabled = false;
  }
  profileFilters = {
    ...profileFilters,
    vsOpponent: profileVsMeEnabled ? myNickname : ''
  };
}

function toggleMultiFilterState(filters, key, value) {
  const current = Array.isArray(filters[key]) ? [...filters[key]] : [];
  const normalizedValue = String(value);
  const index = current.indexOf(normalizedValue);
  if (index >= 0) current.splice(index, 1);
  else current.push(normalizedValue);
  return { ...filters, [key]: current };
}

function setSingleFilterState(filters, key, value) {
  const nextValue = String(value);
  const currentValue = String(filters[key] || 'all');
  return { ...filters, [key]: currentValue === nextValue ? 'all' : nextValue };
}

function toggleMultiFilter(key, value) {
  profileFilters = toggleMultiFilterState(profileFilters, key, value);
  if (key === 'rooms') {
    syncMainVsMeFilter();
  }
}

function setSingleFilter(key, value) {
  profileFilters = setSingleFilterState(profileFilters, key, value);
}

function setVsFilter(value) {
  const normalized = String(value || '').trim();
  profileFilters = { ...profileFilters, vsOpponent: normalized };
  if (profileVsMeEnabled) {
    const myNickname = currentMainMyNickname();
    if (!myNickname || myNickname !== normalized) {
      profileVsMeEnabled = false;
    }
  }
}

function setFiltersAndReload() {
  if (!profileModalOpponent) return;
  syncMainVsMeFilter();
  renderProfileModalState(profileModalOpponent, profileModalSource);
  if (profileViewMode === 'list') {
    prefetchOpponentProfileList(profileModalOpponent, {
      force: true,
      source: profileModalSource,
      filters: profileFilters
    });
    return;
  }
  prefetchOpponentProfile(profileModalOpponent, {
    force: true,
    source: profileModalSource,
    filters: profileFilters
  });
}

function cloneProfileFilters(filters) {
  const source = filters || createDefaultProfileFilters();
  return {
    ...createDefaultProfileFilters(),
    playerGroups: Array.isArray(source.playerGroups) ? [...source.playerGroups] : [],
    datePreset: String(source.datePreset || 'all'),
    gameCards: Array.isArray(source.gameCards) ? [...source.gameCards] : [],
    rooms: Array.isArray(source.rooms) ? [...source.rooms] : [],
    potBuckets: Array.isArray(source.potBuckets) ? [...source.potBuckets] : [],
    limits: Array.isArray(source.limits) ? [...source.limits] : [],
    vsOpponent: String(source.vsOpponent || ''),
    cardsVisibility: String(source.cardsVisibility || 'showdown') === 'known' ? 'known' : 'showdown',
    recentLimit: String(source.recentLimit || 'all'),
    manualOnly: source.manualOnly === true
  };
}

function resetMirrorFilters() {
  const next = cloneProfileFilters(profileFilters);
  next.vsOpponent = profileMirrorVsHimEnabled ? String(profileModalOpponent || '').trim() : '';
  profileMirrorFilters = next;
}

async function clearHhHandsForCurrentOpponent() {
  if (String(profileModalSource || '').toLowerCase() !== 'hh') return;
  const opponent = String(profileModalOpponent || '').trim();
  if (!opponent) return;
  if (isAnyRecordingActive() || isBatchProcessing) {
    setStatus('Сначала завершите текущую запись.', 'error');
    return;
  }
  const confirmed = window.confirm(`Удалить HH раздачи только для игрока "${opponent}"?`);
  if (!confirmed) return;

  try {
    setStatus(`Удаляю HH руки игрока ${opponent}...`);
    const response = await fetch('/api/hh-clear-opponent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opponent })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка очистки HH DB по игроку.');
    }
    clearProfileCacheByOpponent(opponent);
    const notes = Number(data.notesDeleted || 0);
    const hands = Number(data.handsDeleted || 0);
    setStatus(`HH очищено для ${opponent}: notes=${notes}, hands=${hands}.`, 'ok');
    setFiltersAndReload();
  } catch (error) {
    setStatus(error.message || 'Ошибка очистки HH DB по игроку.', 'error');
  }
}

async function clearAllHhHandsInDb() {
  if (isAnyRecordingActive() || isBatchProcessing) {
    setStatus('Сначала завершите текущую запись.', 'error');
    return;
  }
  const confirmed = window.confirm('Удалить ВСЮ HH базу (руки) для всех игроков? Ручные пресуппозиции и тайминги останутся.');
  if (!confirmed) return;

  try {
    setStatus('Удаляю всю HH базу...');
    const response = await fetch('/api/hh-clear-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка полной очистки HH DB.');
    }
    profileCache.clear();
    profileListCache.clear();
    const notes = Number(data.notesDeleted || 0);
    const hands = Number(data.handsDeleted || 0);
    setStatus(`Вся HH база очищена: notes=${notes}, hands=${hands}.`, 'ok');
    if (profileModalOpponent && String(profileModalSource || '').toLowerCase() === 'hh') {
      setFiltersAndReload();
    }
  } catch (error) {
    setStatus(error.message || 'Ошибка полной очистки HH DB.', 'error');
  }
}

async function clearHhManualForParsedHand(parsed) {
  if (!canEditHhSample(parsed)) {
    setStatus('Эта раздача не из HH DB — удаление ручных данных недоступно.', 'error');
    return false;
  }
  if (!canMutateHhManual()) {
    setStatus('Сначала завершите текущую запись.', 'error');
    return false;
  }
  const opponent = resolveProfileModalOpponent(parsed);
  if (!opponent) {
    setStatus('Не удалось определить выбранного игрока.', 'error');
    return false;
  }
  const context = parsed?.context && typeof parsed.context === 'object' ? parsed.context : {};
  const handNumber = String(context.handNumber || '').trim();
  const confirmText = handNumber
    ? `Удалить все ручные пресуппозиции и тайминги для раздачи #${handNumber}?`
    : 'Удалить все ручные пресуппозиции и тайминги для этой раздачи?';
  if (!window.confirm(confirmText)) return false;

  try {
    const response = await fetch('/api/hh-manual-clear-hand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opponent,
        row: context.row,
        handNumber: context.handNumber,
        room: context.room,
        targetIdentity: context.targetIdentity
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка удаления ручных данных HH по раздаче.');
    }
    setParsedManualFieldsFromApi(parsed, {});
    setParsedTimingFieldsFromApi(parsed, []);
    syncProfileTooltipSampleInput(parsed);
    clearProfileCacheByOpponent(opponent);
    refreshPinnedProfileTooltip();
    setStatus('Ручные пресуппозиции и тайминги по раздаче удалены.', 'ok');
    return true;
  } catch (error) {
    setStatus(error.message || 'Ошибка удаления ручных данных HH по раздаче.', 'error');
    return false;
  }
}

async function clearHhManualForCurrentOpponent() {
  if (String(profileModalSource || '').toLowerCase() !== 'hh') return;
  const opponent = String(profileModalOpponent || '').trim();
  if (!opponent) return;
  if (!canMutateHhManual()) {
    setStatus('Сначала завершите текущую запись.', 'error');
    return;
  }
  const confirmed = window.confirm(`Удалить ВСЕ ручные пресуппозиции и тайминги для игрока "${opponent}"?`);
  if (!confirmed) return;

  try {
    setStatus(`Удаляю ручные записи игрока ${opponent}...`);
    const response = await fetch('/api/hh-manual-clear-opponent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opponent,
        targetIdentity: extractTargetIdentity(opponent)
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка удаления ручных данных HH по игроку.');
    }
    clearProfileCacheByOpponent(opponent);
    const presuppDeleted = Number(data.presuppDeleted || 0);
    const timingsDeleted = Number(data.timingsDeleted || 0);
    setStatus(`Удалено ручных записей: presupp=${presuppDeleted}, timings=${timingsDeleted}.`, 'ok');
    setFiltersAndReload();
  } catch (error) {
    setStatus(error.message || 'Ошибка удаления ручных данных HH по игроку.', 'error');
  }
}

function buildProfileFilterGroups(roomValues = []) {
  const groups = [
    {
      title: 'Игроков в раздаче',
      buttons: [
        { label: '2', value: '2' },
        { label: '3-4', value: '3-4' },
        { label: '5-6', value: '5-6' },
        { label: '7-9', value: '7-9' }
      ],
      key: 'playerGroups',
      single: false
    },
    {
      title: 'Период',
      buttons: [
        { label: '6м', value: '6m' },
        { label: '3м', value: '3m' },
        { label: '1м', value: '1m' },
        { label: '1н', value: '1w' },
        { label: '3д', value: '3d' },
        { label: 'Сегодня', value: 'today' }
      ],
      key: 'datePreset',
      single: true
    },
    {
      title: 'Последние раздачи',
      buttons: [
        { label: '50', value: '50' },
        { label: '20', value: '20' }
      ],
      key: 'recentLimit',
      single: true
    },
    {
      title: 'Игра',
      buttons: [
        { label: 'PLO4', value: '4' },
        { label: 'PLO5', value: '5' },
        { label: 'PLO6', value: '6' }
      ],
      key: 'gameCards',
      single: false
    },
    {
      title: 'Размер банка (BB)',
      buttons: [
        { label: 'small 0-15', value: 'small' },
        { label: 'medium 15-35', value: 'medium' },
        { label: 'large 35-90', value: 'large' },
        { label: 'huge 90+', value: 'huge' }
      ],
      key: 'potBuckets',
      single: false
    },
    {
      title: 'Лимит',
      buttons: [
        { label: '2-4', value: '2-4' },
        { label: '2,5-5', value: '2.5-5' },
        { label: '3-6', value: '3-6' },
        { label: '5-10', value: '5-10' },
        { label: '10-20', value: '10-20' },
        { label: '25-50', value: '25-50' },
        { label: '50-100', value: '50-100' },
        { label: '100-200', value: '100-200' }
      ],
      key: 'limits',
      single: false
    }
  ];

  if (Array.isArray(roomValues) && roomValues.length > 0) {
    groups.push({
      title: 'Room',
      buttons: roomValues.map((room) => ({ label: room, value: room })),
      key: 'rooms',
      single: false
    });
  }
  return groups;
}

function appendProfileFilterGroups(wrap, filters, roomValues, onFilterChange) {
  const groups = buildProfileFilterGroups(roomValues);
  groups.forEach((group) => {
    const row = document.createElement('div');
    row.className = 'profile-filter-row';

    const title = document.createElement('div');
    title.className = 'profile-filter-title';
    title.textContent = group.title;
    row.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'profile-filter-actions';

    group.buttons.forEach((item) => {
      const value = String(item.value);
      const active = group.single
        ? String(filters[group.key] || '') === value
        : (Array.isArray(filters[group.key]) && filters[group.key].includes(value));
      const button = createFilterButton(item.label, active, () => onFilterChange(group, value));
      actions.appendChild(button);
    });

    row.appendChild(actions);
    wrap.appendChild(row);
  });
}

function renderProfileFilters(context = 'main') {
  const isMirror = context === 'mirror';
  const filters = isMirror ? profileMirrorFilters : profileFilters;
  const options = isMirror ? profileMirrorFilterOptions : profileFilterOptions;
  const wrap = document.createElement('div');
  wrap.className = isMirror ? 'profile-filters profile-filters-mirror' : 'profile-filters';

  if (!isMirror) {
    const modeRow = document.createElement('div');
    modeRow.className = 'profile-filter-row';
    const modeTitle = document.createElement('div');
    modeTitle.className = 'profile-filter-title';
    modeTitle.textContent = 'Режим';
    modeRow.appendChild(modeTitle);
    const modeActions = document.createElement('div');
    modeActions.className = 'profile-filter-actions';
    modeActions.appendChild(createFilterButton('График', profileViewMode === 'chart', () => {
      if (profileViewMode === 'chart') return;
      profileViewMode = 'chart';
      renderProfileModalState(profileModalOpponent, profileModalSource);
      prefetchOpponentProfile(profileModalOpponent, {
        force: false,
        source: profileModalSource,
        filters: profileFilters
      });
    }));
    modeActions.appendChild(createFilterButton('Визуализировать списком', profileViewMode === 'list', () => {
      if (profileViewMode === 'list') return;
      profileViewMode = 'list';
      renderProfileModalState(profileModalOpponent, profileModalSource);
      prefetchOpponentProfileList(profileModalOpponent, {
        force: false,
        source: profileModalSource,
        filters: profileFilters
      });
    }));
    modeRow.appendChild(modeActions);
    wrap.appendChild(modeRow);
  }

  if (!isMirror && profileModalSource === 'hh') {
    const clearRow = document.createElement('div');
    clearRow.className = 'profile-filter-row profile-clear-row';

    const clearTitle = document.createElement('div');
    clearTitle.className = 'profile-filter-title';
    clearTitle.textContent = 'HH DB';
    clearRow.appendChild(clearTitle);

    const clearActions = document.createElement('div');
    clearActions.className = 'profile-filter-actions';

    const clearOpponentBtn = createFilterButton('Стереть руки игрока', false, clearHhHandsForCurrentOpponent);
    clearOpponentBtn.classList.add('profile-filter-danger');

    clearActions.appendChild(clearOpponentBtn);
    clearRow.appendChild(clearActions);
    wrap.appendChild(clearRow);

    const manualRow = document.createElement('div');
    manualRow.className = 'profile-filter-row profile-clear-row';

    const manualTitle = document.createElement('div');
    manualTitle.className = 'profile-filter-title';
    manualTitle.textContent = 'Ручные записи';
    manualRow.appendChild(manualTitle);

    const manualActions = document.createElement('div');
    manualActions.className = 'profile-filter-actions';

    const manualOnlyBtn = createFilterButton('только с заметками', profileFilters.manualOnly === true, () => {
      profileFilters = {
        ...profileFilters,
        manualOnly: profileFilters.manualOnly !== true
      };
      setFiltersAndReload();
    });
    const clearManualBtn = createFilterButton('удалить записи игрока', false, clearHhManualForCurrentOpponent);
    clearManualBtn.classList.add('profile-filter-danger');

    manualActions.appendChild(manualOnlyBtn);
    manualActions.appendChild(clearManualBtn);
    manualRow.appendChild(manualActions);
    wrap.appendChild(manualRow);

    const cardsRow = document.createElement('div');
    cardsRow.className = 'profile-filter-row profile-clear-row';
    const cardsTitle = document.createElement('div');
    cardsTitle.className = 'profile-filter-title';
    cardsTitle.textContent = 'Карты';
    cardsRow.appendChild(cardsTitle);
    const cardsActions = document.createElement('div');
    cardsActions.className = 'profile-filter-actions';
    const cardsMode = String(profileFilters.cardsVisibility || 'showdown').toLowerCase() === 'known'
      ? 'known'
      : 'showdown';
    cardsActions.appendChild(createFilterButton('только showdown', cardsMode === 'showdown', () => {
      if (cardsMode === 'showdown') return;
      profileFilters = { ...profileFilters, cardsVisibility: 'showdown' };
      setFiltersAndReload();
    }));
    cardsActions.appendChild(createFilterButton('все известные карты', cardsMode === 'known', () => {
      if (cardsMode === 'known') return;
      profileFilters = { ...profileFilters, cardsVisibility: 'known' };
      setFiltersAndReload();
    }));
    cardsRow.appendChild(cardsActions);
    wrap.appendChild(cardsRow);
  }

  if (isMirror && profileModalSource === 'hh') {
    const manualRow = document.createElement('div');
    manualRow.className = 'profile-filter-row profile-clear-row';

    const manualTitle = document.createElement('div');
    manualTitle.className = 'profile-filter-title';
    manualTitle.textContent = 'Ручные записи';
    manualRow.appendChild(manualTitle);

    const manualActions = document.createElement('div');
    manualActions.className = 'profile-filter-actions';
    const manualOnlyBtn = createFilterButton('только с заметками', profileMirrorFilters.manualOnly === true, () => {
      profileMirrorFilters = {
        ...profileMirrorFilters,
        manualOnly: profileMirrorFilters.manualOnly !== true
      };
      setFiltersAndReload();
    });
    manualActions.appendChild(manualOnlyBtn);
    manualRow.appendChild(manualActions);
    wrap.appendChild(manualRow);

    const cardsRow = document.createElement('div');
    cardsRow.className = 'profile-filter-row profile-clear-row';
    const cardsTitle = document.createElement('div');
    cardsTitle.className = 'profile-filter-title';
    cardsTitle.textContent = 'Карты';
    cardsRow.appendChild(cardsTitle);
    const cardsActions = document.createElement('div');
    cardsActions.className = 'profile-filter-actions';
    const cardsMode = String(profileMirrorFilters.cardsVisibility || 'showdown').toLowerCase() === 'known'
      ? 'known'
      : 'showdown';
    cardsActions.appendChild(createFilterButton('только showdown', cardsMode === 'showdown', () => {
      if (cardsMode === 'showdown') return;
      profileMirrorFilters = { ...profileMirrorFilters, cardsVisibility: 'showdown' };
      setFiltersAndReload();
    }));
    cardsActions.appendChild(createFilterButton('все известные карты', cardsMode === 'known', () => {
      if (cardsMode === 'known') return;
      profileMirrorFilters = { ...profileMirrorFilters, cardsVisibility: 'known' };
      setFiltersAndReload();
    }));
    cardsRow.appendChild(cardsActions);
    wrap.appendChild(cardsRow);
  }

  const roomValues = Array.isArray(options.rooms) ? options.rooms : [];
  appendProfileFilterGroups(wrap, filters, roomValues, (group, value) => {
    if (isMirror) {
      if (group.single) {
        profileMirrorFilters = setSingleFilterState(profileMirrorFilters, group.key, value);
      } else {
        profileMirrorFilters = toggleMultiFilterState(profileMirrorFilters, group.key, value);
      }
      setFiltersAndReload();
      return;
    }
    if (group.single) {
      setSingleFilter(group.key, value);
    } else {
      toggleMultiFilter(group.key, value);
    }
    setFiltersAndReload();
  });

  if (isMirror && profileModalSource === 'hh') {
    const vsRow = document.createElement('div');
    vsRow.className = 'profile-filter-row';
    const vsTitle = document.createElement('div');
    vsTitle.className = 'profile-filter-title';
    vsTitle.textContent = 'VS him';
    vsRow.appendChild(vsTitle);
    const vsActions = document.createElement('div');
    vsActions.className = 'profile-filter-actions profile-filter-actions-vs';

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'profile-vs-toggle';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = profileMirrorVsHimEnabled === true;
    toggle.addEventListener('change', () => {
      profileMirrorVsHimEnabled = toggle.checked === true;
      profileMirrorFilters = {
        ...profileMirrorFilters,
        vsOpponent: profileMirrorVsHimEnabled ? String(profileModalOpponent || '').trim() : ''
      };
      setFiltersAndReload();
    });
    const toggleText = document.createElement('span');
    toggleText.textContent = 'против выбранного игрока';
    toggleLabel.appendChild(toggle);
    toggleLabel.appendChild(toggleText);
    vsActions.appendChild(toggleLabel);
    vsRow.appendChild(vsActions);
    wrap.appendChild(vsRow);
  }

  if (!isMirror && profileModalSource === 'hh') {
    const vsRow = document.createElement('div');
    vsRow.className = 'profile-filter-row';

    const vsTitle = document.createElement('div');
    vsTitle.className = 'profile-filter-title';
    vsTitle.textContent = 'VS игрок';
    vsRow.appendChild(vsTitle);

    const vsActions = document.createElement('div');
    vsActions.className = 'profile-filter-actions profile-filter-actions-vs';

    const vsInput = document.createElement('input');
    vsInput.type = 'text';
    vsInput.className = 'profile-vs-input';
    vsInput.placeholder = 'выбери оппонента';
    vsInput.value = String(profileFilters.vsOpponent || '');

    const suggestionList = document.createElement('datalist');
    suggestionList.id = 'profile-vs-suggestions-main';
    const refillVsSuggestions = (query = '') => {
      suggestionList.innerHTML = '';
      const items = mergedSuggestions(query);
      items.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        suggestionList.appendChild(option);
      });
    };
    refillVsSuggestions(vsInput.value);
    vsInput.setAttribute('list', suggestionList.id);
    vsInput.addEventListener('input', () => {
      refillVsSuggestions(vsInput.value);
    });

    const applyVs = () => {
      const currentValue = String(profileFilters.vsOpponent || '').trim();
      const nextValue = String(vsInput.value || '').trim();
      if (currentValue === nextValue) return;
      setVsFilter(nextValue);
      const myNickname = currentMainMyNickname();
      profileVsMeEnabled = Boolean(myNickname && myNickname.toLowerCase() === nextValue.toLowerCase());
      setFiltersAndReload();
    };

    vsInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      applyVs();
    });
    vsInput.addEventListener('blur', applyVs);

    const clearVsButton = createFilterButton('сбросить', false, () => {
      if (!profileFilters.vsOpponent) return;
      profileVsMeEnabled = false;
      setVsFilter('');
      vsInput.value = '';
      refillVsSuggestions('');
      setFiltersAndReload();
    });

    const vsMeta = document.createElement('div');
    vsMeta.className = 'profile-vs-meta';

    const vsMeLabel = document.createElement('label');
    vsMeLabel.className = 'profile-vs-toggle';
    const vsMeCheckbox = document.createElement('input');
    vsMeCheckbox.type = 'checkbox';
    vsMeCheckbox.checked = profileVsMeEnabled === true;
    const vsMeText = document.createElement('span');
    vsMeText.textContent = 'VS me';
    vsMeLabel.appendChild(vsMeCheckbox);
    vsMeLabel.appendChild(vsMeText);

    const roomKey = currentMainRoomKey();
    const myNicknameInput = document.createElement('input');
    myNicknameInput.type = 'text';
    myNicknameInput.className = 'profile-my-nick-input';
    myNicknameInput.placeholder = roomKey ? `my nickname (${roomKey})` : 'my nickname (выбери room)';
    myNicknameInput.value = profileMyNicknameForRoom(roomKey);
    myNicknameInput.disabled = !roomKey;

    const saveMyNickname = () => {
      if (!roomKey) return;
      const nextNickname = String(myNicknameInput.value || '').trim();
      const prevNickname = profileMyNicknameForRoom(roomKey);
      if (prevNickname === nextNickname) return;
      persistProfileMyNickname(roomKey, nextNickname);
      if (profileVsMeEnabled) {
        setVsFilter(nextNickname);
        vsInput.value = nextNickname;
      }
      setFiltersAndReload();
    };
    myNicknameInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      saveMyNickname();
    });
    myNicknameInput.addEventListener('blur', saveMyNickname);

    vsMeCheckbox.addEventListener('change', () => {
      profileVsMeEnabled = vsMeCheckbox.checked === true;
      if (!profileVsMeEnabled) {
        setVsFilter('');
        vsInput.value = '';
        setFiltersAndReload();
        return;
      }
      const myNickname = profileMyNicknameForRoom(roomKey);
      if (!myNickname) {
        profileVsMeEnabled = false;
        vsMeCheckbox.checked = false;
        setStatus('Укажи my nickname для выбранного room.', 'error');
        return;
      }
      setVsFilter(myNickname);
      vsInput.value = myNickname;
      setFiltersAndReload();
    });

    const myNickLabel = document.createElement('span');
    myNickLabel.className = 'profile-my-nick-label';
    myNickLabel.textContent = 'my nickname';

    vsActions.appendChild(vsInput);
    vsActions.appendChild(suggestionList);
    vsActions.appendChild(clearVsButton);
    vsMeta.appendChild(vsMeLabel);
    vsMeta.appendChild(myNickLabel);
    vsMeta.appendChild(myNicknameInput);
    vsActions.appendChild(vsMeta);
    vsRow.appendChild(vsActions);
    wrap.appendChild(vsRow);
  }

  return wrap;
}

function buildProfileLegend(legendItems = []) {
  const legend = document.createElement('div');
  legend.className = 'profile-legend';
  legendItems.forEach((item) => {
    const entry = document.createElement('div');
    entry.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = item.color;
    const label = document.createElement('span');
    label.textContent = item.label;
    entry.appendChild(swatch);
    entry.appendChild(label);
    legend.appendChild(entry);
  });
  return legend;
}

function buildProfileGrid(sections = [], legend = []) {
  const grid = document.createElement('div');
  grid.className = 'profile-grid';
  sections.forEach((section) => {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'profile-section';

    const sectionTitle = document.createElement('h4');
    sectionTitle.className = 'profile-section-title';
    sectionTitle.textContent = section.title;
    sectionEl.appendChild(sectionTitle);

    (section.groups || []).forEach((group) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'profile-group';

      const groupTitle = document.createElement('div');
      groupTitle.className = 'profile-group-title';
      groupTitle.textContent = group.title;
      groupEl.appendChild(groupTitle);

      groupEl.appendChild(renderProfileRows(group.rows || [], legend));
      sectionEl.appendChild(groupEl);
    });

    grid.appendChild(sectionEl);
  });
  return grid;
}

function buildProfileListSamples(payload) {
  return Array.isArray(payload?.list)
    ? payload.list
      .map((row) => {
        const rowLabel = String(row?.rowLabel || '').trim() || `#DB:${row?.row ?? '?'}`;
        const handNumber = String(row?.handNumber || '').trim();
        const room = String(row?.room || '').trim().toLowerCase();
        const manual = {
          preflop: String(row?.manualPreflop || ''),
          flop: String(row?.manualFlop || ''),
          turn: String(row?.manualTurn || ''),
          river: String(row?.manualRiver || ''),
          handPresupposition: String(row?.handPresupposition || '')
        };
        const timings = Array.isArray(row?.manualTimings)
          ? row.manualTimings
            .map((item) => ({
              street: String(item?.street || '').trim().toLowerCase(),
              actionIndex: Number(item?.actionIndex),
              actionKey: String(item?.actionKey || ''),
              timing: normalizeTimingValue(item?.timing)
            }))
            .filter((item) => HH_STREET_KEYS.has(item.street) && Number.isFinite(item.actionIndex) && item.actionIndex >= 0)
          : [];
        const context = {
          row: Number.isFinite(Number(row?.row)) && Number(row.row) > 0
            ? Math.trunc(Number(row.row))
            : null,
          handNumber,
          room,
          opponent: String(payload?.opponent || ''),
          source: String(row?.nickname || '').toLowerCase() === 'hh' ? 'hh' : 'voice',
          targetIdentity: extractTargetIdentity(payload?.opponent || '')
        };
        return JSON.stringify({
          type: 'profile_sample_v2',
          rowLabel,
          focusStreet: '',
          manual,
          context,
          timings,
          streets: {
            preflop: String(row?.preflop || ''),
            flop: String(row?.flop || ''),
            turn: String(row?.turn || ''),
            river: String(row?.river || '')
          }
        });
      })
      .filter(Boolean)
    : [];
}

function buildProfileListView(payload, emptyText = 'По текущим фильтрам раздач нет.') {
  const samples = buildProfileListSamples(payload);
  if (!samples.length) {
    const empty = document.createElement('div');
    empty.className = 'profile-list-empty';
    empty.textContent = emptyText;
    return empty;
  }

  const listWrap = document.createElement('div');
  listWrap.className = 'profile-list-view';
  listWrap.appendChild(buildProfileTooltipContent(samples, { interactive: true, hideEmptyTimingControls: true }));
  return listWrap;
}

async function appendMirrorPerspectiveSection(container) {
  if (profileModalSource !== 'hh') return;
  const roomKey = currentMainRoomKey();
  const myNickname = profileMyNicknameForRoom(roomKey);
  if (!myNickname) return;

  const mirrorBlock = document.createElement('section');
  mirrorBlock.className = 'profile-mirror-section';
  const mirrorTitle = document.createElement('h4');
  mirrorTitle.className = 'profile-mirror-title';
  mirrorTitle.textContent = `Мой профиль: ${myNickname}`;
  mirrorBlock.appendChild(mirrorTitle);

  profileMirrorFilterOptions = { rooms: Array.isArray(profileFilterOptions.rooms) ? [...profileFilterOptions.rooms] : [] };
  if (profileMirrorVsHimEnabled) {
    profileMirrorFilters = {
      ...cloneProfileFilters(profileMirrorFilters),
      vsOpponent: String(profileModalOpponent || '').trim()
    };
  }
  mirrorBlock.appendChild(renderProfileFilters('mirror'));

  const mirrorBody = document.createElement('div');
  mirrorBody.className = 'profile-mirror-body';
  mirrorBody.textContent = profileViewMode === 'list'
    ? 'Собираю мой список раздач...'
    : 'Собираю мою визуализацию...';
  mirrorBlock.appendChild(mirrorBody);
  container.appendChild(mirrorBlock);

  const requestId = ++profileMirrorRequestId;
  if (profileViewMode === 'list') {
    const payload = await prefetchOpponentProfileList(myNickname, {
      force: false,
      source: profileModalSource,
      filters: profileMirrorFilters,
      suppressRender: true
    });
    if (requestId !== profileMirrorRequestId || !mirrorBody.isConnected) return;
    if (!payload) {
      mirrorBody.textContent = 'Не удалось построить мой список.';
      return;
    }
    profileMirrorFilterOptions = {
      rooms: Array.isArray(payload?.filters?.options?.rooms) ? payload.filters.options.rooms : profileMirrorFilterOptions.rooms
    };
    mirrorBody.innerHTML = '';
    mirrorBody.appendChild(buildProfileListView(payload, 'Для моего профиля по текущим фильтрам раздач нет.'));
    return;
  }

  const profile = await prefetchOpponentProfile(myNickname, {
    force: false,
    source: profileModalSource,
    filters: profileMirrorFilters,
    suppressRender: true
  });
  if (requestId !== profileMirrorRequestId || !mirrorBody.isConnected) return;
  if (!profile) {
    mirrorBody.textContent = 'Не удалось построить мою визуализацию.';
    return;
  }
  profileMirrorFilterOptions = {
    rooms: Array.isArray(profile?.filters?.options?.rooms) ? profile.filters.options.rooms : profileMirrorFilterOptions.rooms
  };
  mirrorBody.innerHTML = '';
  mirrorBody.appendChild(buildProfileLegend(profile?.legend || []));
  mirrorBody.appendChild(buildProfileGrid(profile?.sections || [], profile?.legend || []));
}

function renderProfileModal(profile) {
  if (!profileContentEl || !profileMetaEl || !profileTitleEl) return;
  profileContentEl.innerHTML = '';
  profileTitleEl.textContent = `Профиль: ${profile?.opponent || '—'}`;
  const sources = Array.isArray(profile?.sources) ? profile.sources : [];
  const sourceText = sources.length
    ? ` • источники: ${sources.map((item) => `${item.sheetName || 'active'}=${item.rows || 0}`).join(', ')}`
    : '';
  profileMetaEl.textContent = `строк в выборке: ${profile?.totalRows || 0} • учтено в секциях: ${profile?.analyzedRows || 0}${sourceText}`;

  const rooms = Array.isArray(profile?.filters?.options?.rooms)
    ? profile.filters.options.rooms
    : [];
  profileFilterOptions = { rooms };
  profileContentEl.appendChild(renderProfileFilters('main'));
  profileContentEl.appendChild(buildProfileLegend(profile?.legend || []));
  profileContentEl.appendChild(buildProfileGrid(profile?.sections || [], profile?.legend || []));
  appendMirrorPerspectiveSection(profileContentEl);
}

function renderProfileListPayload(payload) {
  if (!profileContentEl || !profileMetaEl || !profileTitleEl) return;
  profileContentEl.innerHTML = '';
  profileTitleEl.textContent = `Профиль: ${payload?.opponent || '—'}`;
  const sources = Array.isArray(payload?.sources) ? payload.sources : [];
  const sourceText = sources.length
    ? ` • источники: ${sources.map((item) => `${item.sheetName || 'active'}=${item.rows || 0}`).join(', ')}`
    : '';
  profileMetaEl.textContent = `строк в списке: ${payload?.totalRows || 0}${sourceText}`;

  const rooms = Array.isArray(payload?.filters?.options?.rooms)
    ? payload.filters.options.rooms
    : [];
  profileFilterOptions = { rooms };
  profileContentEl.appendChild(renderProfileFilters('main'));
  profileContentEl.appendChild(buildProfileListView(payload));
  appendMirrorPerspectiveSection(profileContentEl);
}

function renderProfileModalState(opponent, source = PROFILE_DEFAULT_SOURCE) {
  if (!profileContentEl || !profileMetaEl || !profileTitleEl) return;
  hideProfileTooltip();
  const sourceMode = normalizeProfileSource(source);
  const cache = profileViewMode === 'list' ? profileListCache : profileCache;
  const key = profileViewMode === 'list'
    ? profileListCacheKey(opponent, sourceMode, profileFilters)
    : profileCacheKey(opponent, sourceMode, profileFilters);
  const entry = cache.get(key);
  const sourceLabel = sourceMode === 'hh' ? 'HH DB' : (sourceMode === 'voice' ? 'Voice' : 'All');
  profileTitleEl.textContent = `Профиль: ${opponent}`;

  if (!entry || entry.status === 'loading') {
    profileMetaEl.textContent = profileViewMode === 'list'
      ? `Подготовка списка (${sourceLabel})...`
      : `Подготовка профиля (${sourceLabel})...`;
    profileContentEl.textContent = sourceMode === 'hh'
      ? (profileViewMode === 'list'
        ? 'Собираю список раздач из HH DB.'
        : 'Собираю строки оппонента из HH DB и считаю визуализацию.')
      : (profileViewMode === 'list'
        ? 'Собираю список раздач из источников.'
        : 'Собираю строки оппонента из источников и считаю визуализацию.');
    return;
  }
  if (entry.status === 'error') {
    profileMetaEl.textContent = profileViewMode === 'list'
      ? `Ошибка списка (${sourceLabel})`
      : `Ошибка (${sourceLabel})`;
    profileContentEl.textContent = entry.error || 'Не удалось построить профиль.';
    return;
  }
  if (profileViewMode === 'list') {
    renderProfileListPayload(entry.payload);
    return;
  }
  renderProfileModal(entry.profile);
}

async function prefetchOpponentProfile(opponent, options = {}) {
  const name = String(opponent || '').trim();
  if (!name) return null;
  const source = normalizeProfileSource(options.source || PROFILE_DEFAULT_SOURCE);
  const filters = options.filters || profileFilters;
  const suppressRender = options.suppressRender === true;
  const key = profileCacheKey(name, source, filters);
  const force = options.force === true;
  const current = profileCache.get(key);
  if (!force && current && (current.status === 'loading' || current.status === 'ready')) {
    return current.profile || null;
  }

  profileCache.set(key, { status: 'loading', profile: null, error: '' });
  if (!suppressRender && profileModalOpponent === name && profileModalSource === source) {
    renderProfileModalState(name, source);
  }

  try {
    const params = new URLSearchParams({ opponent: name, source });
    if (Array.isArray(filters.playerGroups) && filters.playerGroups.length) {
      params.set('players', filters.playerGroups.join(','));
    }
    if (filters.datePreset && filters.datePreset !== 'all') {
      params.set('date', filters.datePreset);
    }
    if (Array.isArray(filters.gameCards) && filters.gameCards.length) {
      params.set('games', filters.gameCards.join(','));
    }
    if (Array.isArray(filters.rooms) && filters.rooms.length) {
      params.set('rooms', filters.rooms.join(','));
    }
    if (Array.isArray(filters.potBuckets) && filters.potBuckets.length) {
      params.set('pots', filters.potBuckets.join(','));
    }
    if (Array.isArray(filters.limits) && filters.limits.length) {
      params.set('limits', filters.limits.join(','));
    }
    if (filters.vsOpponent) {
      params.set('vs', filters.vsOpponent);
    }
    if (String(filters.cardsVisibility || '').toLowerCase() === 'known') {
      params.set('cards', 'known');
    }
    if (filters.recentLimit && filters.recentLimit !== 'all') {
      params.set('recent', filters.recentLimit);
      params.set('limit', filters.recentLimit);
    }
    if (filters.manualOnly === true) {
      params.set('manual', '1');
    }
    if (force) params.set('force', '1');
    const response = await fetch(`/api/opponent-visual-profile?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Не удалось собрать визуализацию.');
    }
    profileCache.set(key, { status: 'ready', profile: data.profile, error: '' });
    if (!suppressRender && profileModalOpponent === name && profileModalSource === source) {
      renderProfileModalState(name, source);
    }
    return data.profile;
  } catch (error) {
    profileCache.set(key, { status: 'error', profile: null, error: error.message || 'Ошибка профиля.' });
    if (!suppressRender && profileModalOpponent === name && profileModalSource === source) {
      renderProfileModalState(name, source);
    }
    return null;
  }
}

async function prefetchOpponentProfileList(opponent, options = {}) {
  const name = String(opponent || '').trim();
  if (!name) return null;
  const source = normalizeProfileSource(options.source || PROFILE_DEFAULT_SOURCE);
  const filters = options.filters || profileFilters;
  const suppressRender = options.suppressRender === true;
  const key = profileListCacheKey(name, source, filters);
  const force = options.force === true;
  const current = profileListCache.get(key);
  if (!force && current && (current.status === 'loading' || current.status === 'ready')) {
    return current.payload || null;
  }

  profileListCache.set(key, { status: 'loading', payload: null, error: '' });
  if (!suppressRender && profileModalOpponent === name && profileModalSource === source) {
    renderProfileModalState(name, source);
  }

  try {
    const params = new URLSearchParams({ opponent: name, source });
    if (Array.isArray(filters.playerGroups) && filters.playerGroups.length) {
      params.set('players', filters.playerGroups.join(','));
    }
    if (filters.datePreset && filters.datePreset !== 'all') {
      params.set('date', filters.datePreset);
    }
    if (Array.isArray(filters.gameCards) && filters.gameCards.length) {
      params.set('games', filters.gameCards.join(','));
    }
    if (Array.isArray(filters.rooms) && filters.rooms.length) {
      params.set('rooms', filters.rooms.join(','));
    }
    if (Array.isArray(filters.potBuckets) && filters.potBuckets.length) {
      params.set('pots', filters.potBuckets.join(','));
    }
    if (Array.isArray(filters.limits) && filters.limits.length) {
      params.set('limits', filters.limits.join(','));
    }
    if (filters.vsOpponent) {
      params.set('vs', filters.vsOpponent);
    }
    if (String(filters.cardsVisibility || '').toLowerCase() === 'known') {
      params.set('cards', 'known');
    }
    if (filters.recentLimit && filters.recentLimit !== 'all') {
      params.set('recent', filters.recentLimit);
      params.set('limit', filters.recentLimit);
    }
    if (filters.manualOnly === true) {
      params.set('manual', '1');
    }

    const response = await fetch(`/api/opponent-visual-list?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Не удалось собрать список раздач.');
    }
    const payload = {
      opponent: name,
      list: Array.isArray(data.list) ? data.list : [],
      totalRows: Number(data.totalRows || 0),
      sources: Array.isArray(data.sources) ? data.sources : [],
      filters: data.filters || { options: { rooms: [] } }
    };
    profileListCache.set(key, { status: 'ready', payload, error: '' });
    if (!suppressRender && profileModalOpponent === name && profileModalSource === source) {
      renderProfileModalState(name, source);
    }
    return payload;
  } catch (error) {
    profileListCache.set(key, { status: 'error', payload: null, error: error.message || 'Ошибка списка.' });
    if (!suppressRender && profileModalOpponent === name && profileModalSource === source) {
      renderProfileModalState(name, source);
    }
    return null;
  }
}

function openProfileModal(opponent, options = {}) {
  if (!profileModalEl) return;
  const source = normalizeProfileSource(options.source || PROFILE_DEFAULT_SOURCE);
  hideProfileTooltip({ force: true });
  hhManualReportDrafts.clear();
  profileModalOpponent = opponent;
  profileModalSource = source;
  profileViewMode = 'chart';
  profileFilters = createDefaultProfileFilters();
  profileVsMeEnabled = false;
  profileFilterOptions = { rooms: [] };
  profileMirrorFilterOptions = { rooms: [] };
  profileMirrorVsHimEnabled = true;
  profileMirrorRequestId += 1;
  resetMirrorFilters();
  if (source !== 'hh') {
    profileMirrorFilters = createDefaultProfileFilters();
  }
  profileModalEl.classList.remove('hidden');
  profileModalEl.setAttribute('aria-hidden', 'false');
  renderProfileModalState(opponent, source);
  prefetchOpponentProfile(opponent, { force: true, source, filters: profileFilters });
}

function closeProfileModal() {
  if (!profileModalEl) return;
  if (isHhManualRecordingActive()) {
    hhManualRecorder.stop();
  }
  hhManualReportDrafts.clear();
  profileModalOpponent = '';
  profileModalSource = PROFILE_DEFAULT_SOURCE;
  profileViewMode = 'chart';
  profileVsMeEnabled = false;
  profileMirrorRequestId += 1;
  profileModalEl.classList.add('hidden');
  profileModalEl.setAttribute('aria-hidden', 'true');
  hideProfileTooltip({ force: true });
}

function cardElement(card, options = {}) {
  const board = options.board === true;
  const mini = options.mini === true;
  const span = document.createElement('span');
  span.className = `hv-card hv-suit-${card?.suit || 's'} ${board ? 'hv-card-board' : ''} ${mini ? 'hv-card-mini' : ''}`.trim();
  span.textContent = card?.rank || '?';
  return span;
}

function actionKind(label) {
  const token = String(label || '').trim().toUpperCase();
  if (token.startsWith('R')) return 'raise';
  if (token.startsWith('B')) return 'bet';
  if (token.startsWith('C')) return 'call';
  if (token.startsWith('X')) return 'check';
  if (token.startsWith('F')) return 'fold';
  return 'check';
}

function splitActionLabel(label) {
  const value = String(label || '').trim();
  const match = value.match(/^(.*?)(\s*\([^)]+\))$/);
  if (!match) return { main: value, detail: '' };
  return {
    main: match[1].trim(),
    detail: match[2].trim()
  };
}

function renderActionSequence(actions = [], options = {}) {
  const showPos = options.showPos === true;
  const showCards = options.showCards === true;
  const shownPlayers = options.shownPlayers instanceof Set ? options.shownPlayers : new Set();

  const wrap = document.createElement('span');
  wrap.className = 'hv-actions';

  actions.forEach((item) => {
    const actionWrap = document.createElement('span');
    actionWrap.className = 'hv-action-wrap';
    actionWrap.title = `${item?.pos || ''} ${item?.label || ''}`.trim();

    if (showPos && item?.pos) {
      const pos = document.createElement('span');
      pos.className = 'hv-pos';
      pos.textContent = item.pos;
      actionWrap.appendChild(pos);
    }

    const labelParts = splitActionLabel(item?.label || '');
    const action = document.createElement('span');
    action.className = `hv-action ${actionKind(labelParts.main)} ${item?.hero ? 'hero' : ''}`.trim();
    action.textContent = labelParts.main || '';
    actionWrap.appendChild(action);

    if (labelParts.detail) {
      const detail = document.createElement('span');
      detail.className = 'hv-action-detail';
      detail.textContent = labelParts.detail;
      actionWrap.appendChild(detail);
    }

    if (showCards && Array.isArray(item?.cards) && item.cards.length && !shownPlayers.has(item.player)) {
      const cardsWrap = document.createElement('span');
      cardsWrap.className = 'hv-actions';
      item.cards.forEach((card) => cardsWrap.appendChild(cardElement(card, { mini: true })));
      actionWrap.appendChild(cardsWrap);
      shownPlayers.add(item.player);
    }

    wrap.appendChild(actionWrap);
  });
  return wrap;
}

function streetDisplayCards(street, index) {
  const cards = Array.isArray(street?.board) ? street.board : [];
  if (index <= 0) return cards;
  return cards.length ? [cards[cards.length - 1]] : [];
}

function streetTagLabel(id) {
  if (id === 'flop') return 'F';
  if (id === 'turn') return 'T';
  if (id === 'river') return 'R';
  return '';
}

function renderHandVisual(visual) {
  if (!handVisualEl) return;
  handVisualEl.innerHTML = '';
  if (!visual) {
    handVisualEl.classList.add('hidden');
    return;
  }

  const line = document.createElement('div');
  line.className = 'hv-line';

  const metaWrap = document.createElement('span');
  metaWrap.className = 'hv-segment hv-meta';
  [visual?.meta?.game, visual?.meta?.limit, visual?.meta?.bb].filter(Boolean).forEach((token) => {
    const part = document.createElement('span');
    part.className = 'hv-meta-token';
    part.textContent = token;
    metaWrap.appendChild(part);
  });
  line.appendChild(metaWrap);

  if (Array.isArray(visual?.heroCards) && visual.heroCards.length) {
    const cardsWrap = document.createElement('span');
    cardsWrap.className = 'hv-segment';
    visual.heroCards.forEach((card) => cardsWrap.appendChild(cardElement(card)));
    line.appendChild(cardsWrap);
  }

  if (visual?.preflop) {
    const preWrap = document.createElement('span');
    preWrap.className = 'hv-segment';
    preWrap.appendChild(renderActionSequence(visual.preflop.actions || [], {
      showPos: false,
      showCards: true,
      shownPlayers: new Set()
    }));
    line.appendChild(preWrap);
  }

  (visual?.streets || []).forEach((street, index) => {
    const divider = document.createElement('span');
    divider.className = 'hv-divider';
    line.appendChild(divider);

    const segment = document.createElement('span');
    segment.className = 'hv-segment';

    const tag = document.createElement('span');
    tag.className = 'hv-pos';
    tag.textContent = streetTagLabel(street.id);
    segment.appendChild(tag);

    streetDisplayCards(street, index).forEach((card) => {
      segment.appendChild(cardElement(card, { board: true }));
    });

    if (Number.isFinite(street?.potBb)) {
      const pot = document.createElement('span');
      pot.className = 'hv-pot';
      pot.textContent = `(${Math.round(street.potBb)})`;
      segment.appendChild(pot);
    }

    segment.appendChild(renderActionSequence(street.actions || [], { showPos: false, showCards: false }));
    line.appendChild(segment);
  });

  handVisualEl.appendChild(line);
  handVisualEl.classList.remove('hidden');
}

async function previewHandHistoryVisual() {
  if (!handHistoryInput || !handHistoryInput.value.trim()) {
    setStatus('Вставь hand history.', 'error');
    return;
  }

  try {
    setStatus('Строю визуализацию руки...');
    const response = await fetch('/api/visualize-hand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opponent: activeOpponent || '',
        handHistory: handHistoryInput.value.trim()
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка визуализации HH.');
    }
    renderHandVisual(data.visual || null);
    setStatus('Визуализация руки готова.', 'ok');
  } catch (error) {
    setStatus(error.message || 'Ошибка визуализации HH.', 'error');
  }
}

function renderOpponentSuggestions(filter = '') {
  if (!opponentSuggestions) return;
  const filtered = mergedSuggestions(filter);
  opponentSuggestions.innerHTML = '';

  filtered.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    opponentSuggestions.appendChild(option);
  });
}

async function fetchOpponentSuggestionsFromSheets() {
  const requestId = ++suggestionsRequestId;
  try {
    const response = await fetch('/api/opponent-suggestions?limit=5000');
    const data = await response.json();
    if (requestId !== suggestionsRequestId) return;
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка поиска оппонентов.');
    }

    allOpponentIndex = [];
    mergeIntoOpponentIndex(Array.isArray(data.opponents) ? data.opponents : []);
    opponentIndexLoaded = true;
    renderOpponentSuggestions(opponentInput.value);
  } catch (error) {
    // Keep local fallback only.
    if (requestId !== suggestionsRequestId) return;
    opponentIndexLoaded = false;
    allOpponentIndex = [];
    renderOpponentSuggestions(opponentInput.value);
  }
}

function renderOpponents() {
  opponentList.innerHTML = '';
  opponents.forEach((name) => {
    const card = document.createElement('div');
    card.className = 'opponent-card';

    const removeButton = document.createElement('button');
    removeButton.className = 'remove-opponent-btn';
    removeButton.textContent = '×';
    removeButton.title = `Удалить ${name}`;
    removeButton.type = 'button';
    removeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      removeOpponent(name);
    });

    const recordButton = document.createElement('button');
    recordButton.className = 'opponent-btn';
    recordButton.textContent = name;
    if (name === activeOpponent) {
      recordButton.classList.add('active');
    }

    const openButton = document.createElement('button');
    openButton.className = 'open-btn';
    openButton.textContent = 'открыть';

    const profileButton = document.createElement('button');
    profileButton.className = 'profile-btn';
    profileButton.textContent = 'профиль';

    const profileDbButton = document.createElement('button');
    profileDbButton.className = 'profile-db-btn';
    profileDbButton.textContent = 'профиль DB';

    recordButton.addEventListener('click', () => handleOpponentClick(name));
    openButton.addEventListener('click', () => openOpponentInSheet(name));
    profileButton.addEventListener('click', () => openProfileModal(name, { source: 'voice' }));
    profileDbButton.addEventListener('click', () => openProfileModal(name, { source: 'hh' }));

    card.appendChild(removeButton);
    card.appendChild(recordButton);
    card.appendChild(openButton);
    card.appendChild(profileButton);
    card.appendChild(profileDbButton);
    opponentList.appendChild(card);

    // Build profile in background for active opponents to make popup instant.
    prefetchOpponentProfile(name);
  });
  renderOpponentSuggestions(opponentInput.value);
}

function renderHandHistoryOpponents() {
  if (!hhOpponentList) return;
  hhOpponentList.innerHTML = '';

  if (!opponents.length) {
    const empty = document.createElement('div');
    empty.className = 'hh-opponent-empty';
    empty.textContent = 'Нет активных оппонентов. Добавь никнейм выше.';
    hhOpponentList.appendChild(empty);
    return;
  }

  opponents.forEach((name) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hh-opponent-btn';
    btn.textContent = name;
    if (name === activeOpponent) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      if (isAnyRecordingActive() || isBatchProcessing) {
        setStatus('Сначала дождись завершения текущей операции.', 'error');
        return;
      }
      activeOpponent = name;
      updateRecordUI();
      prefetchOpponentProfile(name);
      setStatus(`Целевой оппонент для HH: ${name}`, 'ok');
    });
    hhOpponentList.appendChild(btn);
  });
}

function updateRecordUI() {
  activeOpponentEl.textContent = activeOpponent || '—';
  const isMainRecording = isMainRecordingActive();
  const isManualRecording = isHhManualRecordingActive();
  const isBusy = isMainRecording || isManualRecording || isBatchProcessing;
  if (isMainRecording) {
    recordStatusEl.textContent = currentRecordMode === 'field' ? `правка: ${currentEditField}` : 'запись…';
    recordHint.textContent = currentRecordMode === 'field'
      ? `передиктовка поля ${currentEditField}`
      : 'говори улицы и пресуппозицию';
    stopRecordBtn.disabled = false;
  } else if (isManualRecording) {
    recordStatusEl.textContent = 'запись HH поля...';
    recordHint.textContent = 'идет ручная голосовая правка раздачи';
    stopRecordBtn.disabled = true;
  } else if (isBatchProcessing) {
    recordStatusEl.textContent = 'обработка HH файлов...';
    recordHint.textContent = activeOpponent ? 'идет пакетная обработка' : 'нет выбранного оппа';
    stopRecordBtn.disabled = true;
  } else {
    recordStatusEl.textContent = 'ожидание';
    recordHint.textContent = activeOpponent ? 'готов к записи' : 'нет выбранного оппа';
    stopRecordBtn.disabled = true;
  }
  if (saveReportBtn) {
    saveReportBtn.disabled = !canSaveReport();
  }
  if (submitHandHistoryBtn) {
    const hasText = Boolean(handHistoryInput && handHistoryInput.value.trim());
    submitHandHistoryBtn.disabled = !hasText || isBusy;
  }
  if (previewHandHistoryBtn) {
    const hasText = Boolean(handHistoryInput && handHistoryInput.value.trim());
    previewHandHistoryBtn.disabled = !hasText || isBusy;
  }
  if (clearHandHistoryBtn) {
    const hasText = Boolean(handHistoryInput && handHistoryInput.value.trim());
    clearHandHistoryBtn.disabled = !hasText || isBusy;
  }
  if (submitHandHistoryFilesBtn) {
    const hasFiles = Boolean(handHistoryFilesInput && handHistoryFilesInput.files && handHistoryFilesInput.files.length);
    submitHandHistoryFilesBtn.disabled = !hasFiles || isBusy;
  }
  if (handHistoryFilesInput) {
    handHistoryFilesInput.disabled = isBusy;
  }
  renderOpponents();
  renderHandHistoryOpponents();
  renderParsed(lastParsed);
}

async function handleOpponentClick(name) {
  if (isAnyRecordingActive() || isBatchProcessing) {
    setStatus('Сначала дождись завершения текущей операции.', 'error');
    return;
  }
  activeOpponent = name;
  currentRecordMode = 'main';
  currentEditField = '';
  updateRecordUI();
  prefetchOpponentProfile(name);
  await startRecording('main');
}

function addOpponent() {
  const value = opponentInput.value.trim();
  if (!value) return;
  if (!opponents.includes(value)) {
    opponents.unshift(value);
    saveOpponents();
  }
  mergeIntoOpponentIndex([value]);
  opponentInput.value = '';
  renderOpponentSuggestions('');
  updateRecordUI();
}

function clearProfileCacheByOpponent(name) {
  const normalizedName = String(name || '').trim().toLowerCase();
  const normalizedIdentity = extractTargetIdentity(name);
  if (!normalizedName && !normalizedIdentity) return;
  const clearBySuffix = (cache) => {
    for (const key of cache.keys()) {
      const parts = String(key || '').split('::');
      const keyOpponent = String(parts[parts.length - 1] || '').trim();
      const keyNameLower = keyOpponent.toLowerCase();
      const keyIdentity = extractTargetIdentity(keyOpponent);
      const matchesName = normalizedName && keyNameLower === normalizedName;
      const matchesIdentity = normalizedIdentity && keyIdentity === normalizedIdentity;
      if (matchesName || matchesIdentity) {
        cache.delete(key);
      }
    }
  };
  clearBySuffix(profileCache);
  clearBySuffix(profileListCache);
}

function removeOpponent(name) {
  const next = opponents.filter((item) => item !== name);
  if (next.length === opponents.length) {
    return;
  }
  opponents = next;
  saveOpponents();
  clearProfileCacheByOpponent(name);

  if (activeOpponent === name) {
    resetCurrentSelection();
  }
  if (profileModalOpponent === name) {
    closeProfileModal();
  }

  setStatus(`Оппонент ${name} удален из активного списка.`, 'ok');
  updateRecordUI();
}

function clearActiveOpponents() {
  if (isAnyRecordingActive() || isBatchProcessing) {
    setStatus('Сначала дождись завершения текущей операции.', 'error');
    return;
  }

  opponents = [];
  saveOpponents();
  profileCache.clear();
  profileListCache.clear();
  resetCurrentSelection();
  closeProfileModal();
  setStatus('Активный список оппонентов очищен.', 'ok');
  updateRecordUI();
}

addOpponentBtn.addEventListener('click', addOpponent);
clearOpponentsBtn.addEventListener('click', clearActiveOpponents);
if (clearHhDbBtn) {
  clearHhDbBtn.addEventListener('click', clearAllHhHandsInDb);
}
if (saveReportBtn) {
  saveReportBtn.addEventListener('click', saveReport);
}
opponentInput.addEventListener('focus', () => {
  if (!opponentInput.value.trim()) {
    renderOpponentSuggestions('');
  }
});
opponentInput.addEventListener('input', () => {
  const query = opponentInput.value;
  renderOpponentSuggestions(query);
  if (!opponentIndexLoaded) {
    fetchOpponentSuggestionsFromSheets();
  }
});
opponentInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addOpponent();
  }
});

stopRecordBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
});
if (submitHandHistoryBtn) {
  submitHandHistoryBtn.addEventListener('click', submitHandHistory);
}
if (submitHandHistoryFilesBtn) {
  submitHandHistoryFilesBtn.addEventListener('click', submitHandHistoryFiles);
}
if (previewHandHistoryBtn) {
  previewHandHistoryBtn.addEventListener('click', previewHandHistoryVisual);
}
if (clearHandHistoryBtn) {
  clearHandHistoryBtn.addEventListener('click', () => {
    if (handHistoryInput) {
      handHistoryInput.value = '';
    }
    renderHandVisual(null);
    updateRecordUI();
  });
}
if (handHistoryInput) {
  handHistoryInput.addEventListener('input', () => {
    updateRecordUI();
  });
}
if (handHistoryFilesInput) {
  handHistoryFilesInput.addEventListener('change', () => {
    updateRecordUI();
  });
}
if (profileCloseBtn) {
  profileCloseBtn.addEventListener('click', closeProfileModal);
}
if (profileModalEl) {
  profileModalEl.addEventListener('click', (event) => {
    if (event.target === profileModalEl) {
      closeProfileModal();
    }
  });
  profileModalEl.addEventListener('mouseleave', hideProfileTooltip);
}
if (profileTooltipEl) {
  profileTooltipEl.addEventListener('dblclick', (event) => {
    if (event.button !== 0) return;
    hideProfileTooltip({ force: true });
    event.preventDefault();
    event.stopPropagation();
  });
}
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && profileModalEl && !profileModalEl.classList.contains('hidden')) {
    closeProfileModal();
  }
});
window.addEventListener('wheel', handleProfileTooltipWheel, { passive: false });

async function startRecording(mode = 'main', field = '') {
  if (!activeOpponent) return;
  currentRecordMode = mode;
  currentEditField = field;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      updateRecordUI();
      const modeToSend = currentRecordMode;
      const fieldToSend = currentEditField;
      currentRecordMode = 'main';
      currentEditField = '';
      await sendRecording(modeToSend, fieldToSend);
    };

    mediaRecorder.start();
    setStatus(mode === 'field' ? `Передиктовка поля ${field} запущена.` : 'Запись запущена.', 'ok');
    updateRecordUI();
  } catch (error) {
    setStatus('Не удалось получить доступ к микрофону.', 'error');
  }
}

async function sendRecording(mode = 'main', field = '') {
  if (!audioChunks.length) {
    setStatus('Нет аудио для отправки.', 'error');
    return;
  }

  const previousFieldValue = mode === 'field'
    ? String((lastParsed && typeof lastParsed === 'object' && lastParsed[field]) || '')
    : '';

  const blob = new Blob(audioChunks, { type: 'audio/webm' });
  const formData = new FormData();
  formData.append('audio', blob, 'recording.webm');
  formData.append('opponent', activeOpponent);
  if (mode === 'field') {
    formData.append('field', field);
    formData.append('row', String(lastSavedRow || ''));
    if (lastSavedSheetName) {
      formData.append('sheetName', lastSavedSheetName);
    }
  }

  setStatus(mode === 'field'
    ? `Транскрибирую правку поля ${field} и обновляю строку…`
    : 'Транскрибирую и отправляю в Sheets…');

  try {
    const endpoint = mode === 'field' ? '/api/record-field' : '/api/record';
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Ошибка записи.');
    }

    lastTranscript = data.transcript || '';
    transcriptEl.textContent = lastTranscript || '—';

    if (mode === 'field') {
      if (!lastParsed || typeof lastParsed !== 'object') {
        lastParsed = emptyParsedFields();
      }
      lastParsed[field] = data.value || '';
      lastSavedRow = data.row || lastSavedRow;
      lastSavedSheetName = data.sheetName || lastSavedSheetName;
      renderParsed(lastParsed);
      const parserSource = data?.parser?.source === 'semantic_llm' ? 'LLM' : 'rules';
      const parserModel = data?.parser?.model ? `/${data.parser.model}` : '';
      const confidence = typeof data?.parser?.confidence === 'number'
        ? ` conf=${data.parser.confidence.toFixed(2)}`
        : '';

      if (reportDraft) {
        reportDraft.row = lastSavedRow || reportDraft.row || null;
        reportDraft.sheetName = lastSavedSheetName || reportDraft.sheetName || null;
        reportDraft.edits.push({
          type: 'redictate',
          field,
          at: new Date().toISOString(),
          transcript: data.transcript || '',
          previousValue: previousFieldValue,
          newValue: data.value || '',
          parser: data.parser || null
        });
      }

      setStatus(
        `Поле ${field} обновлено в строке ${lastSavedRow}${lastSavedSheetName ? ` (${lastSavedSheetName})` : ''}. parser=${parserSource}${parserModel}${confidence}`,
        'ok'
      );
    } else {
      lastParsed = data.parsed || emptyParsedFields();
      lastSavedRow = data.row || null;
      lastSavedSheetName = data.sheetName || '';
      reportDraft = {
        sessionId: createSessionId(),
        source: 'poker-voice-web',
        createdAt: new Date().toISOString(),
        opponent: activeOpponent,
        row: lastSavedRow,
        sheetName: lastSavedSheetName || null,
        initialTranscript: data.transcript || '',
        parser: data.parser || null,
        initialParsed: cloneParsedFields(lastParsed),
        edits: []
      };
      renderParsed(lastParsed);
      const parserSource = data?.parser?.source === 'semantic_llm' ? 'LLM' : 'rules';
      const parserModel = data?.parser?.model ? `/${data.parser.model}` : '';
      const confidence = typeof data?.parser?.confidence === 'number'
        ? ` conf=${data.parser.confidence.toFixed(2)}`
        : '';
      setStatus(
        lastSavedRow
          ? `Запись сохранена в строку ${lastSavedRow}${lastSavedSheetName ? ` (${lastSavedSheetName})` : ''}. parser=${parserSource}${parserModel}${confidence}`
          : `Запись сохранена. parser=${parserSource}${parserModel}${confidence}`,
        'ok'
      );
    }
    updateRecordUI();
  } catch (error) {
    setStatus(error.message || 'Ошибка записи.', 'error');
  }
}

async function submitHandHistory() {
  if (!handHistoryInput || !handHistoryInput.value.trim()) {
    setStatus('Вставь hand history.', 'error');
    return;
  }
  if (isAnyRecordingActive() || isBatchProcessing) {
    setStatus('Сначала дождись завершения текущей операции.', 'error');
    return;
  }

  const handHistory = handHistoryInput.value.trim();
  const hhTarget = String(activeOpponent || '').trim();

  try {
    setStatus('Разбираю hand history и записываю в Sheets...');
    const response = await fetch('/api/record-hand-history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        opponent: hhTarget,
        handHistory
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка разбора hand history.');
    }

    lastTranscript = data.transcript || handHistory;
    transcriptEl.textContent = lastTranscript || '—';
    lastParsed = data.parsed || emptyParsedFields();
    lastSavedRow = data.row || null;
    lastSavedSheetName = data.sheetName || '';
    reportDraft = {
      sessionId: createSessionId(),
      source: 'poker-voice-web-hand-history',
      createdAt: new Date().toISOString(),
      opponent: hhTarget || 'HH',
      row: lastSavedRow,
      sheetName: lastSavedSheetName || null,
      initialTranscript: handHistory,
      parser: data.parser || null,
      initialParsed: cloneParsedFields(lastParsed),
      edits: []
    };

    renderParsed(lastParsed);
    const parserSource = data?.parser?.source === 'semantic_llm' ? 'LLM' : 'rules';
    const parserModel = data?.parser?.model ? `/${data.parser.model}` : '';
    const confidence = typeof data?.parser?.confidence === 'number'
      ? ` conf=${data.parser.confidence.toFixed(2)}`
      : '';
    setStatus(
      lastSavedRow
        ? `HH сохранена в строку ${lastSavedRow}${lastSavedSheetName ? ` (${lastSavedSheetName})` : ''}. parser=${parserSource}${parserModel}${confidence}`
        : `HH сохранена. parser=${parserSource}${parserModel}${confidence}`,
      'ok'
    );
    updateRecordUI();
  } catch (error) {
    setStatus(error.message || 'Ошибка разбора hand history.', 'error');
  }
}

async function submitHandHistoryFiles() {
  if (!handHistoryFilesInput || !handHistoryFilesInput.files || !handHistoryFilesInput.files.length) {
    setStatus('Выбери минимум один файл с hand history.', 'error');
    return;
  }
  if (isAnyRecordingActive() || isBatchProcessing) {
    setStatus('Сначала дождись завершения текущей операции.', 'error');
    return;
  }

  const files = Array.from(handHistoryFilesInput.files);
  const hhTarget = String(activeOpponent || '').trim();
  const formData = new FormData();
  formData.append('opponent', hhTarget);
  files.forEach((file) => formData.append('files', file, file.name));

  isBatchProcessing = true;
  updateRecordUI();
  try {
    setStatus(`Загружаю ${files.length} файлов HH и запускаю пакетный разбор...`);
    const response = await fetch('/api/record-hand-history-files', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Ошибка пакетного разбора файлов HH.');
    }

    if (data?.last?.parsed) {
      lastTranscript = data.last.transcript || '';
      transcriptEl.textContent = lastTranscript || '—';
      lastParsed = data.last.parsed || emptyParsedFields();
      lastSavedRow = data.last.row || null;
      lastSavedSheetName = data.last.sheetName || '';
      reportDraft = {
        sessionId: createSessionId(),
        source: 'poker-voice-web-hand-history-batch',
        createdAt: new Date().toISOString(),
        opponent: hhTarget || 'HH',
        row: lastSavedRow,
        sheetName: lastSavedSheetName || null,
        initialTranscript: '[batch upload]',
        parser: data.last.parser || null,
        initialParsed: cloneParsedFields(lastParsed),
        edits: []
      };
      renderParsed(lastParsed);
    }

    const total = Number(data.totalHands || 0);
    const saved = Number(data.savedHands || 0);
    const failed = Number(data.failedHands || 0);
    if (failed > 0) {
      const firstError = Array.isArray(data.errors) && data.errors.length
        ? ` Первая ошибка: ${data.errors[0].file || 'unknown'} #${data.errors[0].handIndex || '?'} — ${data.errors[0].error || 'ошибка'}`
        : '';
      setStatus(`Готово: сохранено ${saved}/${total}, ошибок ${failed}.${firstError}`, 'error');
    } else {
      setStatus(`Готово: сохранено ${saved}/${total} HH в ${data.sheetName || 'лист HH'}.`, 'ok');
    }
  } catch (error) {
    setStatus(error.message || 'Ошибка пакетного разбора файлов HH.', 'error');
  } finally {
    isBatchProcessing = false;
    updateRecordUI();
  }
}

async function openOpponentInSheet(opponent) {
  try {
    setStatus('Открываю строку оппонента в Google Sheets…');
    const response = await fetch(`/api/open-link?opponent=${encodeURIComponent(opponent)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Не удалось открыть таблицу.');
    }

    window.open(data.url, '_blank', 'noopener,noreferrer');
    setStatus(`Открыта строка ${data.row} для ${opponent}.`, 'ok');
  } catch (error) {
    setStatus(error.message || 'Ошибка открытия таблицы.', 'error');
  }
}

function renderParsed(parsed = {}) {
  parsedEl.innerHTML = '';
  PARSED_FIELDS.forEach((key) => {
    const row = document.createElement('div');
    row.className = 'parsed-row';

    const text = document.createElement('div');
    text.className = 'parsed-text';
    const label = document.createElement('div');
    label.className = 'parsed-label';
    label.innerHTML = `<strong>${key}</strong>`;

    const input = document.createElement('input');
    input.className = 'parsed-input';
    input.type = 'text';
    input.value = parsed[key] || '';
    input.placeholder = '—';
    input.disabled = !activeOpponent || !lastSavedRow || isAnyRecordingActive() || isBatchProcessing;
    input.addEventListener('input', () => {
      lastParsed[key] = input.value;
    });
    input.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        await saveFieldText(key, input.value);
      }
    });

    text.appendChild(label);
    text.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'parsed-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'field-edit-btn ghost';
    editBtn.textContent = 'передиктовать';
    editBtn.disabled = !activeOpponent || !lastSavedRow || isAnyRecordingActive() || isBatchProcessing;
    editBtn.addEventListener('click', () => redictateField(key));

    const saveBtn = document.createElement('button');
    saveBtn.className = 'field-save-btn ghost';
    saveBtn.textContent = 'сохранить';
    saveBtn.disabled = !activeOpponent || !lastSavedRow || isAnyRecordingActive() || isBatchProcessing;
    saveBtn.addEventListener('click', async () => saveFieldText(key, input.value));

    actions.appendChild(editBtn);
    actions.appendChild(saveBtn);
    row.appendChild(text);
    row.appendChild(actions);
    parsedEl.appendChild(row);
  });
}

async function saveFieldText(field, value) {
  if (!activeOpponent) {
    setStatus('Сначала выбери оппонента.', 'error');
    return;
  }
  if (!lastSavedRow) {
    setStatus('Нет сохраненной строки для правки. Сначала сделай обычную запись.', 'error');
    return;
  }
  if (isAnyRecordingActive() || isBatchProcessing) {
    setStatus('Сначала дождись завершения текущей операции.', 'error');
    return;
  }

  try {
    const previousValue = String((lastParsed && typeof lastParsed === 'object' && lastParsed[field]) || '');
    setStatus(`Сохраняю поле ${field}…`);
    const response = await fetch('/api/update-field-text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        opponent: activeOpponent,
        row: lastSavedRow,
        field,
        value,
        sheetName: lastSavedSheetName || undefined
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Не удалось сохранить поле.');
    }

    lastParsed[field] = data.value ?? value;
    lastSavedRow = data.row || lastSavedRow;
    lastSavedSheetName = data.sheetName || lastSavedSheetName;
    if (reportDraft) {
      reportDraft.row = lastSavedRow || reportDraft.row || null;
      reportDraft.sheetName = lastSavedSheetName || reportDraft.sheetName || null;
      reportDraft.edits.push({
        type: 'manual_edit',
        field,
        at: new Date().toISOString(),
        transcript: '',
        previousValue,
        newValue: lastParsed[field],
        parser: null
      });
    }
    renderParsed(lastParsed);
    updateRecordUI();
    setStatus(`Поле ${field} сохранено в строке ${lastSavedRow}${lastSavedSheetName ? ` (${lastSavedSheetName})` : ''}.`, 'ok');
  } catch (error) {
    setStatus(error.message || 'Ошибка сохранения поля.', 'error');
  }
}

async function redictateField(field) {
  if (!activeOpponent) {
    setStatus('Сначала выбери оппонента.', 'error');
    return;
  }
  if (!lastSavedRow) {
    setStatus('Нет сохраненной строки для правки. Сначала сделай обычную запись.', 'error');
    return;
  }
  if (isAnyRecordingActive() || isBatchProcessing) {
    setStatus('Сначала дождись завершения текущей операции.', 'error');
    return;
  }

  await startRecording('field', field);
}

async function saveReport() {
  if (!reportDraft) {
    setStatus('Сначала сделай запись раздачи, затем можно сохранить репорт.', 'error');
    return;
  }
  if (isAnyRecordingActive() || isBatchProcessing) {
    setStatus('Сначала дождись завершения текущей операции.', 'error');
    return;
  }

  const payload = {
    source: reportDraft.source || 'poker-voice-web',
    sessionId: reportDraft.sessionId || createSessionId(),
    createdAt: reportDraft.createdAt || new Date().toISOString(),
    savedAt: new Date().toISOString(),
    opponent: reportDraft.opponent || activeOpponent,
    row: lastSavedRow || reportDraft.row || null,
    sheetName: lastSavedSheetName || reportDraft.sheetName || null,
    initialTranscript: reportDraft.initialTranscript || '',
    finalTranscript: lastTranscript || '',
    parser: reportDraft.parser || null,
    initialParsed: cloneParsedFields(reportDraft.initialParsed || {}),
    finalParsed: cloneParsedFields(lastParsed),
    edits: Array.isArray(reportDraft.edits) ? reportDraft.edits : []
  };

  try {
    setStatus('Сохраняю репорт...');
    const response = await fetch('/api/save-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Не удалось сохранить репорт.');
    }

    setStatus(`Репорт сохранен (${data.id}). Файл: ${data.path}`, 'ok');
  } catch (error) {
    setStatus(error.message || 'Ошибка сохранения репорта.', 'error');
  }
}

renderOpponents();
updateRecordUI();
fetchOpponentSuggestionsFromSheets();
