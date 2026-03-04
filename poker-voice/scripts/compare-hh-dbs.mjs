#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_BASELINE_DB = path.resolve(process.cwd(), 'data', 'hh.db');
const DEFAULT_QUALITY_DB = path.resolve(process.cwd(), 'data', 'hh.quality-first.db');

const TABLE_SPECS = [
  {
    name: 'hh_hands',
    keyFields: ['parser_version', 'raw_hash'],
    query: `
      SELECT
        h.parser_version,
        h.raw_hash,
        lower(COALESCE(h.room, '')) AS room,
        COALESCE(h.hand_number, '') AS hand_number,
        COALESCE(h.table_name, '') AS table_name,
        COALESCE(h.game_type, '') AS game_type,
        COALESCE(h.game_card_count, -1) AS game_card_count,
        COALESCE(h.sb, 0) AS sb,
        COALESCE(h.bb, 0) AS bb,
        COALESCE(h.limit_text, '') AS limit_text,
        COALESCE(h.ante, 0) AS ante,
        COALESCE(h.straddle_total, 0) AS straddle_total,
        COALESCE(h.active_players_count, 0) AS active_players_count,
        COALESCE(h.final_pot_bb, 0) AS final_pot_bb,
        COALESCE(h.played_at_utc, '') AS played_at_utc,
        COALESCE(h.raw_text, '') AS raw_text
      FROM hh_hands h
      ORDER BY h.parser_version, h.raw_hash
    `
  },
  {
    name: 'hh_notes',
    keyFields: ['parser_version', 'raw_hash', 'target_identity'],
    query: `
      SELECT
        n.parser_version,
        h.raw_hash,
        lower(COALESCE(n.target_identity, '')) AS target_identity,
        COALESCE(tp.player_key, '') AS target_player_key,
        COALESCE(n.preflop, '') AS preflop,
        COALESCE(n.flop, '') AS flop,
        COALESCE(n.turn, '') AS turn,
        COALESCE(n.river, '') AS river,
        COALESCE(n.presupposition, '') AS presupposition
      FROM hh_notes n
      JOIN hh_hands h ON h.id = n.hand_id
      LEFT JOIN hh_players tp ON tp.id = n.target_player_id
      ORDER BY n.parser_version, h.raw_hash, n.target_identity
    `
  },
  {
    name: 'hh_hand_players',
    keyFields: ['parser_version', 'raw_hash', 'player_key'],
    query: `
      SELECT
        h.parser_version,
        h.raw_hash,
        COALESCE(p.player_key, '') AS player_key,
        COALESCE(hp.position, '') AS position,
        COALESCE(hp.is_target_candidate, 0) AS is_target_candidate,
        COALESCE(hp.showdown_cards, '') AS showdown_cards,
        COALESCE(hp.dealt_cards, '') AS dealt_cards
      FROM hh_hand_players hp
      JOIN hh_hands h ON h.id = hp.hand_id
      JOIN hh_players p ON p.id = hp.player_id
      ORDER BY h.parser_version, h.raw_hash, p.player_key
    `
  },
  {
    name: 'hh_events',
    keyFields: ['parser_version', 'raw_hash', 'street', 'seq'],
    query: `
      SELECT
        h.parser_version,
        h.raw_hash,
        e.street,
        e.seq,
        COALESCE(p.player_key, '') AS actor_player_key,
        COALESCE(e.action, '') AS action,
        COALESCE(e.size_bb, -999999) AS size_bb,
        COALESCE(e.size_pct_pot, -999999) AS size_pct_pot,
        COALESCE(e.is_allin, 0) AS is_allin,
        COALESCE(e.pot_before_bb, -999999) AS pot_before_bb,
        COALESCE(e.pot_after_bb, -999999) AS pot_after_bb,
        COALESCE(e.board_cards, '') AS board_cards,
        COALESCE(e.extra_json, '{}') AS extra_json
      FROM hh_events e
      JOIN hh_hands h ON h.id = e.hand_id
      LEFT JOIN hh_players p ON p.id = e.actor_player_id
      ORDER BY h.parser_version, h.raw_hash, e.street, e.seq
    `
  },
  {
    name: 'hh_manual_presupp',
    keyFields: ['target_identity', 'room', 'hand_number'],
    query: `
      SELECT
        lower(COALESCE(target_identity, '')) AS target_identity,
        lower(COALESCE(room, '')) AS room,
        COALESCE(hand_number, '') AS hand_number,
        COALESCE(preflop, '') AS preflop,
        COALESCE(flop, '') AS flop,
        COALESCE(turn, '') AS turn,
        COALESCE(river, '') AS river,
        COALESCE(hand_presupposition, '') AS hand_presupposition
      FROM hh_manual_presupp
      ORDER BY target_identity, room, hand_number
    `
  },
  {
    name: 'hh_manual_action_timing',
    keyFields: ['target_identity', 'room', 'hand_number', 'street', 'action_index'],
    query: `
      SELECT
        lower(COALESCE(target_identity, '')) AS target_identity,
        lower(COALESCE(room, '')) AS room,
        COALESCE(hand_number, '') AS hand_number,
        COALESCE(street, '') AS street,
        COALESCE(action_index, -1) AS action_index,
        COALESCE(action_key, '') AS action_key,
        COALESCE(timing_label, '') AS timing_label
      FROM hh_manual_action_timing
      ORDER BY target_identity, room, hand_number, street, action_index
    `
  }
];

function parseArgs(argv = []) {
  const args = [...argv];
  let left = '';
  let right = '';
  let limit = 25;

  const readValue = (index) => (index + 1 < args.length ? String(args[index + 1] || '').trim() : '');

  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i] || '').trim();
    if (!arg) continue;
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }
    if (arg === '--left' || arg === '-l') {
      left = readValue(i);
      i += 1;
      continue;
    }
    if (arg === '--right' || arg === '-r') {
      right = readValue(i);
      i += 1;
      continue;
    }
    if (arg === '--limit') {
      const parsed = Number(readValue(i));
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.trunc(parsed);
      }
      i += 1;
      continue;
    }
  }

  return {
    help: false,
    left: left || process.env.HH_COMPARE_LEFT || DEFAULT_BASELINE_DB,
    right: right || process.env.HH_COMPARE_RIGHT || DEFAULT_QUALITY_DB,
    limit
  };
}

function normalizeNumber(value) {
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(8));
}

function normalizeRow(row = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'number') {
      normalized[key] = normalizeNumber(value);
    } else if (value == null) {
      normalized[key] = '';
    } else {
      normalized[key] = String(value);
    }
  }
  return normalized;
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const sorted = Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = value[key];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

function readRowsAsFrequencyMap(db, spec) {
  const rows = db.prepare(spec.query).all().map(normalizeRow);
  const frequency = new Map();
  for (const row of rows) {
    const signature = stableStringify(row);
    frequency.set(signature, Number(frequency.get(signature) || 0) + 1);
  }
  return { rowCount: rows.length, frequency };
}

function compareFrequencies(leftFrequency, rightFrequency, limit = 25) {
  const deltas = [];

  for (const [signature, leftCount] of leftFrequency.entries()) {
    const rightCount = Number(rightFrequency.get(signature) || 0);
    if (leftCount !== rightCount && deltas.length < limit) {
      deltas.push({
        signature,
        leftCount,
        rightCount
      });
    }
  }

  for (const [signature, rightCount] of rightFrequency.entries()) {
    if (leftFrequency.has(signature)) continue;
    if (deltas.length < limit) {
      deltas.push({
        signature,
        leftCount: 0,
        rightCount
      });
    }
  }

  return {
    deltas,
    equal: deltas.length === 0
  };
}

function assertReadableFile(filePath, label) {
  if (!filePath) throw new Error(`${label}: путь не задан.`);
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`${label}: файл не найден (${resolved}).`);
  }
  return resolved;
}

function printUsage() {
  console.log('Usage: node scripts/compare-hh-dbs.mjs --left <baseline.db> --right <quality.db> [--limit 25]');
  console.log(`Defaults: left=${DEFAULT_BASELINE_DB}, right=${DEFAULT_QUALITY_DB}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const leftPath = assertReadableFile(args.left, 'Baseline DB');
  const rightPath = assertReadableFile(args.right, 'Quality DB');
  const limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.trunc(args.limit) : 25;

  const leftDb = new DatabaseSync(leftPath);
  const rightDb = new DatabaseSync(rightPath);
  let hasDiff = false;

  console.log(`Comparing HH DBs`);
  console.log(`left:  ${leftPath}`);
  console.log(`right: ${rightPath}`);
  console.log('');

  for (const spec of TABLE_SPECS) {
    const leftData = readRowsAsFrequencyMap(leftDb, spec);
    const rightData = readRowsAsFrequencyMap(rightDb, spec);
    const compared = compareFrequencies(leftData.frequency, rightData.frequency, limit);
    const rowCountMismatch = leftData.rowCount !== rightData.rowCount;
    if (!compared.equal || rowCountMismatch) {
      hasDiff = true;
    }

    console.log(`[${spec.name}] left_rows=${leftData.rowCount} right_rows=${rightData.rowCount}`);
    if (compared.equal && !rowCountMismatch) {
      console.log('  status: equal');
      continue;
    }

    console.log('  status: diff');
    if (compared.deltas.length) {
      console.log('  row frequency delta (sample):');
      compared.deltas.forEach((item) => {
        console.log(`    - left_count=${item.leftCount} right_count=${item.rightCount}`);
        console.log(`      row=${item.signature}`);
      });
    }
  }

  if (hasDiff) {
    console.log('\nResult: DIFF detected.');
    process.exit(1);
  }

  console.log('\nResult: DBs are equal for compared HH tables.');
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}
