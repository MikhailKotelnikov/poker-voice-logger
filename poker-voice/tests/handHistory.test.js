import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHandHistoryContext,
  canonicalizeHandHistoryUnits,
  enrichHandHistoryParsed,
  parseHandHistory
} from '../src/handHistory.js';

const SAMPLE_HH = `
PokerStars Hand #1423128345:  5 Card Omaha Pot Limit (¥3/¥6 CNY) - 2026/02/16 21:04:07 UTC
Table 'CGG_9314388-KrakenDen' 6-max Seat #4 is the button
Seat 1: 70996646 (¥1656.77 in chips)
Seat 2: 18487241 (¥2138 in chips)
Seat 3: 77031840 (¥4649.97 in chips)
Seat 4: 13807908 (¥3379.60 in chips)
Seat 5: 86761294 (¥1199.28 in chips)
Seat 6: 10769188 (¥6784.66 in chips)
86761294: posts the ante ¥6
10769188: posts the ante ¥6
70996646: posts the ante ¥6
18487241: posts the ante ¥6
77031840: posts the ante ¥6
13807908: posts the ante ¥6
86761294: posts small blind ¥3
10769188: posts big blind ¥6
86761294: posts straddle ¥9
*** HOLE CARDS ***
10769188: calls ¥6
70996646: calls ¥12
18487241: folds
77031840: calls ¥12
13807908: folds
86761294: raises ¥84 to ¥96
10769188: calls ¥84
70996646: folds
77031840: calls ¥84
*** FLOP *** [Kc 9d 6s]
86761294: bets ¥252
10769188: folds
77031840: calls ¥252
*** TURN *** [Kc 9d 6s] [7d]
86761294: checks
77031840: checks
*** RIVER *** [Kc 9d 6s 7d] [9h]
86761294: checks
77031840: checks
*** SHOW DOWN ***
86761294: shows [Qh Jc Td Tc 8c]
77031840: shows [Ks 6c 5s 5h 4d]
`.trim();

test('parseHandHistory extracts blinds target and pot-based sizing context', () => {
  const parsed = parseHandHistory(SAMPLE_HH, 'ThatWas 86761294');

  assert.equal(parsed.blinds.smallBlind, 3);
  assert.equal(parsed.blinds.bigBlind, 6);
  assert.equal(parsed.targetPlayer, '86761294');
  assert.deepEqual(parsed.board.flop, ['Kc', '9d', '6s']);
  assert.equal(parsed.board.turn, '7d');
  assert.equal(parsed.board.river, '9h');
  assert.deepEqual(parsed.targetCards, ['Qh', 'Jc', 'Td', 'Tc', '8c']);

  assert.equal(parsed.streetStartPot.flop, 336);
  assert.equal(parsed.streetStartPot.turn, 840);
  assert.equal(parsed.streetStartPot.river, 840);
  assert.equal(parsed.showdown.mandatory, true);
  assert.equal(parsed.showdown.targetStreetClass.flop, 'p');
  assert.equal(parsed.showdown.targetStreetClass.turn, 'nutstr');
  assert.equal(parsed.showdown.targetStreetClass.river, 'str');
  assert.equal(parsed.showdown.opponentStreetClass.flop, '2p');
  assert.equal(parsed.showdown.opponentStreetClass.turn, '2p');
  assert.equal(parsed.showdown.opponentStreetClass.river, '2p');

  const flopBet = parsed.events.flop.find((event) => event.player === '86761294' && event.type === 'bet');
  assert.ok(flopBet);
  assert.equal(flopBet.amount, 252);
  assert.equal(flopBet.amountBb, 42);
  assert.equal(flopBet.pctPot, 75);
});

test('buildHandHistoryContext renders TARGET/OTHER summary', () => {
  const parsed = parseHandHistory(SAMPLE_HH, 'ThatWas 86761294');
  const context = buildHandHistoryContext(parsed);
  assert.match(context, /target_player=86761294/);
  assert.match(context, /blinds=SB:3 BB:6/);
  assert.match(context, /TARGET:86761294 b 252 \(42bb, 75%pot\)/);
  assert.match(context, /showdown_mode=mandatory/);
  assert.match(context, /target_class_by_street=flop:p turn:nutstr river:str/);
});

test('canonicalizeHandHistoryUnits converts chips to bb/pre and pct postflop', () => {
  const parsed = parseHandHistory(SAMPLE_HH, 'ThatWas 86761294');
  const canonical = canonicalizeHandHistoryUnits(
    {
      preflop: 'r96',
      flop: 'cb252',
      turn: 'x',
      river: 'x',
      presupposition: ''
    },
    parsed
  );
  assert.equal(canonical.preflop, 'r16bb');
  assert.equal(canonical.flop, 'cb75');
});

test('enrichHandHistoryParsed removes showed on mandatory showdown and appends cards/classes', () => {
  const parsed = parseHandHistory(SAMPLE_HH, 'ThatWas 86761294');
  const enriched = enrichHandHistoryParsed(
    {
      preflop: 'r16bb',
      flop: 'cb75',
      turn: 'x/x',
      river: 'x showed',
      presupposition: ''
    },
    parsed
  );

  assert.equal(/\bshow(?:ed)?\b/i.test(enriched.river), false);
  assert.match(enriched.flop, /\bQhJcTdTc8c_p\b/);
  assert.match(enriched.flop, /\bKs6c5s5h4d_2p\b/);
  assert.match(enriched.turn, /\bQhJcTdTc8c_nutstr\b/);
  assert.match(enriched.turn, /\bKs6c5s5h4d_2p\b/);
  assert.match(enriched.turn, /\[z\]/);
  assert.match(enriched.river, /\[potctrl\]/);
  assert.match(enriched.flop, /\bonKc9d6s\b/);
  assert.match(enriched.river, /\bsd\b/);
  assert.equal(/\btcards_[a-z0-9]+\b/i.test(enriched.river), false);
  assert.equal(/\bvcards_[a-z0-9]+\b/i.test(enriched.river), false);
});

test('enrichHandHistoryParsed keeps showed when reveal is voluntary (no mandatory showdown)', () => {
  const hh = `
PokerStars Hand #1:  5 Card Omaha Pot Limit (¥3/¥6 CNY)
Seat 1: 11111111 (¥1000 in chips)
Seat 2: 22222222 (¥1000 in chips)
11111111: posts small blind ¥3
22222222: posts big blind ¥6
*** HOLE CARDS ***
11111111: raises ¥12 to ¥18
22222222: calls ¥12
*** FLOP *** [Ac Kd 7h]
11111111: bets ¥18
22222222: folds
11111111: shows [Ah As Td 9c 4d]
`.trim();

  const parsed = parseHandHistory(hh, '11111111');
  const enriched = enrichHandHistoryParsed(
    {
      preflop: 'r3bb',
      flop: 'cb100',
      turn: '',
      river: 'showed',
      presupposition: ''
    },
    parsed
  );

  assert.equal(parsed.showdown.mandatory, false);
  assert.match(enriched.river, /\bshowed\b/i);
});
