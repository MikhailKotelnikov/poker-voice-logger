import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractTargetIdHint,
  extractTargetIdentity,
  rowMatchesTargetProfile
} from '../src/profileTarget.js';

test('extractTargetIdentity prefers numeric id hint, else normalized nickname', () => {
  assert.equal(extractTargetIdHint('ThatWas 86761294'), '86761294');
  assert.equal(extractTargetIdentity('ThatWas 86761294'), '86761294');
  assert.equal(extractTargetIdentity('Spiritually Broken'), 'spirituallybroken');
});

test('rowMatchesTargetProfile matches HH rows by actor identity in postflop streets', () => {
  const row = {
    nickname: 'HH',
    preflop: 'HJ_Thirstywhale r3.5bb / SB_spirituallybroken c3.5bb',
    flop: '(12.7) SB_spirituallybroken cb47.5 onTc9dKs',
    turn: '(24.76) SB_spirituallybroken x / CO_Wernonn b0',
    river: '(40.58) SB_spirituallybroken x'
  };

  assert.equal(rowMatchesTargetProfile(row, 'spirituallybroken', 'spirituallybroken'), true);
  assert.equal(rowMatchesTargetProfile(row, 'wernonn', 'wernonn'), true);
  assert.equal(rowMatchesTargetProfile(row, 'nonexisting', 'nonexisting'), false);
});

test('rowMatchesTargetProfile ignores preflop-only rows with no target contribution action', () => {
  const rowOnlyPassive = {
    nickname: 'HH',
    preflop: 'BTN_other r5bb / SB_spirituallybroken f',
    flop: '',
    turn: '',
    river: ''
  };
  const rowWithContribution = {
    nickname: 'HH',
    preflop: 'BTN_other r5bb / SB_spirituallybroken c4bb',
    flop: '',
    turn: '',
    river: ''
  };

  assert.equal(rowMatchesTargetProfile(rowOnlyPassive, 'spirituallybroken', 'spirituallybroken'), false);
  assert.equal(rowMatchesTargetProfile(rowWithContribution, 'spirituallybroken', 'spirituallybroken'), true);
});
