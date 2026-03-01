import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';

import {
  beginHhImportRun,
  finishHhImportRun,
  getHhOpponentSuggestions,
  getHhNotesForProfile,
  getHhProfileRows,
  initHhDb,
  resolveHhStorageMode,
  saveHhParsedRecord
} from '../src/hhDb.js';

function makeTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-voice-hhdb-'));
  return path.join(dir, 'hh.db');
}

test('resolveHhStorageMode normalizes storage mode', () => {
  assert.equal(resolveHhStorageMode('db'), 'db');
  assert.equal(resolveHhStorageMode('DUAL'), 'dual');
  assert.equal(resolveHhStorageMode('unknown'), 'sheets');
});

test('initHhDb migrates legacy hh_hands schema with missing metadata columns', () => {
  const dbPath = makeTempDbPath();
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE hh_hands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      hand_number TEXT NOT NULL,
      table_name TEXT,
      game_type TEXT,
      sb REAL,
      bb REAL NOT NULL,
      ante REAL NOT NULL DEFAULT 0,
      straddle_total REAL NOT NULL DEFAULT 0,
      played_at_utc TEXT,
      raw_text TEXT NOT NULL,
      raw_hash TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.close();

  initHhDb(dbPath);

  const migrated = new DatabaseSync(dbPath);
  const columns = migrated.prepare('PRAGMA table_info(hh_hands)').all().map((row) => String(row?.name || ''));
  migrated.close();

  assert.ok(columns.includes('room'));
  assert.ok(columns.includes('game_card_count'));
  assert.ok(columns.includes('limit_text'));
  assert.ok(columns.includes('active_players_count'));
  assert.ok(columns.includes('final_pot_bb'));
});

test('saveHhParsedRecord persists HH note and profile query reads by target identity', () => {
  const dbPath = makeTempDbPath();
  initHhDb(dbPath);

  const runId = beginHhImportRun(dbPath, { sourceType: 'single', fileCount: 1 });

  const handHistory = `PokerStars Hand #1413806286:  5 Card Omaha Pot Limit (¥5/¥10 CNY) - 2026/02/11 21:42:00 UTC
Table 'CGG_9224270-WEEKLYBENDER' 6-max Seat #1 is the button
12121116: raises ¥230 to ¥310
85033665: raises ¥690 to ¥1000
12121116: calls ¥690
*** FLOP *** [4c Qc 4d]
85033665: bets ¥2070
12121116: calls ¥180 and is all-in
*** SHOW DOWN ***
85033665: shows [Ah Ac Kd 9d 4h]
12121116: shows [Kh Js 9s 8c 7c]`;

  const parsedHH = {
    blinds: { smallBlind: 5, bigBlind: 10 },
    players: ['12121116', '85033665'],
    positionsByPlayer: { '12121116': 'BB', '85033665': 'SB' },
    targetPlayer: '12121116',
    board: {
      flop: ['4c', 'Qc', '4d'],
      turn: '9c',
      river: '8d'
    },
    events: {
      preflop: [
        { player: '12121116', type: 'raise', amount: 310, amountBb: 31, potBefore: 150, potAfter: 460, raw: 'raises to 310' },
        { player: '85033665', type: 'raise', amount: 690, amountBb: 69, potBefore: 460, potAfter: 1150, raw: 'raises to 1000' },
        { player: '12121116', type: 'call', amount: 690, amountBb: 69, potBefore: 1150, potAfter: 1840, raw: 'calls 690' }
      ],
      flop: [
        { player: '85033665', type: 'bet', amount: 2070, amountBb: 207, pctPot: 112.5, potBefore: 1840, potAfter: 3910, raw: 'bets 2070' },
        { player: '12121116', type: 'call', amount: 180, amountBb: 18, pctPot: 9.78, potBefore: 3910, potAfter: 4090, allIn: true, raw: 'calls 180 and is all-in' }
      ],
      turn: [],
      river: []
    },
    showdown: {
      showCardsByPlayer: {
        '85033665': ['Ah', 'Ac', 'Kd', '9d', '4h'],
        '12121116': ['Kh', 'Js', '9s', '8c', '7c']
      }
    }
  };

  const parsed = {
    preflop: 'BB_12121116 r31bb / SB_85033665 r100bb / BB_12121116 c69bb',
    flop: '(184) SB_85033665 cb8.7 / BB_12121116 c on4cQc4d',
    turn: '',
    river: '',
    presupposition: ''
  };

  const saved = saveHhParsedRecord(dbPath, {
    runId,
    handHistory,
    parsedHH,
    parsed,
    parserVersion: 'test-v1',
    targetIdentity: '12121116',
    targetPlayer: '12121116'
  });

  assert.ok(saved.noteId > 0);
  assert.equal(saved.insertedHand, true);
  finishHhImportRun(dbPath, runId, { handCount: 1, savedCount: 1, failedCount: 0, errors: [] });

  const rows = getHhNotesForProfile(dbPath, { opponent: '12121116', limit: 10 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nickname, 'HH');
  assert.equal(rows[0].preflop, parsed.preflop);
  assert.equal(rows[0].flop, parsed.flop);
});

test('saveHhParsedRecord deduplicates by hand_number+parser_version', () => {
  const dbPath = makeTempDbPath();
  initHhDb(dbPath);
  const runId = beginHhImportRun(dbPath, { sourceType: 'batch', fileCount: 1 });

  const makeParsedHH = () => ({
    blinds: { smallBlind: 5, bigBlind: 10 },
    players: ['12121116', '85033665'],
    positionsByPlayer: { '12121116': 'BB', '85033665': 'SB' },
    targetPlayer: '12121116',
    board: { flop: ['4c', 'Qc', '4d'], turn: '', river: '' },
    events: { preflop: [], flop: [], turn: [], river: [] },
    showdown: {
      showCardsByPlayer: {
        '85033665': ['Ah', 'Ac', 'Kd', '9d', '4h'],
        '12121116': ['Kh', 'Js', '9s', '8c', '7c']
      }
    }
  });

  const parsed = {
    preflop: 'BB_12121116 r31bb',
    flop: '(10) SB_85033665 x / BB_12121116 xb',
    turn: '',
    river: '',
    presupposition: ''
  };

  const hhA = `PokerStars Hand #1413806286:  5 Card Omaha Pot Limit (¥5/¥10 CNY) - 2026/02/11 21:42:00 UTC
Table 'CGG_9224270-WEEKLYBENDER' 6-max Seat #1 is the button
*** HOLE CARDS ***
12121116: raises ¥230 to ¥310`;
  const hhB = `PokerStars Hand #1413806286:  5 Card Omaha Pot Limit (¥5/¥10 CNY) - 2026/02/11 21:42:00 UTC
Table 'CGG_9224270-WEEKLYBENDER' 6-max Seat #1 is the button
*** HOLE CARDS ***
12121116: raises ¥231 to ¥311`;

  const first = saveHhParsedRecord(dbPath, {
    runId,
    handHistory: hhA,
    parsedHH: makeParsedHH(),
    parsed,
    parserVersion: 'test-v2',
    targetIdentity: '12121116',
    targetPlayer: '12121116'
  });
  const second = saveHhParsedRecord(dbPath, {
    runId,
    handHistory: hhB,
    parsedHH: makeParsedHH(),
    parsed,
    parserVersion: 'test-v2',
    targetIdentity: '12121116',
    targetPlayer: '12121116'
  });

  assert.equal(first.insertedHand, true);
  assert.equal(second.insertedHand, false);
  assert.equal(second.handId, first.handId);
});

test('getHhProfileRows applies metadata filters (players/date/game/room/pot)', () => {
  const dbPath = makeTempDbPath();
  initHhDb(dbPath);
  const runId = beginHhImportRun(dbPath, { sourceType: 'batch', fileCount: 1 });

  const handHistory = `PokerStars Hand #384207444:  5 Card Omaha Pot Limit (¥10/¥20 CNY) - 2026/02/14 16:54:34 UTC
Table 'PMS_Cpr_5PLO ₮2,000 II - 22601' 7-max Seat #7 is the button
111: calls ¥20
222: raises ¥80 to ¥100
333: calls ¥100
*** FLOP *** [Ah 7d 3c]
111: checks
222: bets ¥120
333: folds
111: folds
*** SUMMARY ***
Total pot ¥2430 | Rake ¥72.90`;

  const parsedHH = {
    gameCardCount: 5,
    blinds: { smallBlind: 10, bigBlind: 20 },
    players: ['111', '222', '333'],
    positionsByPlayer: { '111': 'UTG', '222': 'HJ', '333': 'CO' },
    targetPlayer: '222',
    board: {
      flop: ['Ah', '7d', '3c'],
      turn: '',
      river: ''
    },
    events: {
      preflop: [
        { player: '111', type: 'call', amount: 20, potBefore: 0, potAfter: 20 },
        { player: '222', type: 'raise', amount: 100, toAmount: 100, potBefore: 20, potAfter: 120 },
        { player: '333', type: 'call', amount: 100, potBefore: 120, potAfter: 220 }
      ],
      flop: [
        { player: '111', type: 'check', potBefore: 220, potAfter: 220 },
        { player: '222', type: 'bet', amount: 120, potBefore: 220, potAfter: 340 },
        { player: '333', type: 'fold', potBefore: 340, potAfter: 340 },
        { player: '111', type: 'fold', potBefore: 340, potAfter: 340 }
      ],
      turn: [],
      river: []
    },
    showdown: { showCardsByPlayer: {} }
  };

  saveHhParsedRecord(dbPath, {
    runId,
    handHistory,
    parsedHH,
    parsed: {
      preflop: 'HJ_222 r5bb / CO_333 c5bb',
      flop: '(11) HJ_222 b54.5 onAh7d3c / CO_333 f / UTG_111 f',
      turn: '',
      river: '',
      presupposition: ''
    },
    parserVersion: 'test-v4',
    targetIdentity: '222',
    targetPlayer: '222'
  });

  const noFilter = getHhProfileRows(dbPath, { opponent: '222', limit: 100, filters: {} });
  assert.equal(noFilter.rows.length, 1);
  assert.deepEqual(noFilter.filterOptions.rooms, ['pms_cpr']);

  const players2 = getHhProfileRows(dbPath, { opponent: '222', filters: { playerGroups: ['2'] } });
  assert.equal(players2.rows.length, 0);

  const players34 = getHhProfileRows(dbPath, { opponent: '222', filters: { playerGroups: ['3-4'] } });
  assert.equal(players34.rows.length, 1);

  const game5 = getHhProfileRows(dbPath, { opponent: '222', filters: { gameCards: ['5'] } });
  assert.equal(game5.rows.length, 1);

  const game4 = getHhProfileRows(dbPath, { opponent: '222', filters: { gameCards: ['4'] } });
  assert.equal(game4.rows.length, 0);

  const roomMatch = getHhProfileRows(dbPath, { opponent: '222', filters: { rooms: ['pms_cpr'] } });
  assert.equal(roomMatch.rows.length, 1);

  const roomMiss = getHhProfileRows(dbPath, { opponent: '222', filters: { rooms: ['ggcl'] } });
  assert.equal(roomMiss.rows.length, 0);

  const hugePot = getHhProfileRows(dbPath, { opponent: '222', filters: { potBuckets: ['huge'] } });
  assert.equal(hugePot.rows.length, 1);

  const smallPot = getHhProfileRows(dbPath, { opponent: '222', filters: { potBuckets: ['small'] } });
  assert.equal(smallPot.rows.length, 0);

  const limitMatch = getHhProfileRows(dbPath, { opponent: '222', filters: { limits: ['10-20'] } });
  assert.equal(limitMatch.rows.length, 1);

  const limitMiss = getHhProfileRows(dbPath, { opponent: '222', filters: { limits: ['5-10'] } });
  assert.equal(limitMiss.rows.length, 0);

  const today = getHhProfileRows(dbPath, { opponent: '222', filters: { datePreset: 'today' } });
  assert.equal(today.rows.length, 0);
});

test('getHhProfileRows supports legacy game-card filter fallback from game_type', () => {
  const dbPath = makeTempDbPath();
  initHhDb(dbPath);
  const runId = beginHhImportRun(dbPath, { sourceType: 'batch', fileCount: 1 });

  saveHhParsedRecord(dbPath, {
    runId,
    handHistory: `PokerStars Hand #22220001:  4 Card Omaha Pot Limit (¥5/¥10 CNY) - 2026/02/11 12:00:00 UTC
Table 'PMS_TEST' 6-max Seat #1 is the button`,
    parsedHH: {
      gameCardCount: 4,
      blinds: { smallBlind: 5, bigBlind: 10 },
      players: ['222', '333'],
      positionsByPlayer: { '222': 'BTN', '333': 'BB' },
      targetPlayer: '222',
      board: { flop: ['Ah', '7d', '3c'], turn: '', river: '' },
      events: {
        preflop: [{ player: '222', type: 'raise', amount: 35, potBefore: 0, potAfter: 35 }],
        flop: [{ player: '333', type: 'fold', potBefore: 35, potAfter: 35 }],
        turn: [],
        river: []
      },
      showdown: { showCardsByPlayer: {} }
    },
    parsed: {
      preflop: 'BTN_222 r3.5bb',
      flop: '(3.5) BB_333 f',
      turn: '',
      river: '',
      presupposition: ''
    },
    parserVersion: 'test-legacy-cards',
    targetIdentity: '222',
    targetPlayer: '222'
  });

  const db = new DatabaseSync(dbPath);
  db.prepare('UPDATE hh_hands SET game_card_count = NULL WHERE hand_number = ?').run('22220001');
  db.close();

  const game4 = getHhProfileRows(dbPath, { opponent: '222', filters: { gameCards: ['4'] } });
  assert.equal(game4.rows.length, 1);
  assert.equal(game4.rows[0].gameCardCount, 4);
  assert.equal(game4.rows[0].gameType, 'PLO4');
});

test('getHhProfileRows applies vs-opponent filter only for shared postflop streets', () => {
  const dbPath = makeTempDbPath();
  initHhDb(dbPath);
  const runId = beginHhImportRun(dbPath, { sourceType: 'batch', fileCount: 1 });

  const saveHand = ({ handNumber, playedAt, preflop, flop }) => {
    saveHhParsedRecord(dbPath, {
      runId,
      handHistory: `PokerStars Hand #${handNumber}:  5 Card Omaha Pot Limit (¥5/¥10 CNY) - ${playedAt} UTC
Table 'TEST' 6-max Seat #1 is the button`,
      parsedHH: {
        gameCardCount: 5,
        blinds: { smallBlind: 5, bigBlind: 10 },
        players: ['222', '333', '444'],
        positionsByPlayer: { '222': 'HJ', '333': 'CO', '444': 'BTN' },
        targetPlayer: '222',
        board: { flop: ['Ah', '7d', '3c'], turn: '', river: '' },
        events: {
          preflop,
          flop,
          turn: [],
          river: []
        },
        showdown: { showCardsByPlayer: {} }
      },
      parsed: {
        preflop: 'HJ_222 r3.5bb / CO_333 c3.5bb',
        flop: '(10) HJ_222 x / CO_333 x',
        turn: '',
        river: '',
        presupposition: ''
      },
      parserVersion: 'test-vs-v1',
      targetIdentity: '222',
      targetPlayer: '222'
    });
  };

  // Hand 1: target and 333 both actively play preflop, but never share postflop.
  saveHand({
    handNumber: '1000001',
    playedAt: '2026/02/11 12:00:00',
    preflop: [
      { player: '222', type: 'raise', amount: 35, potBefore: 0, potAfter: 35 },
      { player: '333', type: 'call', amount: 35, potBefore: 35, potAfter: 70 },
      { player: '444', type: 'fold', potBefore: 70, potAfter: 70 }
    ],
    flop: []
  });

  // Hand 2: 333 folds preflop and never reaches postflop with target.
  saveHand({
    handNumber: '1000002',
    playedAt: '2026/02/11 12:01:00',
    preflop: [
      { player: '222', type: 'raise', amount: 35, potBefore: 0, potAfter: 35 },
      { player: '333', type: 'fold', potBefore: 35, potAfter: 35 },
      { player: '444', type: 'call', amount: 35, potBefore: 35, potAfter: 70 }
    ],
    flop: [
      { player: '222', type: 'check', potBefore: 70, potAfter: 70 },
      { player: '444', type: 'check', potBefore: 70, potAfter: 70 }
    ]
  });

  // Hand 3: target and 333 reach flop together.
  saveHand({
    handNumber: '1000003',
    playedAt: '2026/02/11 12:02:00',
    preflop: [
      { player: '222', type: 'call', amount: 10, potBefore: 0, potAfter: 10 },
      { player: '333', type: 'call', amount: 10, potBefore: 10, potAfter: 20 },
      { player: '444', type: 'call', amount: 10, potBefore: 20, potAfter: 30 }
    ],
    flop: [
      { player: '222', type: 'bet', amount: 20, potBefore: 30, potAfter: 50 },
      { player: '333', type: 'fold', potBefore: 50, potAfter: 50 },
      { player: '444', type: 'fold', potBefore: 50, potAfter: 50 }
    ]
  });

  const noVs = getHhProfileRows(dbPath, { opponent: '222', limit: 100, filters: {} });
  assert.equal(noVs.rows.length, 3);

  const vs333 = getHhProfileRows(dbPath, { opponent: '222', filters: { vsOpponent: '333' } });
  assert.equal(vs333.rows.length, 1);

  const vs444 = getHhProfileRows(dbPath, { opponent: '222', filters: { vsOpponent: '444' } });
  assert.equal(vs444.rows.length, 2);

  const vsUnknown = getHhProfileRows(dbPath, { opponent: '222', filters: { vsOpponent: '99999999' } });
  assert.equal(vsUnknown.rows.length, 0);
});

test('getHhOpponentSuggestions returns player names, ids and target identities', () => {
  const dbPath = makeTempDbPath();
  initHhDb(dbPath);
  const runId = beginHhImportRun(dbPath, { sourceType: 'batch', fileCount: 1 });

  const parsedHH = {
    blinds: { smallBlind: 5, bigBlind: 10 },
    players: ['spirituallybroken', '12121116', '85033665'],
    positionsByPlayer: { spirituallybroken: 'HJ', '12121116': 'BB', '85033665': 'SB' },
    targetPlayer: 'spirituallybroken',
    board: { flop: ['4c', 'Qc', '4d'], turn: '', river: '' },
    events: { preflop: [], flop: [], turn: [], river: [] },
    showdown: { showCardsByPlayer: {} }
  };
  const parsed = {
    preflop: 'HJ_spirituallybroken r3.5bb / SB_85033665 c2.5bb',
    flop: '',
    turn: '',
    river: '',
    presupposition: ''
  };

  saveHhParsedRecord(dbPath, {
    runId,
    handHistory: `PokerStars Hand #999999: 5 Card Omaha Pot Limit (¥5/¥10 CNY) - 2026/02/11 21:42:00 UTC
Table 'TEST' 6-max Seat #1 is the button
*** HOLE CARDS ***`,
    parsedHH,
    parsed,
    parserVersion: 'test-v3',
    targetIdentity: 'spirituallybroken',
    targetPlayer: 'spirituallybroken'
  });

  const all = getHhOpponentSuggestions(dbPath, { query: '', limit: 20 });
  assert.ok(all.includes('spirituallybroken'));
  assert.ok(all.includes('12121116'));

  const filtered = getHhOpponentSuggestions(dbPath, { query: 'irit', limit: 20 });
  assert.deepEqual(filtered, ['spirituallybroken']);
});
