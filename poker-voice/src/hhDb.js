import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { extractTargetIdentity } from './profileTarget.js';

const MODE_SHEETS = 'sheets';
const MODE_DB = 'db';
const MODE_DUAL = 'dual';
const HH_MANUAL_FIELD_KEYS = new Set(['preflop', 'flop', 'turn', 'river', 'hand_presupposition']);
const HH_PROFILE_ROWS_DEFAULT = Math.max(
  1000,
  Number(process.env.HH_PROFILE_ROWS_DEFAULT || '50000') || 50000
);
const HH_PROFILE_ROWS_MAX = Math.max(
  HH_PROFILE_ROWS_DEFAULT,
  Number(process.env.HH_PROFILE_ROWS_MAX || '500000') || 500000
);

let cachedPath = '';
let cachedDb = null;

function normalizeManualField(value) {
  const key = String(value || '').trim().toLowerCase();
  return HH_MANUAL_FIELD_KEYS.has(key) ? key : '';
}

function sanitizeManualText(value, limit = 2000) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, limit);
}

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hh_import_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('single','batch','reimport','backfill')),
  file_count INTEGER NOT NULL DEFAULT 0,
  hand_count INTEGER NOT NULL DEFAULT 0,
  saved_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS hh_hands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES hh_import_runs(id) ON DELETE CASCADE,
  room TEXT,
  hand_number TEXT NOT NULL,
  table_name TEXT,
  game_type TEXT,
  game_card_count INTEGER,
  sb REAL,
  bb REAL NOT NULL,
  limit_text TEXT,
  ante REAL NOT NULL DEFAULT 0,
  straddle_total REAL NOT NULL DEFAULT 0,
  active_players_count INTEGER NOT NULL DEFAULT 0,
  final_pot_bb REAL NOT NULL DEFAULT 0,
  played_at_utc TEXT,
  raw_text TEXT NOT NULL,
  raw_hash TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(room, hand_number, parser_version),
  UNIQUE(raw_hash, parser_version)
);

CREATE TABLE IF NOT EXISTS hh_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_key TEXT NOT NULL UNIQUE,
  player_id_numeric TEXT,
  display_name TEXT,
  first_seen_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hh_hand_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hand_id INTEGER NOT NULL REFERENCES hh_hands(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES hh_players(id) ON DELETE CASCADE,
  seat_no INTEGER,
  position TEXT,
  stack_start REAL,
  is_target_candidate INTEGER NOT NULL DEFAULT 0 CHECK (is_target_candidate IN (0,1)),
  showdown_cards TEXT,
  showdown_result TEXT,
  UNIQUE(hand_id, player_id)
);

CREATE TABLE IF NOT EXISTS hh_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hand_id INTEGER NOT NULL REFERENCES hh_hands(id) ON DELETE CASCADE,
  street TEXT NOT NULL CHECK (street IN ('preflop','flop','turn','river')),
  seq INTEGER NOT NULL,
  actor_player_id INTEGER REFERENCES hh_players(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  size_bb REAL,
  size_pct_pot REAL,
  is_allin INTEGER NOT NULL DEFAULT 0 CHECK (is_allin IN (0,1)),
  pot_before_bb REAL,
  pot_after_bb REAL,
  board_cards TEXT,
  extra_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS hh_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hand_id INTEGER NOT NULL REFERENCES hh_hands(id) ON DELETE CASCADE,
  target_player_id INTEGER REFERENCES hh_players(id) ON DELETE SET NULL,
  target_identity TEXT NOT NULL,
  opponent_label TEXT NOT NULL DEFAULT 'HH',
  preflop TEXT NOT NULL DEFAULT '',
  flop TEXT NOT NULL DEFAULT '',
  turn TEXT NOT NULL DEFAULT '',
  river TEXT NOT NULL DEFAULT '',
  presupposition TEXT NOT NULL DEFAULT '',
  hands_line TEXT NOT NULL DEFAULT '',
  street_tags_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'hh' CHECK (source IN ('hh')),
  parser_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(hand_id, target_identity, parser_version)
);

CREATE TABLE IF NOT EXISTS hh_manual_presupp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_identity TEXT NOT NULL,
  room TEXT NOT NULL DEFAULT '',
  hand_number TEXT NOT NULL,
  preflop TEXT NOT NULL DEFAULT '',
  flop TEXT NOT NULL DEFAULT '',
  turn TEXT NOT NULL DEFAULT '',
  river TEXT NOT NULL DEFAULT '',
  hand_presupposition TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(target_identity, room, hand_number)
);

CREATE TABLE IF NOT EXISTS hh_profile_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_identity TEXT NOT NULL,
  source_scope TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  UNIQUE(target_identity, source_scope, parser_version)
);

CREATE INDEX IF NOT EXISTS idx_hh_notes_target_identity ON hh_notes(target_identity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hh_notes_target_player ON hh_notes(target_player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hh_manual_presupp_target ON hh_manual_presupp(target_identity, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_hh_events_hand_street_seq ON hh_events(hand_id, street, seq);
CREATE INDEX IF NOT EXISTS idx_hh_hand_players_hand_pos ON hh_hand_players(hand_id, position);
CREATE INDEX IF NOT EXISTS idx_hh_hands_played_at ON hh_hands(played_at_utc DESC);
`;

function normalizeStorageMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if ([MODE_SHEETS, MODE_DB, MODE_DUAL].includes(mode)) return mode;
  return MODE_SHEETS;
}

export function resolveHhStorageMode(value) {
  return normalizeStorageMode(value);
}

export function hhStorageUsesDb(mode) {
  const resolved = normalizeStorageMode(mode);
  return resolved === MODE_DB || resolved === MODE_DUAL;
}

export function hhStorageUsesSheets(mode) {
  const resolved = normalizeStorageMode(mode);
  return resolved === MODE_SHEETS || resolved === MODE_DUAL;
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function openDb(dbPath) {
  const resolvedPath = path.resolve(String(dbPath || '').trim());
  if (!resolvedPath) {
    throw new Error('HH_DB_PATH не задан.');
  }

  if (cachedDb && cachedPath === resolvedPath) return cachedDb;

  ensureDir(resolvedPath);
  const db = new DatabaseSync(resolvedPath);
  db.exec(SCHEMA_SQL);
  applySchemaMigrations(db);

  cachedDb = db;
  cachedPath = resolvedPath;
  return db;
}

export function initHhDb(dbPath) {
  openDb(dbPath);
}

function hasTableColumn(db, tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => String(row?.name || '') === String(columnName || ''));
}

function applySchemaMigrations(db) {
  const hhHandsColumns = [
    ['game_card_count', 'ALTER TABLE hh_hands ADD COLUMN game_card_count INTEGER'],
    ['limit_text', 'ALTER TABLE hh_hands ADD COLUMN limit_text TEXT'],
    ['active_players_count', 'ALTER TABLE hh_hands ADD COLUMN active_players_count INTEGER NOT NULL DEFAULT 0'],
    ['final_pot_bb', 'ALTER TABLE hh_hands ADD COLUMN final_pot_bb REAL NOT NULL DEFAULT 0'],
    ['played_at_utc', 'ALTER TABLE hh_hands ADD COLUMN played_at_utc TEXT'],
    ['room', 'ALTER TABLE hh_hands ADD COLUMN room TEXT']
  ];

  for (const [columnName, alterSql] of hhHandsColumns) {
    if (hasTableColumn(db, 'hh_hands', columnName)) continue;
    db.exec(alterSql);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS hh_manual_presupp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_identity TEXT NOT NULL,
      room TEXT NOT NULL DEFAULT '',
      hand_number TEXT NOT NULL,
      preflop TEXT NOT NULL DEFAULT '',
      flop TEXT NOT NULL DEFAULT '',
      turn TEXT NOT NULL DEFAULT '',
      river TEXT NOT NULL DEFAULT '',
      hand_presupposition TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(target_identity, room, hand_number)
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_hh_hands_played_at ON hh_hands(played_at_utc DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_hh_manual_presupp_target ON hh_manual_presupp(target_identity, updated_at DESC)');
}

function parseMoneyValue(raw) {
  const source = String(raw || '').trim();
  if (!source) return null;
  let value = source.replace(/[^0-9.,-]/g, '');
  if (!value) return null;

  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');

  if (lastDot >= 0 && lastComma >= 0) {
    if (lastDot > lastComma) {
      value = value.replace(/,/g, '');
    } else {
      value = value.replace(/\./g, '').replace(/,/g, '.');
    }
  } else if (lastComma >= 0) {
    const decimalComma = value.length - lastComma - 1;
    if (decimalComma > 0 && decimalComma <= 2) {
      value = value.replace(/,/g, '.');
    } else {
      value = value.replace(/,/g, '');
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatUtcIso(rawUtc) {
  const source = String(rawUtc || '').trim();
  if (!source) return null;
  const match = source.match(/(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}Z`;
}

function parseHeaderMeta(text) {
  const headerLine = String(text || '')
    .split(/\r?\n/)
    .find((line) => /Hand #/i.test(line) && /Card\s+Omaha/i.test(line));
  if (!headerLine) {
    return {
      gameType: null,
      gameCardCount: null,
      limitText: null,
      playedAtUtc: null
    };
  }

  const gameLabel = String(headerLine.match(/Hand\s+#\d+:\s+(.+?)\s+\([^)]+\)\s*-\s*/i)?.[1] || '').trim();
  const gameCardCountRaw = Number(headerLine.match(/(\d+)\s*Card\s+Omaha/i)?.[1]);
  const gameCardCount = Number.isFinite(gameCardCountRaw) ? gameCardCountRaw : null;
  const limitText = String(headerLine.match(/\(([^)]*)\)/)?.[1] || '').trim() || null;
  const playedAtUtc = formatUtcIso(String(headerLine.match(/-\s+(.+)$/)?.[1] || ''));

  let gameType = null;
  if (gameCardCount && /omaha/i.test(gameLabel)) {
    gameType = `PLO${gameCardCount}`;
  } else if (gameLabel) {
    gameType = gameLabel;
  }

  return { gameType, gameCardCount, limitText, playedAtUtc };
}

function deriveGameCardCountFromGameType(gameTypeRaw) {
  const gameType = String(gameTypeRaw || '').trim();
  if (!gameType) return null;
  const match = gameType.match(/(?:^|[^A-Z0-9])PLO\s*([0-9]+)/i);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function deriveRoomFromTableName(tableName) {
  const value = String(tableName || '').trim();
  if (!value) return null;
  const firstToken = value.split(/\s+/)[0] || '';
  const prefix = String(firstToken.match(/^([A-Za-z0-9]+(?:_[A-Za-z0-9]+)?)/)?.[1] || '').trim();
  return prefix || null;
}

function countActivePlayers(parsedHH) {
  const unique = new Set();
  for (const street of ['preflop', 'flop', 'turn', 'river']) {
    const events = Array.isArray(parsedHH?.events?.[street]) ? parsedHH.events[street] : [];
    for (const event of events) {
      const type = String(event?.type || '').trim().toLowerCase();
      if (!event?.player) continue;
      if (['ante', 'small_blind', 'big_blind', 'straddle', 'show', 'uncalled_return', 'other'].includes(type)) continue;
      unique.add(String(event.player));
    }
  }
  if (unique.size > 0) return unique.size;
  const fallbackPlayers = Array.isArray(parsedHH?.players) ? parsedHH.players.filter(Boolean) : [];
  return fallbackPlayers.length;
}

function extractFinalPotBb(handHistory, parsedHH) {
  const bb = Number(parsedHH?.blinds?.bigBlind || 0);
  if (!Number.isFinite(bb) || bb <= 0) return 0;

  const summaryLine = String(handHistory || '')
    .split(/\r?\n/)
    .find((line) => /^Total pot\b/i.test(String(line || '').trim()));
  const totalPot = parseMoneyValue(String(summaryLine || '').match(/^Total pot\s+([^|]+)/i)?.[1] || '');
  if (Number.isFinite(totalPot) && totalPot >= 0) {
    return Math.round((totalPot / bb) * 100) / 100;
  }

  let maxPot = 0;
  for (const street of ['preflop', 'flop', 'turn', 'river']) {
    const events = Array.isArray(parsedHH?.events?.[street]) ? parsedHH.events[street] : [];
    for (const event of events) {
      const potAfter = Number(event?.potAfter);
      if (Number.isFinite(potAfter) && potAfter > maxPot) {
        maxPot = potAfter;
      }
    }
  }
  if (!Number.isFinite(maxPot) || maxPot <= 0) return 0;
  return Math.round((maxPot / bb) * 100) / 100;
}

function parseHandMeta(handHistory, parsedHH) {
  const text = String(handHistory || '');
  const handNumber = String(text.match(/PokerStars Hand #(\d+)/i)?.[1] || '').trim();
  const tableName = String(text.match(/Table\s+'([^']+)'/i)?.[1] || '').trim();
  const metaJsonRaw = String(text.match(/^#\s+(\{.*\})$/m)?.[1] || '').trim();
  const headerMeta = parseHeaderMeta(text);
  let meta = {};
  if (metaJsonRaw) {
    try {
      meta = JSON.parse(metaJsonRaw);
    } catch {
      meta = {};
    }
  }

  const resolvedGameType = String(meta.gt || '').trim() || headerMeta.gameType || null;
  const resolvedGameCardCount = Number.isFinite(parsedHH?.gameCardCount)
    ? Number(parsedHH.gameCardCount)
    : (Number.isFinite(headerMeta.gameCardCount)
        ? Number(headerMeta.gameCardCount)
        : deriveGameCardCountFromGameType(resolvedGameType));

  return {
    handNumber: handNumber || '',
    tableName,
    playedAtUtc: headerMeta.playedAtUtc || null,
    room: String(meta.room || '').trim() || deriveRoomFromTableName(tableName) || null,
    gameType: resolvedGameType,
    gameCardCount: resolvedGameCardCount,
    limitText: headerMeta.limitText || null
  };
}

function hashHand(handHistory) {
  return crypto.createHash('sha256').update(String(handHistory || '')).digest('hex');
}

function withTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function toNumericId(value) {
  const text = String(value || '').trim();
  return /^\d+$/.test(text) ? text : null;
}

function ensurePlayer(db, playerRaw, nowIso) {
  const displayName = String(playerRaw || '').trim();
  if (!displayName) return null;
  const playerKey = extractTargetIdentity(displayName) || displayName.toLowerCase();
  const numericId = toNumericId(displayName);

  db.prepare(`
    INSERT INTO hh_players (player_key, player_id_numeric, display_name, first_seen_at, last_seen_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_key) DO UPDATE SET
      player_id_numeric=COALESCE(excluded.player_id_numeric, hh_players.player_id_numeric),
      display_name=COALESCE(excluded.display_name, hh_players.display_name),
      last_seen_at=excluded.last_seen_at,
      updated_at=excluded.updated_at
  `).run(playerKey, numericId, displayName, nowIso, nowIso, nowIso);

  return db.prepare('SELECT id, player_key FROM hh_players WHERE player_key = ?').get(playerKey);
}

function amountToBb(value, bb) {
  if (!Number.isFinite(value) || !Number.isFinite(bb) || bb <= 0) return null;
  return Math.round((value / bb) * 100) / 100;
}

function boardForStreet(board, street) {
  const flop = Array.isArray(board?.flop) ? board.flop : [];
  if (street === 'flop') return flop;
  if (street === 'turn') return board?.turn ? [...flop, board.turn] : flop;
  if (street === 'river') {
    const turn = board?.turn ? [...flop, board.turn] : flop;
    return board?.river ? [...turn, board.river] : turn;
  }
  return [];
}

export function beginHhImportRun(dbPath, { sourceType = 'single', fileCount = 0 } = {}) {
  const db = openDb(dbPath);
  const safeSourceType = ['single', 'batch', 'reimport', 'backfill'].includes(sourceType) ? sourceType : 'single';
  const info = db.prepare(`
    INSERT INTO hh_import_runs (source_type, file_count)
    VALUES (?, ?)
  `).run(safeSourceType, Number.isFinite(fileCount) ? fileCount : 0);
  return Number(info.lastInsertRowid || 0);
}

export function finishHhImportRun(dbPath, runId, { handCount = 0, savedCount = 0, failedCount = 0, errors = [] } = {}) {
  if (!runId) return;
  const db = openDb(dbPath);
  db.prepare(`
    UPDATE hh_import_runs
    SET finished_at=datetime('now'),
        hand_count=?,
        saved_count=?,
        failed_count=?,
        errors_json=?
    WHERE id=?
  `).run(
    Number.isFinite(handCount) ? handCount : 0,
    Number.isFinite(savedCount) ? savedCount : 0,
    Number.isFinite(failedCount) ? failedCount : 0,
    JSON.stringify(Array.isArray(errors) ? errors : []),
    runId
  );
}

export function saveHhParsedRecord(dbPath, {
  runId,
  handHistory,
  parsedHH,
  parsed,
  parserVersion = 'unknown',
  targetIdentity = '',
  targetPlayer = ''
} = {}) {
  const db = openDb(dbPath);
  const nowIso = new Date().toISOString();
  const text = String(handHistory || '').trim();
  if (!text) throw new Error('Пустая hand history для записи в БД.');
  if (!runId) throw new Error('runId обязателен для записи hand history в БД.');

  const rawHash = hashHand(text);
  const meta = parseHandMeta(text, parsedHH);
  const handNumber = String(meta.handNumber || '').trim() || `legacy_${rawHash.slice(0, 16)}`;
  const bb = Number(parsedHH?.blinds?.bigBlind || 0);
  const sb = Number(parsedHH?.blinds?.smallBlind || 0);
  const activePlayersCount = countActivePlayers(parsedHH);
  const finalPotBb = extractFinalPotBb(text, parsedHH);
  const ante = Number((parsedHH?.events?.preflop || [])
    .filter((event) => event.type === 'ante' && Number.isFinite(event.amount))
    .reduce((sum, event) => sum + event.amount, 0));
  const straddleTotal = Number((parsedHH?.events?.preflop || [])
    .filter((event) => event.type === 'straddle' && Number.isFinite(event.amount))
    .reduce((sum, event) => sum + event.amount, 0));

  return withTransaction(db, () => {
    let handRow = db.prepare('SELECT id, raw_hash FROM hh_hands WHERE raw_hash = ? AND parser_version = ?').get(rawHash, parserVersion);
    if (!handRow && handNumber) {
      handRow = db.prepare(`
        SELECT id, raw_hash
        FROM hh_hands
        WHERE parser_version = ?
          AND hand_number = ?
        ORDER BY id DESC
        LIMIT 1
      `).get(parserVersion, handNumber);
    }

    let insertedHand = false;
    if (!handRow) {
      const handInsert = db.prepare(`
        INSERT INTO hh_hands (
          run_id, room, hand_number, table_name, game_type, game_card_count, sb, bb, limit_text, ante, straddle_total,
          active_players_count, final_pot_bb, played_at_utc, raw_text, raw_hash, parser_version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        runId,
        meta.room,
        handNumber,
        meta.tableName || null,
        meta.gameType || null,
        Number.isFinite(meta.gameCardCount) ? Number(meta.gameCardCount) : null,
        Number.isFinite(sb) ? sb : null,
        Number.isFinite(bb) ? bb : 0,
        meta.limitText || null,
        Number.isFinite(ante) ? ante : 0,
        Number.isFinite(straddleTotal) ? straddleTotal : 0,
        Number.isFinite(activePlayersCount) ? activePlayersCount : 0,
        Number.isFinite(finalPotBb) ? finalPotBb : 0,
        meta.playedAtUtc,
        text,
        rawHash,
        parserVersion
      );
      insertedHand = Number(handInsert?.changes || 0) > 0;

      handRow = db.prepare('SELECT id, raw_hash FROM hh_hands WHERE raw_hash = ? AND parser_version = ?').get(rawHash, parserVersion);
      if (!handRow && handNumber) {
        handRow = db.prepare(`
          SELECT id, raw_hash
          FROM hh_hands
          WHERE parser_version = ?
            AND hand_number = ?
          ORDER BY id DESC
          LIMIT 1
        `).get(parserVersion, handNumber);
      }
    }
    const handId = Number(handRow?.id || 0);
    if (!handId) throw new Error('Не удалось получить hand_id после записи в БД.');

    const playerIdByName = new Map();
    const players = Array.isArray(parsedHH?.players) ? parsedHH.players : [];
    for (const playerRaw of players) {
      const player = ensurePlayer(db, playerRaw, nowIso);
      if (player?.id) {
        playerIdByName.set(String(playerRaw), Number(player.id));
      }
    }

    for (const playerRaw of players) {
      const playerId = playerIdByName.get(String(playerRaw));
      if (!playerId) continue;
      const showdownCards = parsedHH?.showdown?.showCardsByPlayer?.[playerRaw] || [];
      const position = String(parsedHH?.positionsByPlayer?.[playerRaw] || '').toUpperCase() || null;
      db.prepare(`
        INSERT INTO hh_hand_players (hand_id, player_id, seat_no, position, stack_start, is_target_candidate, showdown_cards, showdown_result)
        VALUES (?, ?, NULL, ?, NULL, ?, ?, NULL)
        ON CONFLICT(hand_id, player_id) DO UPDATE SET
          position=excluded.position,
          is_target_candidate=excluded.is_target_candidate,
          showdown_cards=excluded.showdown_cards
      `).run(
        handId,
        playerId,
        position,
        String(playerRaw) === String(parsedHH?.targetPlayer || '') ? 1 : 0,
        Array.isArray(showdownCards) && showdownCards.length ? showdownCards.join(' ') : null
      );
    }

    for (const street of ['preflop', 'flop', 'turn', 'river']) {
      const events = Array.isArray(parsedHH?.events?.[street]) ? parsedHH.events[street] : [];
      events.forEach((event, idx) => {
        const actorId = event?.player ? playerIdByName.get(String(event.player)) : null;
        const boardCards = boardForStreet(parsedHH?.board || {}, street).join('');
        const potBeforeBb = amountToBb(Number(event?.potBefore), bb);
        const potAfterBb = amountToBb(Number(event?.potAfter), bb);
        const sizeBb = Number.isFinite(event?.amountBb)
          ? event.amountBb
          : amountToBb(Number(event?.amount), bb);
        const sizePctPot = Number.isFinite(event?.pctPot) ? event.pctPot : null;
        const isAllIn = event?.allIn ? 1 : 0;
        db.prepare(`
          INSERT INTO hh_events (hand_id, street, seq, actor_player_id, action, size_bb, size_pct_pot, is_allin, pot_before_bb, pot_after_bb, board_cards, extra_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          handId,
          street,
          idx + 1,
          actorId || null,
          String(event?.type || 'other'),
          Number.isFinite(sizeBb) ? sizeBb : null,
          Number.isFinite(sizePctPot) ? sizePctPot : null,
          isAllIn,
          Number.isFinite(potBeforeBb) ? potBeforeBb : null,
          Number.isFinite(potAfterBb) ? potAfterBb : null,
          boardCards || null,
          JSON.stringify({
            raw: String(event?.raw || ''),
            toAmountBb: Number.isFinite(event?.toAmountBb) ? event.toAmountBb : null
          })
        );
      });
    }

    const resolvedTargetIdentity = String(targetIdentity || extractTargetIdentity(targetPlayer || '') || 'unknown').trim().toLowerCase();
    const targetPlayerId = targetPlayer ? (playerIdByName.get(String(targetPlayer)) || null) : null;

    db.prepare(`
      INSERT INTO hh_notes (hand_id, target_player_id, target_identity, opponent_label, preflop, flop, turn, river, presupposition, hands_line, street_tags_json, source, parser_version, updated_at)
      VALUES (?, ?, ?, 'HH', ?, ?, ?, ?, ?, '', '{}', 'hh', ?, ?)
      ON CONFLICT(hand_id, target_identity, parser_version) DO UPDATE SET
        target_player_id=excluded.target_player_id,
        preflop=excluded.preflop,
        flop=excluded.flop,
        turn=excluded.turn,
        river=excluded.river,
        presupposition=excluded.presupposition,
        updated_at=excluded.updated_at
    `).run(
      handId,
      targetPlayerId,
      resolvedTargetIdentity,
      String(parsed?.preflop || ''),
      String(parsed?.flop || ''),
      String(parsed?.turn || ''),
      String(parsed?.river || ''),
      String(parsed?.presupposition || ''),
      parserVersion,
      nowIso
    );

    const noteRow = db.prepare(`
      SELECT id FROM hh_notes
      WHERE hand_id = ? AND target_identity = ? AND parser_version = ?
    `).get(handId, resolvedTargetIdentity, parserVersion);

    return {
      noteId: Number(noteRow?.id || 0),
      handId,
      insertedHand,
      targetIdentity: resolvedTargetIdentity
    };
  });
}

export function getHhNotesForProfile(dbPath, { opponent, limit = HH_PROFILE_ROWS_DEFAULT } = {}) {
  return getHhProfileRows(dbPath, { opponent, limit }).rows;
}

export function getHhNoteMetaById(dbPath, { noteId, opponent = '', targetIdentity = '' } = {}) {
  const db = openDb(dbPath);
  const id = Number(noteId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Некорректный noteId.');
  }
  const resolvedTargetIdentity = extractTargetIdentity(targetIdentity || opponent);

  const row = db.prepare(`
    SELECT
      n.id AS note_id,
      n.target_identity,
      h.hand_number,
      lower(COALESCE(h.room, '')) AS room
    FROM hh_notes n
    JOIN hh_hands h ON h.id = n.hand_id
    WHERE n.id = ?
    LIMIT 1
  `).get(id);

  if (!row) {
    throw new Error('Раздача не найдена.');
  }
  if (resolvedTargetIdentity && String(row.target_identity || '') !== resolvedTargetIdentity) {
    throw new Error('Раздача не принадлежит выбранному игроку.');
  }

  return {
    noteId: Number(row.note_id),
    targetIdentity: String(row.target_identity || ''),
    handNumber: String(row.hand_number || ''),
    room: String(row.room || '')
  };
}

export function upsertHhManualPresupposition(dbPath, {
  opponent = '',
  targetIdentity = '',
  handNumber = '',
  room = '',
  field = '',
  value = ''
} = {}) {
  const db = openDb(dbPath);
  const resolvedTargetIdentity = extractTargetIdentity(targetIdentity || opponent);
  if (!resolvedTargetIdentity) {
    throw new Error('target identity обязателен для сохранения HH presupposition.');
  }

  const resolvedField = normalizeManualField(field);
  if (!resolvedField) {
    throw new Error('Некорректное поле HH presupposition.');
  }

  const resolvedHandNumber = String(handNumber || '').trim();
  if (!resolvedHandNumber) {
    throw new Error('handNumber обязателен для сохранения HH presupposition.');
  }

  const resolvedRoom = String(room || '').trim().toLowerCase();
  const nextValue = sanitizeManualText(value, 4000);
  const nowIso = new Date().toISOString();

  return withTransaction(db, () => {
    db.prepare(`
      INSERT INTO hh_manual_presupp (target_identity, room, hand_number, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(target_identity, room, hand_number) DO UPDATE SET
        updated_at=excluded.updated_at
    `).run(resolvedTargetIdentity, resolvedRoom, resolvedHandNumber, nowIso);

    db.prepare(`
      UPDATE hh_manual_presupp
      SET ${resolvedField} = ?, updated_at = ?
      WHERE target_identity = ? AND room = ? AND hand_number = ?
    `).run(nextValue, nowIso, resolvedTargetIdentity, resolvedRoom, resolvedHandNumber);

    const row = db.prepare(`
      SELECT preflop, flop, turn, river, hand_presupposition
      FROM hh_manual_presupp
      WHERE target_identity = ? AND room = ? AND hand_number = ?
      LIMIT 1
    `).get(resolvedTargetIdentity, resolvedRoom, resolvedHandNumber);

    return {
      targetIdentity: resolvedTargetIdentity,
      room: resolvedRoom,
      handNumber: resolvedHandNumber,
      fields: {
        preflop: String(row?.preflop || ''),
        flop: String(row?.flop || ''),
        turn: String(row?.turn || ''),
        river: String(row?.river || ''),
        hand_presupposition: String(row?.hand_presupposition || '')
      }
    };
  });
}

function pruneOrphanHhRows(db) {
  const handsDeleted = Number(db.prepare(`
    DELETE FROM hh_hands
    WHERE id IN (
      SELECT h.id
      FROM hh_hands h
      LEFT JOIN hh_notes n ON n.hand_id = h.id
      WHERE n.id IS NULL
    )
  `).run().changes || 0);

  db.prepare(`
    DELETE FROM hh_players
    WHERE id IN (
      SELECT p.id
      FROM hh_players p
      LEFT JOIN hh_hand_players hp ON hp.player_id = p.id
      WHERE hp.id IS NULL
    )
  `).run();

  db.prepare(`
    DELETE FROM hh_import_runs
    WHERE id IN (
      SELECT r.id
      FROM hh_import_runs r
      LEFT JOIN hh_hands h ON h.run_id = r.id
      WHERE h.id IS NULL
    )
  `).run();

  return { handsDeleted };
}

export function clearHhHandsByOpponent(dbPath, { opponent = '', targetIdentity = '' } = {}) {
  const db = openDb(dbPath);
  const resolvedTargetIdentity = extractTargetIdentity(targetIdentity || opponent);
  if (!resolvedTargetIdentity) {
    throw new Error('Не указан оппонент для удаления HH данных.');
  }

  return withTransaction(db, () => {
    const notesDeleted = Number(db.prepare(`
      DELETE FROM hh_notes
      WHERE target_identity = ?
    `).run(resolvedTargetIdentity).changes || 0);

    const { handsDeleted } = pruneOrphanHhRows(db);
    db.prepare('DELETE FROM hh_profile_cache WHERE target_identity = ?').run(resolvedTargetIdentity);

    return {
      targetIdentity: resolvedTargetIdentity,
      notesDeleted,
      handsDeleted
    };
  });
}

export function clearAllHhHands(dbPath) {
  const db = openDb(dbPath);
  return withTransaction(db, () => {
    const notesDeleted = Number(db.prepare('DELETE FROM hh_notes').run().changes || 0);
    const handsDeleted = Number(db.prepare('DELETE FROM hh_hands').run().changes || 0);
    const playersDeleted = Number(db.prepare('DELETE FROM hh_players').run().changes || 0);
    const runsDeleted = Number(db.prepare('DELETE FROM hh_import_runs').run().changes || 0);
    db.prepare('DELETE FROM hh_profile_cache').run();

    return {
      notesDeleted,
      handsDeleted,
      playersDeleted,
      runsDeleted
    };
  });
}

function normalizeProfileFilters(filters = {}) {
  const out = {
    playerGroups: [],
    datePreset: 'all',
    gameCards: [],
    rooms: [],
    potBuckets: [],
    limits: [],
    vsOpponent: '',
    recentLimit: 'all'
  };

  const parseList = (value) => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const allowedPlayerGroups = new Set(['2', '3-4', '5-6', '7-9']);
  out.playerGroups = parseList(filters.playerGroups)
    .map((item) => item.toLowerCase())
    .filter((item) => allowedPlayerGroups.has(item));

  const allowedDatePresets = new Set(['all', '6m', '3m', '1m', '1w', '3d', 'today']);
  const preset = String(filters.datePreset || 'all').trim().toLowerCase();
  out.datePreset = allowedDatePresets.has(preset) ? preset : 'all';

  out.gameCards = parseList(filters.gameCards)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && [4, 5, 6].includes(item));

  out.rooms = parseList(filters.rooms)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const allowedPotBuckets = new Set(['small', 'medium', 'large', 'huge']);
  out.potBuckets = parseList(filters.potBuckets)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => allowedPotBuckets.has(item));

  const allowedLimits = new Set(['2-4', '2.5-5', '3-6', '5-10', '10-20', '25-50', '50-100', '100-200']);
  out.limits = parseList(filters.limits)
    .map((item) => item.trim().replace(/\s+/g, ''))
    .filter((item) => allowedLimits.has(item));

  out.vsOpponent = String(filters.vsOpponent || '').trim();

  const allowedRecentLimits = new Set(['all', '50', '20']);
  const recentRaw = String(filters.recentLimit || 'all').trim().toLowerCase();
  out.recentLimit = allowedRecentLimits.has(recentRaw) ? recentRaw : 'all';

  return out;
}

function subtractUtc(date, unit, count) {
  const out = new Date(date.getTime());
  if (unit === 'month') {
    out.setUTCMonth(out.getUTCMonth() - count);
    return out;
  }
  if (unit === 'day') {
    out.setUTCDate(out.getUTCDate() - count);
    return out;
  }
  if (unit === 'week') {
    out.setUTCDate(out.getUTCDate() - (count * 7));
    return out;
  }
  return out;
}

function formatSqlUtc(date) {
  const value = new Date(date.getTime());
  const yyyy = value.getUTCFullYear();
  const mm = String(value.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(value.getUTCDate()).padStart(2, '0');
  const hh = String(value.getUTCHours()).padStart(2, '0');
  const mi = String(value.getUTCMinutes()).padStart(2, '0');
  const ss = String(value.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function dateSinceByPreset(datePreset) {
  const now = new Date();
  if (datePreset === '6m') return formatSqlUtc(subtractUtc(now, 'month', 6));
  if (datePreset === '3m') return formatSqlUtc(subtractUtc(now, 'month', 3));
  if (datePreset === '1m') return formatSqlUtc(subtractUtc(now, 'month', 1));
  if (datePreset === '1w') return formatSqlUtc(subtractUtc(now, 'week', 1));
  if (datePreset === '3d') return formatSqlUtc(subtractUtc(now, 'day', 3));
  if (datePreset === 'today') {
    const start = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0
    ));
    return formatSqlUtc(start);
  }
  return '';
}

function appendArrayCondition(sqlParts, params, values, columnSql) {
  if (!values.length) return;
  const placeholders = values.map(() => '?').join(', ');
  sqlParts.push(`AND ${columnSql} IN (${placeholders})`);
  params.push(...values);
}

function appendGameCardsCondition(sqlParts, params, gameCards) {
  if (!gameCards.length) return;
  const normalized = gameCards
    .map((item) => Number(item))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.trunc(value));
  if (!normalized.length) return;
  const placeholders = normalized.map(() => '?').join(', ');
  const gameCardsSql = `
    COALESCE(
      h.game_card_count,
      CASE
        WHEN lower(COALESCE(h.game_type, '')) GLOB 'plo[0-9]*'
          THEN CAST(substr(lower(h.game_type), 4) AS INTEGER)
        ELSE NULL
      END
    )
  `;
  sqlParts.push(`AND ${gameCardsSql} IN (${placeholders})`);
  params.push(...normalized);
}

function appendPlayerGroupCondition(sqlParts, params, groups) {
  if (!groups.length) return;
  const ranges = {
    '2': [2, 2],
    '3-4': [3, 4],
    '5-6': [5, 6],
    '7-9': [7, 9]
  };
  const clauses = [];
  for (const group of groups) {
    const range = ranges[group];
    if (!range) continue;
    clauses.push('(h.active_players_count BETWEEN ? AND ?)');
    params.push(range[0], range[1]);
  }
  if (!clauses.length) return;
  sqlParts.push(`AND (${clauses.join(' OR ')})`);
}

function appendPotBucketCondition(sqlParts, params, buckets) {
  if (!buckets.length) return;
  const clauses = [];
  for (const bucket of buckets) {
    if (bucket === 'small') {
      clauses.push('(h.final_pot_bb >= 0 AND h.final_pot_bb < 15)');
      continue;
    }
    if (bucket === 'medium') {
      clauses.push('(h.final_pot_bb >= 15 AND h.final_pot_bb < 35)');
      continue;
    }
    if (bucket === 'large') {
      clauses.push('(h.final_pot_bb >= 35 AND h.final_pot_bb < 90)');
      continue;
    }
    if (bucket === 'huge') {
      clauses.push('(h.final_pot_bb >= 90)');
    }
  }
  if (!clauses.length) return;
  sqlParts.push(`AND (${clauses.join(' OR ')})`);
}

function appendLimitCondition(sqlParts, params, limits) {
  if (!limits.length) return;
  const clauses = [];
  for (const item of limits) {
    const parts = String(item).split('-');
    if (parts.length !== 2) continue;
    const sb = Number(parts[0]);
    const bb = Number(parts[1]);
    if (!Number.isFinite(sb) || !Number.isFinite(bb)) continue;
    clauses.push('(abs(COALESCE(h.sb, 0) - ?) < 0.000001 AND abs(COALESCE(h.bb, 0) - ?) < 0.000001)');
    params.push(sb, bb);
  }
  if (!clauses.length) return;
  sqlParts.push(`AND (${clauses.join(' OR ')})`);
}

function appendDateCondition(sqlParts, params, datePreset) {
  const since = dateSinceByPreset(datePreset);
  if (!since) return;
  sqlParts.push(`
    AND datetime(replace(replace(replace(h.played_at_utc, ' UTC', ''), 'T', ' '), 'Z', '')) >= datetime(?)
  `);
  params.push(since);
}

function resolveIdentityPlayerIds(db, identityValue) {
  const identity = extractTargetIdentity(identityValue);
  if (!identity) return [];
  const rows = db.prepare(`
    SELECT id
    FROM hh_players
    WHERE player_key = ?
       OR lower(COALESCE(display_name, '')) = ?
  `).all(identity, identity);
  return rows
    .map((row) => Number(row?.id || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function appendVsOpponentCondition(sqlParts, params, db, targetIdentity, vsOpponent) {
  const vsIdentity = extractTargetIdentity(vsOpponent);
  if (!vsIdentity) return;

  const targetIds = resolveIdentityPlayerIds(db, targetIdentity);
  const versusIds = resolveIdentityPlayerIds(db, vsIdentity);
  if (!targetIds.length || !versusIds.length) {
    sqlParts.push('AND 0');
    return;
  }

  const targetPlaceholders = targetIds.map(() => '?').join(', ');
  const versusPlaceholders = versusIds.map(() => '?').join(', ');
  sqlParts.push(`
    AND EXISTS (
      SELECT 1
      FROM hh_events t_evt
      JOIN hh_events v_evt
        ON v_evt.hand_id = t_evt.hand_id
      WHERE t_evt.hand_id = h.id
        AND t_evt.actor_player_id IN (${targetPlaceholders})
        AND v_evt.actor_player_id IN (${versusPlaceholders})
        AND t_evt.actor_player_id <> v_evt.actor_player_id
        AND t_evt.street IN ('flop', 'turn', 'river')
        AND v_evt.street = t_evt.street
        AND t_evt.action IN ('check', 'call', 'bet', 'raise', 'fold')
        AND v_evt.action IN ('check', 'call', 'bet', 'raise', 'fold')
    )
  `);

  params.push(...targetIds);
  params.push(...versusIds);
}

export function getHhProfileRows(dbPath, { opponent, limit = HH_PROFILE_ROWS_DEFAULT, filters = {} } = {}) {
  const db = openDb(dbPath);
  const targetIdentity = extractTargetIdentity(opponent);
  if (!targetIdentity) {
    return {
      rows: [],
      filterOptions: { rooms: [] },
      appliedFilters: normalizeProfileFilters(filters)
    };
  }
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(HH_PROFILE_ROWS_MAX, Math.trunc(limit)))
    : HH_PROFILE_ROWS_DEFAULT;
  const safeFilters = normalizeProfileFilters(filters);
  const likeToken = `%_${targetIdentity} %`;
  const baseWhere = `
    (
      n.target_identity = ?
      OR lower(n.preflop) LIKE ?
      OR lower(n.flop) LIKE ?
      OR lower(n.turn) LIKE ?
      OR lower(n.river) LIKE ?
    )
  `;
  const sqlParts = [
    `
    SELECT
      n.id,
      n.preflop,
      n.flop,
      n.turn,
      n.river,
      n.presupposition,
      m.preflop AS manual_preflop,
      m.flop AS manual_flop,
      m.turn AS manual_turn,
      m.river AS manual_river,
      m.hand_presupposition AS manual_hand_presupposition,
      h.hand_number,
      h.room,
      h.game_type,
      h.game_card_count,
      h.sb,
      h.bb,
      h.limit_text,
      h.active_players_count,
      h.final_pot_bb,
      h.played_at_utc,
      COALESCE(
        h.game_card_count,
        CASE
          WHEN lower(COALESCE(h.game_type, '')) GLOB 'plo[0-9]*'
            THEN CAST(substr(lower(h.game_type), 4) AS INTEGER)
          ELSE NULL
        END
      ) AS resolved_game_card_count
    FROM hh_notes n
    JOIN hh_hands h ON h.id = n.hand_id
    LEFT JOIN hh_manual_presupp m
      ON m.target_identity = n.target_identity
     AND lower(COALESCE(m.room, '')) = lower(COALESCE(h.room, ''))
     AND m.hand_number = h.hand_number
    WHERE ${baseWhere}
  `
  ];
  const params = [targetIdentity, likeToken, likeToken, likeToken, likeToken];

  appendPlayerGroupCondition(sqlParts, params, safeFilters.playerGroups);
  appendDateCondition(sqlParts, params, safeFilters.datePreset);
  appendGameCardsCondition(sqlParts, params, safeFilters.gameCards);
  appendLimitCondition(sqlParts, params, safeFilters.limits);
  if (safeFilters.rooms.length) {
    appendArrayCondition(sqlParts, params, safeFilters.rooms, 'lower(COALESCE(h.room, \'\'))');
  }
  appendPotBucketCondition(sqlParts, params, safeFilters.potBuckets);
  appendVsOpponentCondition(sqlParts, params, db, targetIdentity, safeFilters.vsOpponent);

  sqlParts.push(`
    ORDER BY
      COALESCE(datetime(replace(replace(replace(h.played_at_utc, ' UTC', ''), 'T', ' '), 'Z', '')), datetime('1970-01-01')) DESC,
      n.id DESC
    LIMIT ?
  `);
  params.push(safeLimit);

  const rowsRaw = db.prepare(sqlParts.join('\n')).all(...params);

  const rows = rowsRaw.map((row) => ({
    row: Number(row.id),
    nickname: 'HH',
    preflop: String(row.preflop || ''),
    flop: String(row.flop || ''),
    turn: String(row.turn || ''),
    river: String(row.river || ''),
    presupposition: String(row.presupposition || ''),
    manualPreflop: String(row.manual_preflop || ''),
    manualFlop: String(row.manual_flop || ''),
    manualTurn: String(row.manual_turn || ''),
    manualRiver: String(row.manual_river || ''),
    handPresupposition: String(row.manual_hand_presupposition || ''),
    handNumber: String(row.hand_number || ''),
    room: String(row.room || '').toLowerCase(),
    gameType: String(row.game_type || ''),
    gameCardCount: Number.isFinite(Number(row.resolved_game_card_count))
      ? Number(row.resolved_game_card_count)
      : null,
    sb: Number.isFinite(Number(row.sb)) ? Number(row.sb) : null,
    bb: Number.isFinite(Number(row.bb)) ? Number(row.bb) : null,
    limitText: String(row.limit_text || ''),
    activePlayersCount: Number.isFinite(Number(row.active_players_count))
      ? Number(row.active_players_count)
      : null,
    finalPotBb: Number.isFinite(Number(row.final_pot_bb))
      ? Number(row.final_pot_bb)
      : null,
    playedAtUtc: String(row.played_at_utc || '')
  }));

  const roomsRaw = db.prepare(`
    SELECT DISTINCT lower(COALESCE(h.room, '')) AS room
    FROM hh_notes n
    JOIN hh_hands h ON h.id = n.hand_id
    WHERE ${baseWhere}
      AND trim(COALESCE(h.room, '')) <> ''
    ORDER BY room ASC
  `).all(targetIdentity, likeToken, likeToken, likeToken, likeToken);

  return {
    rows,
    filterOptions: {
      rooms: roomsRaw
        .map((item) => String(item?.room || '').trim())
        .filter(Boolean)
    },
    appliedFilters: safeFilters
  };
}

export function getHhOpponentSuggestions(dbPath, { query = '', limit = 50 } = {}) {
  const db = openDb(dbPath);
  const q = String(query || '').trim().toLowerCase();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(5000, Math.trunc(limit))) : 50;
  const pattern = `%${q}%`;

  const playerRows = db.prepare(`
    SELECT display_name AS value
    FROM hh_players
    WHERE display_name IS NOT NULL
      AND trim(display_name) <> ''
      AND (? = '' OR lower(display_name) LIKE ?)
    ORDER BY COALESCE(last_seen_at, first_seen_at, created_at) DESC
    LIMIT ?
  `).all(q, pattern, safeLimit);

  const identityRows = db.prepare(`
    SELECT target_identity AS value
    FROM hh_notes
    WHERE target_identity IS NOT NULL
      AND trim(target_identity) <> ''
      AND (? = '' OR lower(target_identity) LIKE ?)
    ORDER BY updated_at DESC, id DESC
    LIMIT ?
  `).all(q, pattern, safeLimit);

  const merged = [];
  const seen = new Set();
  for (const row of [...playerRows, ...identityRows]) {
    const value = String(row?.value || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(value);
    if (merged.length >= safeLimit) break;
  }
  return merged;
}
