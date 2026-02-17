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

const SAMPLE_HH_ORDER_AND_RAISE_X = `
PokerStars Hand #721173495:  5 Card Omaha Pot Limit (¥3/¥6 CNY) - 2025/02/12 03:13:46 UTC
Table 'CGG_4445111' 6-max Seat #1 is the button
Seat 1: 56962166 (¥1447.92 in chips)
Seat 2: 98326617 (¥2418.01 in chips)
Seat 3: 86761294 (¥1533.30 in chips)
Seat 4: 30661053 (¥1517.25 in chips)
Seat 5: 68309904 (¥3464.61 in chips)
Seat 6: 68161254 (¥1912.58 in chips)
98326617: posts the ante ¥6
86761294: posts the ante ¥6
30661053: posts the ante ¥6
68309904: posts the ante ¥6
68161254: posts the ante ¥6
56962166: posts the ante ¥6
98326617: posts small blind ¥3
86761294: posts big blind ¥6
*** HOLE CARDS ***
30661053: folds
68309904: calls ¥6
68161254: folds
56962166: raises ¥57 to ¥63
98326617: folds
86761294: calls ¥57
68309904: folds
*** FLOP *** [Jh Ad 8s]
86761294: checks
56962166: checks
*** TURN *** [Jh Ad 8s] [Ks]
86761294: bets ¥56.43
56962166: raises ¥283.86 to ¥340.29
86761294: calls ¥283.86
*** RIVER *** [Jh Ad 8s Ks] [9s]
86761294: checks
56962166: checks
*** SHOW DOWN ***
56962166: shows [Qc Ts Th 8c 6h]
86761294: shows [Ah Kd Kh 7s 2h]
`.trim();

const SAMPLE_HH_PREFLOP_SEQUENCE_WITH_TARGET_IN_MIDDLE = `
PokerStars Hand #1382168581:  5 Card Omaha Pot Limit (¥3/¥6 CNY) - 2026/01/26 14:57:31 UTC
Table 'CGG_8980282-Kraken Den' 6-max Seat #4 is the button
Seat 1: 75048768 (¥32086.87 in chips)
Seat 2: 90061319 (¥3498.60 in chips)
Seat 3: 15398580 (¥3408.47 in chips)
Seat 4: 56962166 (¥2139.02 in chips)
Seat 5: 86761294 (¥2220.60 in chips)
Seat 6: 14461705 (¥6288.02 in chips)
86761294: posts the ante ¥6
14461705: posts the ante ¥6
75048768: posts the ante ¥6
90061319: posts the ante ¥6
15398580: posts the ante ¥6
56962166: posts the ante ¥6
86761294: posts small blind ¥3
14461705: posts big blind ¥6
14461705: posts straddle ¥6
*** HOLE CARDS ***
75048768: folds
90061319: calls ¥12
15398580: calls ¥12
56962166: raises ¥87 to ¥99
86761294: calls ¥96
14461705: calls ¥87
90061319: folds
15398580: calls ¥87
*** FLOP *** [9s Js 3c]
86761294: checks
14461705: checks
15398580: checks
56962166: checks
*** TURN *** [9s Js 3c] [Ad]
86761294: bets ¥333
14461705: folds
15398580: folds
56962166: calls ¥333
*** RIVER *** [9s Js 3c Ad] [4s]
86761294: bets ¥555
56962166: calls ¥555
*** SHOW DOWN ***
86761294: shows [Ah Ks Kd Qd 8d]
56962166: shows [Qs 9h 8c 6h 3s]
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
  assert.match(enriched.preflop, /^5c straddle SB_HE r16bb /);
  assert.match(enriched.flop, /^SB_HE cb75 /);
  assert.match(enriched.flop, /\bQhJcTdTc8c_p_wrap\b/);
  assert.equal(/\bQhJcTdTc8c_p_(?:fd|nfd)\b/i.test(enriched.flop), false);
  assert.match(enriched.flop, /\bKs6c5s5h4d_2p\b/);
  assert.equal(/\bKs6c5s5h4d_2p_(?:fd|nfd)\b/i.test(enriched.flop), false);
  assert.match(enriched.turn, /\bQhJcTdTc8c_nutstr/);
  assert.match(enriched.turn, /\bKs6c5s5h4d_2p/);
  assert.match(enriched.turn, /\[z\]/);
  assert.match(enriched.river, /\[potctrl\]/);
  assert.match(enriched.flop, /\bonKc9d6s\b/);
  assert.equal(/\bsd\b/i.test(enriched.river), false);
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

test('enrichHandHistoryParsed keeps fd on two-suited board when player has two cards of suit', () => {
  const hh = `
PokerStars Hand #2:  5 Card Omaha Pot Limit (¥3/¥6 CNY)
Seat 1: 11111111 (¥1000 in chips)
Seat 2: 22222222 (¥1000 in chips)
11111111: posts small blind ¥3
22222222: posts big blind ¥6
*** HOLE CARDS ***
11111111: raises ¥12 to ¥18
22222222: calls ¥12
*** FLOP *** [Kc 9c 6s]
11111111: bets ¥18
22222222: calls ¥18
*** TURN *** [Kc 9c 6s] [2d]
11111111: checks
22222222: checks
*** RIVER *** [Kc 9c 6s 2d] [3h]
11111111: checks
22222222: checks
*** SHOW DOWN ***
11111111: shows [Ac Jc Td Tc 8d]
22222222: shows [Ks 6d 5s 5h 4d]
`.trim();

  const parsed = parseHandHistory(hh, '11111111');
  const enriched = enrichHandHistoryParsed(
    { preflop: '', flop: '', turn: '', river: '', presupposition: '' },
    parsed
  );

  assert.match(enriched.flop, /\bAcJcTdTc8d_[a-z0-9_]*nfd[a-z0-9_]*\b/i);
});

test('enrichHandHistoryParsed keeps preflop order from last aggressor and uses raise multiplier token postflop', () => {
  const parsed = parseHandHistory(SAMPLE_HH_ORDER_AND_RAISE_X, '86761294');
  const enriched = enrichHandHistoryParsed(
    { preflop: '', flop: '', turn: '', river: '', presupposition: '' },
    parsed
  );

  assert.match(enriched.preflop, /^BTN r10.5bb QcTsTh8c6h \/ BB_HE c9.5bb AhKdKh7s2h$/);
  assert.equal(/\bHJ c1bb\b/.test(enriched.preflop), false);
  assert.match(enriched.turn, /\bBB_HE b34.2\b/);
  assert.match(enriched.turn, /\bBTN r6x\b/);
  assert.equal(/\br153\.68\b/.test(enriched.turn), false);
});

test('enrichHandHistoryParsed keeps target action in natural preflop order between callers', () => {
  const parsed = parseHandHistory(SAMPLE_HH_PREFLOP_SEQUENCE_WITH_TARGET_IN_MIDDLE, '86761294');
  const enriched = enrichHandHistoryParsed(
    { preflop: '', flop: '', turn: '', river: '', presupposition: '' },
    parsed
  );

  assert.match(
    enriched.preflop,
    /^BTN r16\.5bb Qs9h8c6h3s \/ SB_HE c16bb AhKsKdQd8d \/ BB c14\.5bb \/ CO c14\.5bb$/
  );
});
