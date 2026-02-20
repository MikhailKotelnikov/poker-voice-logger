const opponentInput = document.getElementById('opponent-name');
const opponentSuggestions = document.getElementById('opponent-suggestions');
const addOpponentBtn = document.getElementById('add-opponent');
const clearOpponentsBtn = document.getElementById('clear-opponents');
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
let isBatchProcessing = false;
const profileCache = new Map();

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
    && !(mediaRecorder && mediaRecorder.state === 'recording')
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
      parsed.cards = parsePackedCards(cardsWithTags[1]);
      parsed.handTags = cardsWithTags[2]
        .split('_')
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }
    if (!parsed.cards.length && isPackedCardsToken(token, 2)) {
      parsed.cards = parsePackedCards(token);
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

function extractTargetId(value) {
  const match = String(value || '').match(/\d{4,}/g);
  if (!match || !match.length) return '';
  return match[match.length - 1];
}

function extractTargetIdentity(value) {
  const id = extractTargetId(value);
  if (id) return id;
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
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

function renderTooltipSegmentLine(segments = []) {
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
    if (segment.allIn) {
      item.classList.add('pt-segment-allin');
    }

    if (segment.pot) {
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

    const action = buildTooltipAction(segment.action, segment.hero);
    if (action) {
      item.appendChild(action);
    }

    if (segment.cards.length) {
      item.appendChild(buildTooltipCards(segment.cards));
    }

    if (segment.handTags.length) {
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

    if (segment.board.length) {
      const on = document.createElement('span');
      on.className = 'pt-on';
      on.textContent = 'on';
      item.appendChild(on);
      item.appendChild(buildTooltipCards(segment.board, { board: true }));
    }

    if (segment.extras.length) {
      const extra = document.createElement('span');
      extra.className = 'pt-extra';
      extra.textContent = segment.extras.join(' ');
      item.appendChild(extra);
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

function handleProfileTooltipWheel(event) {
  if (!profileTooltipEl || profileTooltipEl.classList.contains('hidden')) return;
  if (!profileModalEl || !profileModalEl.contains(event.target)) return;
  if (profileTooltipEl.scrollHeight <= profileTooltipEl.clientHeight + 1) return;
  profileTooltipEl.scrollTop += event.deltaY;
  event.preventDefault();
}

function buildProfileTooltipContent(sampleInput) {
  const samples = normalizeTooltipSamples(sampleInput);
  const root = document.createElement('div');
  root.className = 'pt-wrap';

  samples.forEach((sampleText, sampleIndex) => {
    const parsed = parseTooltipSample(sampleText);
    const entry = document.createElement('div');
    entry.className = 'pt-entry';

    const head = document.createElement('div');
    head.className = 'pt-head';
    if (parsed.rowId) {
      const row = document.createElement('span');
      row.className = 'pt-rowid';
      row.textContent = parsed.rowId;
      head.appendChild(row);
    }
    if (parsed.focusStreet) {
      const street = document.createElement('span');
      street.className = 'pt-street';
      street.textContent = parsed.focusStreet;
      head.appendChild(street);
    }
    if (head.childNodes.length) {
      entry.appendChild(head);
    }

    const streets = Array.isArray(parsed.streets) ? parsed.streets : [];
    markHeroSegments(streets, extractTargetIdentity(profileModalOpponent));
    streets.forEach((street) => {
      const row = document.createElement('div');
      row.className = 'pt-street-row';

      const label = document.createElement('span');
      label.className = 'pt-street-label';
      label.textContent = street.name || '';
      row.appendChild(label);

      const raw = String(street.raw || '').trim();
      if (!raw) {
        const empty = document.createElement('span');
        empty.className = 'pt-empty';
        empty.textContent = '—';
        row.appendChild(empty);
      } else {
        const segments = street.segments?.length
          ? street.segments
          : [parseTooltipSegment(raw)];
        row.appendChild(renderTooltipSegmentLine(segments));
      }
      entry.appendChild(row);
    });

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
  profileTooltipEl.innerHTML = '';
  profileTooltipEl.appendChild(buildProfileTooltipContent(sampleInput));
  profileTooltipEl.scrollTop = 0;
  profileTooltipEl.classList.remove('hidden');
  profileTooltipEl.setAttribute('aria-hidden', 'false');
  moveProfileTooltip(event);
}

function hideProfileTooltip() {
  if (!profileTooltipEl) return;
  profileTooltipEl.classList.add('hidden');
  profileTooltipEl.setAttribute('aria-hidden', 'true');
}

function renderProfileRows(rows = [], legend = []) {
  const fragment = document.createDocumentFragment();
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

    if (row.total > 0) {
      const order = ['nuts', 'strong', 'strongDraw', 'weakDraw', 'weak', 'unknown'];
      order.forEach((key) => {
        const count = Number(row?.counts?.[key] || 0);
        if (!count) return;
        const width = (count / row.total) * 100;
        const segment = document.createElement('div');
        segment.className = 'profile-segment';
        segment.style.width = `${width}%`;
        segment.style.background = profileLegendColor(legend, key);
        const samples = Array.isArray(row?.samples?.[key]) ? row.samples[key] : [];
        const fallbackSamples = Array.isArray(row?.samples?.all) ? row.samples.all : [];
        const tooltipSamples = samples.length ? samples : fallbackSamples;
        if (tooltipSamples.length) {
          segment.addEventListener('mouseenter', (event) => showProfileTooltip(tooltipSamples, event));
          segment.addEventListener('mousemove', moveProfileTooltip);
          segment.addEventListener('mouseleave', hideProfileTooltip);
        }
        if (width >= 12) {
          segment.textContent = String(count);
        }
        bar.appendChild(segment);
      });
    }

    rowEl.appendChild(bucket);
    rowEl.appendChild(total);
    rowEl.appendChild(bar);
    fragment.appendChild(rowEl);
  });
  return fragment;
}

function renderProfileModal(profile) {
  if (!profileContentEl || !profileMetaEl || !profileTitleEl) return;
  profileContentEl.innerHTML = '';
  profileTitleEl.textContent = `Профиль: ${profile?.opponent || '—'}`;
  const sources = Array.isArray(profile?.sources) ? profile.sources : [];
  const sourceText = sources.length
    ? ` • источники: ${sources.map((item) => `${item.sheetName || 'active'}=${item.rows || 0}`).join(', ')}`
    : '';
  profileMetaEl.textContent = `строк: ${profile?.totalRows || 0} • проанализировано: ${profile?.analyzedRows || 0}${sourceText}`;

  const legend = document.createElement('div');
  legend.className = 'profile-legend';
  (profile?.legend || []).forEach((item) => {
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
  profileContentEl.appendChild(legend);

  const grid = document.createElement('div');
  grid.className = 'profile-grid';
  (profile?.sections || []).forEach((section) => {
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

      groupEl.appendChild(renderProfileRows(group.rows || [], profile.legend || []));
      sectionEl.appendChild(groupEl);
    });

    grid.appendChild(sectionEl);
  });

  profileContentEl.appendChild(grid);
}

function renderProfileModalState(opponent) {
  if (!profileContentEl || !profileMetaEl || !profileTitleEl) return;
  hideProfileTooltip();
  const entry = profileCache.get(opponent);
  profileTitleEl.textContent = `Профиль: ${opponent}`;

  if (!entry || entry.status === 'loading') {
    profileMetaEl.textContent = 'Подготовка профиля...';
    profileContentEl.textContent = 'Собираю строки оппонента из Google Sheets и считаю визуализацию.';
    return;
  }
  if (entry.status === 'error') {
    profileMetaEl.textContent = 'Ошибка';
    profileContentEl.textContent = entry.error || 'Не удалось построить профиль.';
    return;
  }
  renderProfileModal(entry.profile);
}

async function prefetchOpponentProfile(opponent, options = {}) {
  const name = String(opponent || '').trim();
  if (!name) return null;
  const force = options.force === true;
  const current = profileCache.get(name);
  if (!force && current && (current.status === 'loading' || current.status === 'ready')) {
    return current.profile || null;
  }

  profileCache.set(name, { status: 'loading', profile: null, error: '' });
  if (profileModalOpponent === name) {
    renderProfileModalState(name);
  }

  try {
    const response = await fetch(`/api/opponent-visual-profile?opponent=${encodeURIComponent(name)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Не удалось собрать визуализацию.');
    }
    profileCache.set(name, { status: 'ready', profile: data.profile, error: '' });
    if (profileModalOpponent === name) {
      renderProfileModalState(name);
    }
    return data.profile;
  } catch (error) {
    profileCache.set(name, { status: 'error', profile: null, error: error.message || 'Ошибка профиля.' });
    if (profileModalOpponent === name) {
      renderProfileModalState(name);
    }
    return null;
  }
}

function openProfileModal(opponent) {
  if (!profileModalEl) return;
  profileModalOpponent = opponent;
  profileModalEl.classList.remove('hidden');
  profileModalEl.setAttribute('aria-hidden', 'false');
  renderProfileModalState(opponent);
  prefetchOpponentProfile(opponent, { force: true });
}

function closeProfileModal() {
  if (!profileModalEl) return;
  profileModalOpponent = '';
  profileModalEl.classList.add('hidden');
  profileModalEl.setAttribute('aria-hidden', 'true');
  hideProfileTooltip();
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

    recordButton.addEventListener('click', () => handleOpponentClick(name));
    openButton.addEventListener('click', () => openOpponentInSheet(name));
    profileButton.addEventListener('click', () => openProfileModal(name));

    card.appendChild(removeButton);
    card.appendChild(recordButton);
    card.appendChild(openButton);
    card.appendChild(profileButton);
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
      if ((mediaRecorder && mediaRecorder.state === 'recording') || isBatchProcessing) {
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
  const isRecording = Boolean(mediaRecorder && mediaRecorder.state === 'recording');
  const isBusy = isRecording || isBatchProcessing;
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    recordStatusEl.textContent = currentRecordMode === 'field' ? `правка: ${currentEditField}` : 'запись…';
    recordHint.textContent = currentRecordMode === 'field'
      ? `передиктовка поля ${currentEditField}`
      : 'говори улицы и пресуппозицию';
    stopRecordBtn.disabled = false;
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
  if ((mediaRecorder && mediaRecorder.state === 'recording') || isBatchProcessing) {
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

function removeOpponent(name) {
  const next = opponents.filter((item) => item !== name);
  if (next.length === opponents.length) {
    return;
  }
  opponents = next;
  saveOpponents();
  profileCache.delete(name);

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
  if ((mediaRecorder && mediaRecorder.state === 'recording') || isBatchProcessing) {
    setStatus('Сначала дождись завершения текущей операции.', 'error');
    return;
  }

  opponents = [];
  saveOpponents();
  profileCache.clear();
  resetCurrentSelection();
  closeProfileModal();
  setStatus('Активный список оппонентов очищен.', 'ok');
  updateRecordUI();
}

addOpponentBtn.addEventListener('click', addOpponent);
clearOpponentsBtn.addEventListener('click', clearActiveOpponents);
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
  if ((mediaRecorder && mediaRecorder.state === 'recording') || isBatchProcessing) {
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
  if ((mediaRecorder && mediaRecorder.state === 'recording') || isBatchProcessing) {
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
    input.disabled = !activeOpponent || !lastSavedRow || (mediaRecorder && mediaRecorder.state === 'recording') || isBatchProcessing;
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
    editBtn.disabled = !activeOpponent || !lastSavedRow || (mediaRecorder && mediaRecorder.state === 'recording') || isBatchProcessing;
    editBtn.addEventListener('click', () => redictateField(key));

    const saveBtn = document.createElement('button');
    saveBtn.className = 'field-save-btn ghost';
    saveBtn.textContent = 'сохранить';
    saveBtn.disabled = !activeOpponent || !lastSavedRow || (mediaRecorder && mediaRecorder.state === 'recording') || isBatchProcessing;
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
  if ((mediaRecorder && mediaRecorder.state === 'recording') || isBatchProcessing) {
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
  if ((mediaRecorder && mediaRecorder.state === 'recording') || isBatchProcessing) {
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
  if ((mediaRecorder && mediaRecorder.state === 'recording') || isBatchProcessing) {
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
