import test from 'node:test';
import assert from 'node:assert/strict';

import { parseHandHistory } from '../src/handHistory.js';
import { buildHandVisualModel } from '../src/handVisual.js';

const SAMPLE_HH = `
PokerStars Hand #721173495:  5 Card Omaha Pot Limit (¥3/¥6 CNY) - 2025/02/12 03:13:46 UTC
Table 'CGG_4445111' 6-max Seat #1 is the button
Seat 1: 56962166 (¥1447.92 in chips)
Seat 2: 98326617 (¥2418.01 in chips)
Seat 3: 86761294 (¥1533.30 in chips)
Seat 4: 30661053 (¥1517.25 in chips)
Seat 5: 68309904 (¥3464.61 in chips)
Seat 6: 68161254 (¥1912.58 in chips)
# {"gt":"PLO5","tid":4445111}
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

test('buildHandVisualModel returns structured visual flow', () => {
  const parsed = parseHandHistory(SAMPLE_HH, '86761294');
  const visual = buildHandVisualModel(SAMPLE_HH, parsed);

  assert.equal(visual.meta.game, 'Omaha5');
  assert.equal(visual.meta.limit, 'PL600');
  assert.equal(visual.meta.bb, '6');
  assert.equal(visual.heroCards.length, 5);

  assert.equal(visual.preflop.actions[0].pos, 'BTN');
  assert.equal(visual.preflop.actions[0].label, 'R11');
  assert.equal(visual.preflop.actions[1].hero, true);
  assert.equal(visual.preflop.actions[1].label, 'C10');

  const turn = visual.streets.find((item) => item.id === 'turn');
  assert.ok(turn);
  assert.equal(turn.actions[0].hero, true);
  assert.equal(turn.actions[0].label, 'B9');
  assert.equal(turn.actions[1].label, 'R57 (6x)');
  assert.equal(turn.actions[2].hero, true);
  assert.equal(turn.actions[2].label, 'C47');
});
