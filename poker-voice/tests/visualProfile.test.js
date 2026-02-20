import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __testables,
  buildOpponentVisualProfile
} from '../src/visualProfile.js';

test('visual profile bucket detection maps sizing and miss', () => {
  assert.equal(__testables.detectBucket('cb25 weak'), '2');
  assert.equal(__testables.detectBucket('b40 wrap'), '3');
  assert.equal(__testables.detectBucket('b52 set'), '5');
  assert.equal(__testables.detectBucket('b60 set'), '6');
  assert.equal(__testables.detectBucket('b80 set'), '7');
  assert.equal(__testables.detectBucket('b100 nuts'), 'P');
  assert.equal(__testables.detectBucket('x/x miss'), 'Miss');
  assert.equal(__testables.detectBucket('b0 onAhKd2c'), null);
});

test('visual profile builder aggregates sections and strengths', () => {
  const rows = [
    { flop: 'cb25 weak', turn: '', river: '' },
    { flop: 'cb75 nutstr 3w', turn: '', river: '' },
    { flop: '', turn: 'tp50 wrap 3w', river: '' },
    { flop: '', turn: '', river: 'bbb100 nutfull' },
    { flop: '', turn: '', river: 'b75 fd' },
    { flop: '', turn: '', river: 'x/x miss' }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'test-op' });
  assert.equal(profile.opponent, 'test-op');
  assert.equal(profile.totalRows, 6);

  const flop = profile.sections.find((section) => section.id === 'flop');
  const probes = profile.sections.find((section) => section.id === 'probes');
  const betbetbet = profile.sections.find((section) => section.id === 'betbetbet');
  const total = profile.sections.find((section) => section.id === 'tot');

  const flopHu2 = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '2');
  assert.equal(flopHu2.total, 1);
  assert.equal(flopHu2.counts.weak, 1);

  const flopMw7 = flop.groups.find((group) => group.id === 'MW').rows.find((row) => row.bucket === '7');
  assert.equal(flopMw7.total, 1);
  assert.equal(flopMw7.counts.nuts, 1);

  const probeMw5 = probes.groups.find((group) => group.id === 'MW').rows.find((row) => row.bucket === '5');
  assert.equal(probeMw5.total, 1);

  const bbbPot = betbetbet.groups[0].rows.find((row) => row.bucket === 'P');
  assert.equal(bbbPot.total, 1);
  assert.equal(bbbPot.counts.nuts, 1);

  const totalMiss = total.groups[0].rows.find((row) => row.bucket === 'Miss');
  assert.equal(totalMiss.total, 1);
});

test('visual profile filters HH street actions to selected target actor id', () => {
  const rows = [
    {
      flop: 'SB_85033665 cb8.7 AhAcKd9d4h_set / BB_12121116 c on4cQc4d KhJs9s8c7c_p_fd',
      turn: '',
      river: ''
    },
    {
      flop: 'BB_12121116 cb75 KhJs9s8c7c_p on4cQc4d / SB_85033665 f',
      turn: '',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: '12121116' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const flopHu7 = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '7');
  const flopHu2 = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '2');

  assert.equal(flopHu7.total, 1);
  assert.equal(flopHu2.total, 0);
});

test('visual profile keeps duplicate tooltip samples when bucket count has repeated texts', () => {
  const rows = [
    {
      rowLabel: '#Sheet2:10',
      flop: 'BB_12121116 cb33 KhJs9s8c7c_p on4cQc4d / SB_85033665 f'
    },
    {
      rowLabel: '#Sheet2:10',
      flop: 'BB_12121116 cb33 KhJs9s8c7c_p on4cQc4d / SB_85033665 f'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: '12121116' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const flopHu3 = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '3');

  assert.equal(flopHu3.total, 2);
  assert.equal(flopHu3.samples.weak.length, 2);
});

test('visual profile keeps all tooltip samples for bucket (no silent cap)', () => {
  const rows = Array.from({ length: 9 }, (_, index) => ({
    rowLabel: `#Sheet2:${index + 1}`,
    flop: 'BB_12121116 cb33 KhJs9s8c7c_p on4cQc4d / SB_85033665 f'
  }));

  const profile = buildOpponentVisualProfile(rows, { opponent: '12121116' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const flopHu3 = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '3');

  assert.equal(flopHu3.total, 9);
  assert.equal(flopHu3.samples.weak.length, 9);
});

test('visual profile filters HH street actions by text identity when opponent has no numeric id', () => {
  const rows = [
    {
      flop: '(8.2) BB_spirituallybroken cb47.5 on3h3sQc',
      turn: '',
      river: ''
    },
    {
      flop: '(8.2) BB_other cb47.5 on3h3sQc / SB_spirituallybroken c',
      turn: '',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const flopHu5 = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '5');

  assert.equal(flopHu5.total, 1);
});

test('visual profile treats flop as MW when more than 2 actors are present', () => {
  const rows = [
    {
      flop: '(33.2) BB_v0 x onJh8d4d / UTG_v1 x / CO_hero cb70 / BTN_v3 c'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'hero' });
  const flopSection = profile.sections.find((section) => section.id === 'flop');
  const mw7 = flopSection.groups.find((group) => group.id === 'MW').rows.find((row) => row.bucket === '7');
  const hu7 = flopSection.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '7');

  assert.equal(mw7.total, 1);
  assert.equal(hu7.total, 0);
});

test('visual profile fills betbet on turn when same target has flop bet and turn bet', () => {
  const rows = [
    {
      flop: '(11.7) UTG_spirituallybroken cb77 onQhTs5s / BTN_other c',
      turn: '(24.6) UTG_spirituallybroken b58 onQhTs5s4c / BTN_other c',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const betbet = profile.sections.find((section) => section.id === 'betbet');
  const bucket6 = betbet.groups[0].rows.find((row) => row.bucket === '6');

  assert.equal(bucket6.total, 1);
});

test('visual profile fills probes on turn when target checked flop then bet turn', () => {
  const rows = [
    {
      flop: '(11.7) UTG_spirituallybroken x onQhTs5s / BTN_other x',
      turn: '(24.6) UTG_spirituallybroken b58 onQhTs5s4c / BTN_other c',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const probes = profile.sections.find((section) => section.id === 'probes');
  const bucket6 = probes.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '6');

  assert.equal(bucket6.total, 1);
});

test('visual profile marks no-showdown target action as unknown strength (white)', () => {
  const rows = [
    {
      flop: '(11.7) UTG_spirituallybroken cb50 onQhTs5s / BTN_other c',
      turn: '',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const bucket5 = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '5');

  assert.equal(bucket5.total, 1);
  assert.equal(bucket5.counts.unknown, 1);
  assert.equal(bucket5.counts.weak, 0);
});
