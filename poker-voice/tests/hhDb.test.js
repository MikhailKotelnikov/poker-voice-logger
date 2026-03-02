import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';

import {
  beginHhImportRun,
  clearAllHhHands,
  clearHhHandsByOpponent,
  clearHhManualByHand,
  clearHhManualByOpponent,
  finishHhImportRun,
  getHhOpponentSuggestions,
  getHhNotesForProfile,
  getHhProfileRows,
  initHhDb,
  resolveHhStorageMode,
  saveHhParsedRecord,
  upsertHhManualActionTiming,
  upsertHhManualPresupposition
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
    CREATE TABLE hh_hand_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hand_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      seat_no INTEGER,
      position TEXT,
      stack_start REAL,
      is_target_candidate INTEGER NOT NULL DEFAULT 0,
      showdown_cards TEXT,
      showdown_result TEXT,
      UNIQUE(hand_id, player_id)
    );
  `);
  db.close();

  initHhDb(dbPath);

  const migrated = new DatabaseSync(dbPath);
  const columns = migrated.prepare('PRAGMA table_info(hh_hands)').all().map((row) => String(row?.name || ''));
  const hpColumns = migrated.prepare('PRAGMA table_info(hh_hand_players)').all().map((row) => String(row?.name || ''));
  migrated.close();

  assert.ok(columns.includes('room'));
  assert.ok(columns.includes('game_card_count'));
  assert.ok(columns.includes('limit_text'));
  assert.ok(columns.includes('active_players_count'));
  assert.ok(columns.includes('final_pot_bb'));
  assert.ok(hpColumns.includes('dealt_cards'));
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

test('manual presuppositions and timings survive HH clears and relink after reimport', () => {
  const dbPath = makeTempDbPath();
  initHhDb(dbPath);
  const parserVersion = 'test-manual-v1';

  const handHistory = `PokerStars Hand #77770001:  5 Card Omaha Pot Limit (¥5/¥10 CNY) - 2026/02/11 21:42:00 UTC
Table 'CGG_9224270-WEEKLYBENDER' 6-max Seat #1 is the button
12121116: raises ¥230 to ¥310
85033665: calls ¥310
*** FLOP *** [4c Qc 4d]
12121116: bets ¥420
85033665: calls ¥420`;

  const parsedHH = {
    blinds: { smallBlind: 5, bigBlind: 10 },
    players: ['12121116', '85033665'],
    positionsByPlayer: { '12121116': 'BB', '85033665': 'SB' },
    targetPlayer: '12121116',
    board: {
      flop: ['4c', 'Qc', '4d'],
      turn: '',
      river: ''
    },
    events: {
      preflop: [
        { player: '12121116', type: 'raise', amount: 310, amountBb: 31, potBefore: 0, potAfter: 310 },
        { player: '85033665', type: 'call', amount: 310, amountBb: 31, potBefore: 310, potAfter: 620 }
      ],
      flop: [
        { player: '12121116', type: 'bet', amount: 420, amountBb: 42, pctPot: 67.74, potBefore: 620, potAfter: 1040 },
        { player: '85033665', type: 'call', amount: 420, amountBb: 42, pctPot: 40.38, potBefore: 1040, potAfter: 1460 }
      ],
      turn: [],
      river: []
    },
    showdown: { showCardsByPlayer: {} }
  };

  const parsed = {
    preflop: 'BB_12121116 r31bb / SB_85033665 c31bb',
    flop: '(62) BB_12121116 cb67.7 on4cQc4d / SB_85033665 c',
    turn: '',
    river: '',
    presupposition: ''
  };

  const runId = beginHhImportRun(dbPath, { sourceType: 'single', fileCount: 1 });
  saveHhParsedRecord(dbPath, {
    runId,
    handHistory,
    parsedHH,
    parsed,
    parserVersion,
    targetIdentity: '12121116',
    targetPlayer: '12121116'
  });
  finishHhImportRun(dbPath, runId, { handCount: 1, savedCount: 1, failedCount: 0, errors: [] });

  const initialRows = getHhProfileRows(dbPath, { opponent: '12121116', limit: 10 }).rows;
  assert.equal(initialRows.length, 1);
  const resolvedHandNumber = initialRows[0].handNumber;
  const resolvedRoom = initialRows[0].room;

  upsertHhManualPresupposition(dbPath, {
    targetIdentity: '12121116',
    room: resolvedRoom,
    handNumber: resolvedHandNumber,
    field: 'flop',
    value: 'i gc'
  });
  upsertHhManualPresupposition(dbPath, {
    targetIdentity: '12121116',
    room: resolvedRoom,
    handNumber: resolvedHandNumber,
    field: 'hand_presupposition',
    value: 'hand note'
  });
  upsertHhManualActionTiming(dbPath, {
    targetIdentity: '12121116',
    room: resolvedRoom,
    handNumber: resolvedHandNumber,
    street: 'flop',
    actionIndex: 0,
    actionKey: 'BB_12121116 cb67.7',
    timing: '50% t'
  });

  let rows = getHhProfileRows(dbPath, { opponent: '12121116', limit: 10 }).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].manualFlop, 'i gc');
  assert.equal(rows[0].handPresupposition, 'hand note');
  assert.equal(rows[0].manualTimings.length, 1);
  assert.equal(rows[0].manualTimings[0].timing, '50% t');

  clearHhHandsByOpponent(dbPath, { opponent: '12121116' });
  rows = getHhProfileRows(dbPath, { opponent: '12121116', limit: 10 }).rows;
  assert.equal(rows.length, 0);

  const db = new DatabaseSync(dbPath);
  const manualCountAfterPlayerClear = Number(db.prepare('SELECT COUNT(*) AS c FROM hh_manual_presupp').get().c || 0);
  const timingCountAfterPlayerClear = Number(db.prepare('SELECT COUNT(*) AS c FROM hh_manual_action_timing').get().c || 0);
  db.close();
  assert.equal(manualCountAfterPlayerClear, 1);
  assert.equal(timingCountAfterPlayerClear, 1);

  const runId2 = beginHhImportRun(dbPath, { sourceType: 'reimport', fileCount: 1 });
  saveHhParsedRecord(dbPath, {
    runId: runId2,
    handHistory,
    parsedHH,
    parsed,
    parserVersion,
    targetIdentity: '12121116',
    targetPlayer: '12121116'
  });
  finishHhImportRun(dbPath, runId2, { handCount: 1, savedCount: 1, failedCount: 0, errors: [] });

  rows = getHhProfileRows(dbPath, { opponent: '12121116', limit: 10 }).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].manualFlop, 'i gc');
  assert.equal(rows[0].handPresupposition, 'hand note');
  assert.equal(rows[0].manualTimings.length, 1);
  assert.equal(rows[0].manualTimings[0].street, 'flop');
  assert.equal(rows[0].manualTimings[0].actionIndex, 0);
  assert.equal(rows[0].manualTimings[0].timing, '50% t');

  clearAllHhHands(dbPath);
  rows = getHhProfileRows(dbPath, { opponent: '12121116', limit: 10 }).rows;
  assert.equal(rows.length, 0);

  const dbAfterAllClear = new DatabaseSync(dbPath);
  const manualCountAfterAllClear = Number(dbAfterAllClear.prepare('SELECT COUNT(*) AS c FROM hh_manual_presupp').get().c || 0);
  const timingCountAfterAllClear = Number(dbAfterAllClear.prepare('SELECT COUNT(*) AS c FROM hh_manual_action_timing').get().c || 0);
  dbAfterAllClear.close();
  assert.equal(manualCountAfterAllClear, 1);
  assert.equal(timingCountAfterAllClear, 1);
});

test('manual presupp/timing are resolved by selected target identity, support manualOnly filter and clear APIs', () => {
  const dbPath = makeTempDbPath();
  initHhDb(dbPath);
  const parserVersion = 'test-manual-filter-v1';
  const target = 'proc88';

  const makeParsedHH = () => ({
    blinds: { smallBlind: 10, bigBlind: 20 },
    players: [target, 'villain1'],
    positionsByPlayer: { [target]: 'BTN', villain1: 'BB' },
    targetPlayer: target,
    board: { flop: ['Ad', '7c', '3h'], turn: '', river: '' },
    events: {
      preflop: [
        { player: target, type: 'raise', amount: 60, amountBb: 3, potBefore: 0, potAfter: 60 },
        { player: 'villain1', type: 'call', amount: 40, amountBb: 2, potBefore: 60, potAfter: 100 }
      ],
      flop: [
        { player: 'villain1', type: 'check', amount: 0, amountBb: 0, pctPot: 0, potBefore: 100, potAfter: 100 },
        { player: target, type: 'bet', amount: 50, amountBb: 2.5, pctPot: 50, potBefore: 100, potAfter: 150 }
      ],
      turn: [],
      river: []
    },
    showdown: { showCardsByPlayer: {} }
  });

  const makeParsed = (bbToken) => ({
    preflop: `BTN_${target} r3bb / BB_villain1 c2bb`,
    flop: `(5) BB_villain1 x / BTN_${target} cb${bbToken} onAd7c3h`,
    turn: '',
    river: '',
    presupposition: ''
  });

  const runId = beginHhImportRun(dbPath, { sourceType: 'batch', fileCount: 2 });
  saveHhParsedRecord(dbPath, {
    runId,
    handHistory: `PokerStars Hand #90000001: Omaha Pot Limit (¥10/¥20 CNY) - 2026/02/20 10:00:00 UTC\nTable 'PMS_Cpr_PLO ₮2,000 I - 20490' 7-max`,
    parsedHH: makeParsedHH(),
    parsed: makeParsed('50'),
    parserVersion,
    targetIdentity: 'unknown',
    targetPlayer: target
  });
  saveHhParsedRecord(dbPath, {
    runId,
    handHistory: `PokerStars Hand #90000002: Omaha Pot Limit (¥10/¥20 CNY) - 2026/02/20 10:05:00 UTC\nTable 'PMS_Cpr_PLO ₮2,000 I - 20490' 7-max`,
    parsedHH: makeParsedHH(),
    parsed: makeParsed('67'),
    parserVersion,
    targetIdentity: 'unknown',
    targetPlayer: target
  });
  finishHhImportRun(dbPath, runId, { handCount: 2, savedCount: 2, failedCount: 0, errors: [] });

  const rowsInitial = getHhProfileRows(dbPath, { opponent: target, limit: 10, filters: {} }).rows;
  assert.equal(rowsInitial.length, 2);
  const firstHand = rowsInitial.find((row) => row.handNumber === '90000001');
  const secondHand = rowsInitial.find((row) => row.handNumber === '90000002');
  assert.ok(firstHand);
  assert.ok(secondHand);

  upsertHhManualPresupposition(dbPath, {
    opponent: target,
    room: firstHand.room,
    handNumber: firstHand.handNumber,
    field: 'flop',
    value: 'manual-note'
  });
  upsertHhManualActionTiming(dbPath, {
    opponent: target,
    room: secondHand.room,
    handNumber: secondHand.handNumber,
    street: 'flop',
    actionIndex: 1,
    actionKey: `BTN_${target} cb67`,
    timing: '70% t'
  });

  const rowsWithManual = getHhProfileRows(dbPath, { opponent: target, limit: 10, filters: {} }).rows;
  const row9001 = rowsWithManual.find((row) => row.handNumber === '90000001');
  const row9002 = rowsWithManual.find((row) => row.handNumber === '90000002');
  assert.equal(row9001.manualFlop, 'manual-note');
  assert.equal(row9002.manualTimings.length, 1);
  assert.equal(row9002.manualTimings[0].timing, '70% t');

  const onlyManual = getHhProfileRows(dbPath, { opponent: target, limit: 10, filters: { manualOnly: true } }).rows;
  assert.equal(onlyManual.length, 2);

  const clearOne = clearHhManualByHand(dbPath, {
    opponent: target,
    room: firstHand.room,
    handNumber: firstHand.handNumber
  });
  assert.ok(clearOne.presuppDeleted >= 1);

  const rowsAfterOneClear = getHhProfileRows(dbPath, { opponent: target, limit: 10, filters: {} }).rows;
  const row9001After = rowsAfterOneClear.find((row) => row.handNumber === '90000001');
  const row9002After = rowsAfterOneClear.find((row) => row.handNumber === '90000002');
  assert.equal(row9001After.manualFlop, '');
  assert.equal(row9002After.manualTimings.length, 1);

  const clearOpponentManual = clearHhManualByOpponent(dbPath, { opponent: target });
  assert.ok(clearOpponentManual.timingsDeleted >= 1);

  const rowsAfterAllManualClear = getHhProfileRows(dbPath, { opponent: target, limit: 10, filters: {} }).rows;
  for (const row of rowsAfterAllManualClear) {
    assert.equal(row.manualPreflop, '');
    assert.equal(row.manualFlop, '');
    assert.equal(row.manualTurn, '');
    assert.equal(row.manualRiver, '');
    assert.equal(row.handPresupposition, '');
    assert.equal(row.manualTimings.length, 0);
  }

  const onlyManualAfterClear = getHhProfileRows(dbPath, { opponent: target, limit: 10, filters: { manualOnly: true } }).rows;
  assert.equal(onlyManualAfterClear.length, 0);
});

test('manual presupp save accepts position-prefixed opponent token and stays visible after reload', () => {
  const dbPath = makeTempDbPath();
  initHhDb(dbPath);
  const parserVersion = 'test-manual-prefixed-opponent-v1';
  const target = 'grexometr';

  const parsedHH = {
    blinds: { smallBlind: 5, bigBlind: 10 },
    players: [target, 'villain'],
    positionsByPlayer: { [target]: 'HJ', villain: 'BTN' },
    targetPlayer: target,
    board: { flop: ['Kc', '9h', '3s'], turn: '6d', river: '' },
    events: {
      preflop: [
        { player: target, type: 'raise', amount: 45, amountBb: 4.5, potBefore: 0, potAfter: 45 },
        { player: 'villain', type: 'call', amount: 45, amountBb: 4.5, potBefore: 45, potAfter: 90 }
      ],
      flop: [
        { player: target, type: 'check', amount: 0, amountBb: 0, pctPot: 0, potBefore: 90, potAfter: 90 },
        { player: 'villain', type: 'bet', amount: 40, amountBb: 4, pctPot: 44.4, potBefore: 90, potAfter: 130 },
        { player: target, type: 'call', amount: 40, amountBb: 4, pctPot: 30.7, potBefore: 130, potAfter: 170 }
      ],
      turn: [],
      river: []
    },
    showdown: { showCardsByPlayer: {} }
  };

  const parsed = {
    preflop: 'HJ_grexometr r4.5bb / BTN_villain c4.5bb',
    flop: '(9) HJ_grexometr x onKc9h3s / BTN_villain b44.4 / HJ_grexometr c',
    turn: '',
    river: '',
    presupposition: ''
  };

  const runId = beginHhImportRun(dbPath, { sourceType: 'single', fileCount: 1 });
  saveHhParsedRecord(dbPath, {
    runId,
    handHistory: `PokerStars Hand #93000001: 5 Card Omaha Pot Limit (¥5/¥10 CNY) - 2026/02/26 18:18:15 UTC
Table 'CGG_9300001-KrakenDen' 6-max`,
    parsedHH,
    parsed,
    parserVersion,
    targetIdentity: target,
    targetPlayer: target
  });
  finishHhImportRun(dbPath, runId, { handCount: 1, savedCount: 1, failedCount: 0, errors: [] });

  const rowsBefore = getHhProfileRows(dbPath, { opponent: target, limit: 10, filters: {} }).rows;
  assert.equal(rowsBefore.length, 1);
  const row = rowsBefore[0];
  assert.equal(row.manualTurn, '');

  upsertHhManualPresupposition(dbPath, {
    opponent: 'HJ_GREXOMETR',
    room: row.room,
    handNumber: row.handNumber,
    field: 'turn',
    value: 'i gc'
  });

  const rowsAfter = getHhProfileRows(dbPath, { opponent: target, limit: 10, filters: {} }).rows;
  assert.equal(rowsAfter.length, 1);
  assert.equal(rowsAfter[0].manualTurn, 'i gc');
});

test('clearHhHandsByOpponent removes rows that match opponent by action tokens when note identity is unknown', () => {
  const dbPath = makeTempDbPath();
  initHhDb(dbPath);
  const parserVersion = 'test-clear-opponent-like-v1';
  const target = '88luckycat88';

  const runId = beginHhImportRun(dbPath, { sourceType: 'single', fileCount: 1 });
  const parsedHH = {
    blinds: { smallBlind: 10, bigBlind: 20 },
    players: [target, 'happysally'],
    positionsByPlayer: { [target]: 'CO', happysally: 'BB' },
    targetPlayer: target,
    board: { flop: ['Ad', 'Th', 'Td'], turn: '', river: '' },
    events: {
      preflop: [
        { player: target, type: 'raise', amount: 70, amountBb: 3.5, potBefore: 0, potAfter: 70 },
        { player: 'happysally', type: 'call', amount: 50, amountBb: 2.5, potBefore: 70, potAfter: 120 }
      ],
      flop: [
        { player: 'happysally', type: 'check', amount: 0, amountBb: 0, pctPot: 0, potBefore: 120, potAfter: 120 },
        { player: target, type: 'bet', amount: 51.48, amountBb: 2.574, pctPot: 42.9, potBefore: 120, potAfter: 171.48 }
      ],
      turn: [],
      river: []
    },
    showdown: { showCardsByPlayer: {} }
  };
  const parsed = {
    preflop: `CO_${target} r3.5bb / BB_happysally c2.5bb`,
    flop: `(6) BB_happysally x / CO_${target} cb42.9 onAdThTd`,
    turn: '',
    river: '',
    presupposition: ''
  };
  saveHhParsedRecord(dbPath, {
    runId,
    handHistory: `PokerStars Hand #99900001: Omaha Pot Limit (¥10/¥20 CNY) - 2026/02/21 18:18:15 UTC\nTable 'PMS_Cpr_PLO ₮2,000 I - 20490' 7-max`,
    parsedHH,
    parsed,
    parserVersion,
    targetIdentity: 'unknown',
    targetPlayer: target
  });
  finishHhImportRun(dbPath, runId, { handCount: 1, savedCount: 1, failedCount: 0, errors: [] });

  const before = getHhProfileRows(dbPath, { opponent: target, limit: 10, filters: {} }).rows;
  assert.equal(before.length, 1);

  const result = clearHhHandsByOpponent(dbPath, { opponent: target });
  assert.ok(result.notesDeleted >= 1);
  assert.ok(result.handsDeleted >= 1);

  const after = getHhProfileRows(dbPath, { opponent: target, limit: 10, filters: {} }).rows;
  assert.equal(after.length, 0);
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

test('getHhProfileRows supports cards visibility filter (showdown vs known dealt cards)', () => {
  const dbPath = makeTempDbPath();
  initHhDb(dbPath);
  const runId = beginHhImportRun(dbPath, { sourceType: 'batch', fileCount: 2 });

  const saveHand = ({ handNumber, showdownCards, dealtCards }) => {
    saveHhParsedRecord(dbPath, {
      runId,
      handHistory: `PokerStars Hand #${handNumber}:  5 Card Omaha Pot Limit (¥5/¥10 CNY) - 2026/02/23 12:00:00 UTC
Table 'PMS_Cpr_5PLO ₮2,000 II - 22601' 6-max Seat #1 is the button`,
      parsedHH: {
        gameCardCount: 5,
        blinds: { smallBlind: 5, bigBlind: 10 },
        players: ['hero', 'villain'],
        positionsByPlayer: { hero: 'BTN', villain: 'BB' },
        targetPlayer: 'hero',
        board: { flop: ['Ah', '7d', '3c'], turn: '', river: '' },
        events: {
          preflop: [{ player: 'hero', type: 'raise', amount: 35, potBefore: 0, potAfter: 35 }],
          flop: [{ player: 'villain', type: 'fold', potBefore: 35, potAfter: 35 }],
          turn: [],
          river: []
        },
        showdown: {
          showCardsByPlayer: showdownCards ? { hero: showdownCards } : {},
          dealtCardsByPlayer: dealtCards ? { hero: dealtCards } : {}
        }
      },
      parsed: {
        preflop: 'BTN_hero r3.5bb',
        flop: '(3.5) BB_villain f',
        turn: '',
        river: '',
        presupposition: ''
      },
      parserVersion: 'test-cards-filter-v1',
      targetIdentity: 'hero',
      targetPlayer: 'hero'
    });
  };

  saveHand({
    handNumber: '5000001',
    showdownCards: ['As', 'Kd', 'Qh', 'Jc', '9s'],
    dealtCards: ['As', 'Kd', 'Qh', 'Jc', '9s']
  });
  saveHand({
    handNumber: '5000002',
    showdownCards: null,
    dealtCards: ['Ah', 'Ad', 'Js', 'Tc', '9h']
  });

  const allRows = getHhProfileRows(dbPath, { opponent: 'hero', filters: {} });
  assert.equal(allRows.rows.length, 2);

  const showdownOnly = getHhProfileRows(dbPath, { opponent: 'hero', filters: { cardsVisibility: 'showdown' } });
  assert.equal(showdownOnly.rows.length, 1);
  assert.equal(showdownOnly.rows[0].handNumber, '5000001');

  const allKnown = getHhProfileRows(dbPath, { opponent: 'hero', filters: { cardsVisibility: 'known' } });
  assert.equal(allKnown.rows.length, 2);

  const invalidMode = getHhProfileRows(dbPath, { opponent: 'hero', filters: { cardsVisibility: 'invalid-mode' } });
  assert.equal(invalidMode.rows.length, 2);
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
