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
  assert.equal(__testables.detectBucket('x / r5x onAhKd2c'), null);
});

test('visual profile action summary detects street action kinds', () => {
  const summary = __testables.extractStreetActionSummary('(24.6) SB_player cb96.75 AhKdQcJcTc_set / SB_player c allin');
  assert.equal(summary.hasAction, true);
  assert.equal(summary.hasBet, true);
  assert.equal(summary.hasCall, true);
  assert.equal(summary.hasFold, false);
  assert.equal(summary.bucket, 'P');
  assert.equal(summary.firstBetAllIn, false);
});

test('visual profile action summary marks direct all-in on first bet action', () => {
  const summary = __testables.extractStreetActionSummary('(24.6) SB_player cb96.75 allin AhKdQcJcTc_set / BTN_other f');
  assert.equal(summary.hasAction, true);
  assert.equal(summary.hasBet, true);
  assert.equal(summary.bucket, 'P');
  assert.equal(summary.firstBetAllIn, true);
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

test('visual profile fills probes miss when target checked flop and skipped turn probe', () => {
  const rows = [
    {
      flop: '(11.7) UTG_spirituallybroken x onQhTs5s / BTN_other x',
      turn: '(24.6) UTG_spirituallybroken x onQhTs5s4c / BTN_other b58',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const probes = profile.sections.find((section) => section.id === 'probes');
  const miss = probes.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === 'Miss');

  assert.equal(miss.total, 1);
});

test('visual profile stores all-in counts in dedicated lane and keeps sample meta', () => {
  const rows = [
    {
      rowLabel: '#DB:501',
      handNumber: '1413806286',
      room: 'cpr',
      gameType: 'PLO5',
      gameCardCount: 5,
      sb: 5,
      bb: 10,
      activePlayersCount: 3,
      finalPotBb: 243,
      playedAtUtc: '2026-02-11T21:42:00Z',
      flop: '(11.7) UTG_spirituallybroken b58 allin onQhTs5s / BTN_other c',
      turn: '',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const bucket6 = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '6');
  assert.equal(bucket6.total, 1);
  assert.equal(bucket6.allInTotal, 1);
  assert.equal(bucket6.normalTotal, 0);
  assert.equal(bucket6.countsAllIn.unknown, 1);

  const sampleRaw = bucket6.samplesAllIn.all[0];
  const sample = JSON.parse(sampleRaw);
  assert.equal(sample.type, 'profile_sample_v2');
  assert.equal(sample.meta.handNumber, '1413806286');
  assert.equal(sample.meta.game, 'PLO5');
  assert.equal(sample.meta.activePlayers, 3);
});

test('visual profile keeps flop bucket in normal lane when all-in is only a later call', () => {
  const rows = [
    {
      rowLabel: '#DB:4196',
      flop: '(26) SB_target cb98.27 AhKdQcJcTc_set / BTN_other r4x / SB_target c allin'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'target' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const bucketP = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === 'P');
  assert.equal(bucketP.total, 1);
  assert.equal(bucketP.normalTotal, 1);
  assert.equal(bucketP.allInTotal, 0);
});

test('visual profile stores turn BetBet direct all-in bets in dedicated all-in lane', () => {
  const rows = [
    {
      flop: '(18.2) SB_target b96.7 AhKdQcJcTc_set onKc6h5s / BB_other c',
      turn: '(92.39) SB_target b97.89 allin AhKdQcJcTc_set onKc6h5sQd / BB_other c',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'target' });
  const betbet = profile.sections.find((section) => section.id === 'betbet');
  const bucketP = betbet.groups[0].rows.find((row) => row.bucket === 'P');
  assert.equal(bucketP.total, 1);
  assert.equal(bucketP.normalTotal, 0);
  assert.equal(bucketP.allInTotal, 1);
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

test('visual profile classifies two pair with dedicated color bucket', () => {
  const rows = [
    {
      flop: '(11.7) UTG_spirituallybroken cb58 AsKhQh9d8d_2p onQhTs5s / BTN_other c'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const bucket6 = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '6');

  assert.equal(bucket6.total, 1);
  assert.equal(bucket6.counts.twoPair, 1);
  assert.equal(bucket6.counts.strong, 0);
});

test('visual profile classifies overpair token as overpair bucket', () => {
  const strength = __testables.classifyStrength('HJ_spirituallybroken cb97.71 ov_p onTd4h5c');
  assert.equal(strength, 'overpair');
});

test('visual profile parses mixed suffix tokens like monster_wrap+nutfd as strong draw', () => {
  const strength = __testables.classifyStrength('MISS d monster_wrap+nutfd 4w 6c');
  assert.equal(strength, 'strongDraw');
});

test('visual profile keeps voice miss+draw rows in draw color (not Lx/unknown)', () => {
  const rows = [
    {
      flop: 'MISS d monster_wrap+nutfd 4w 6c',
      turn: '',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'process phenom' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const missMw = flop.groups.find((group) => group.id === 'MW').rows.find((row) => row.bucket === 'Miss');

  assert.equal(missMw.total, 1);
  assert.equal(missMw.counts.strongDraw, 1);
  assert.equal(missMw.counts.lightFold, 0);
  assert.equal(missMw.counts.unknown, 0);
});

test('visual profile does not classify 2p as two pair on paired board', () => {
  const strength = __testables.classifyStrength('SB_hero b50 AhTc9d4c3h_2p onAsAd7c');
  assert.notEqual(strength, 'twoPair');
});

test('visual profile detects underscore class tokens like _set_oe and _2p_g', () => {
  const strong = __testables.classifyStrength('SB_hero b60 AhTc9d4c3h_set_oe onAsKd7c');
  const twoPair = __testables.classifyStrength('SB_hero b60 AhTc9d4c3h_2p_g onAsKd7c');

  assert.equal(strong, 'strong');
  assert.equal(twoPair, 'twoPair');
});

test('visual profile marks light-fold after prior bet as dedicated class', () => {
  const rows = [
    {
      flop: '(8.2) HJ_spirituallybroken cb47.49 onAjQh8s / BB_other c',
      turn: '(15.9) BB_other x onAjQh8s4d / HJ_spirituallybroken xb',
      river: '(15.9) BB_other b62.55 onAjQh8s4d8c / HJ_spirituallybroken f'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const missRow = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '5');
  assert.equal(missRow.total, 1);
  assert.equal(missRow.counts.lightFold, 1);
});

test('visual profile marks no-showdown fold-out aggression as conditional strong (Sx)', () => {
  const rows = [
    {
      flop: '(8.7) SB_spirituallybroken b68 onAh2dTc / BB_other f'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const bucket6 = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '6');

  assert.equal(bucket6.total, 1);
  assert.equal(bucket6.counts.conditionalStrong, 1);
});

test('visual profile derives BetBet and BetBetBet lines without explicit bb tokens', () => {
  const rows = [
    {
      // x-b-b
      flop: '(10) UTG_spirituallybroken x onAhKd2c / BB_other x',
      turn: '(10) BB_other x onAhKd2c7d / UTG_spirituallybroken b52',
      river: '(20) BB_other x onAhKd2c7d9s / UTG_spirituallybroken b63'
    },
    {
      // b-b-b
      flop: '(10) UTG_spirituallybroken cb33 onAhKd2c / BB_other c',
      turn: '(16) BB_other x onAhKd2c7d / UTG_spirituallybroken b58',
      river: '(28) BB_other x onAhKd2c7d9s / UTG_spirituallybroken b71'
    },
    {
      // b-x-x -> betbet miss
      flop: '(10) UTG_spirituallybroken cb33 onAhKd2c / BB_other c',
      turn: '(16) BB_other x onAhKd2c7d / UTG_spirituallybroken xb',
      river: '(16) BB_other x onAhKd2c7d9s / UTG_spirituallybroken x'
    },
    {
      // b-b-x -> betbetbet miss
      flop: '(10) UTG_spirituallybroken cb33 onAhKd2c / BB_other c',
      turn: '(16) BB_other x onAhKd2c7d / UTG_spirituallybroken b58',
      river: '(28) BB_other x onAhKd2c7d9s / UTG_spirituallybroken x'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const betbet = profile.sections.find((section) => section.id === 'betbet');
  const betbetbet = profile.sections.find((section) => section.id === 'betbetbet');

  const betbet6 = betbet.groups[0].rows.find((row) => row.bucket === '6');
  const betbetMiss = betbet.groups[0].rows.find((row) => row.bucket === 'Miss');
  const bbb7 = betbetbet.groups[0].rows.find((row) => row.bucket === '7');
  const bbbMiss = betbetbet.groups[0].rows.find((row) => row.bucket === 'Miss');

  assert.equal(betbet6.total, 2);
  assert.equal(betbetMiss.total, 1);
  assert.equal(bbb7.total, 1);
  assert.equal(bbbMiss.total, 1);
});

test('visual profile tracks turn Donk and Miss Donk in dedicated non-sized rows', () => {
  const rows = [
    {
      flop: '(12) BB_target x onAh7d4c / BTN_other b50 / BB_target c',
      turn: '(25) BB_target b40 onAh7d4c2s / BTN_other f',
      river: ''
    },
    {
      flop: '(12) BB_target x onAh7d4c / BTN_other b50 / BB_target c',
      turn: '(25) BB_target x onAh7d4c2s / BTN_other b60 / BB_target f',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'target' });
  const betbet = profile.sections.find((section) => section.id === 'betbet');
  const donk = betbet.groups[0].rows.find((row) => row.bucket === 'Donk');
  const missDonk = betbet.groups[0].rows.find((row) => row.bucket === 'Miss Donk');

  assert.equal(donk.total, 1);
  assert.equal(missDonk.total, 1);
});

test('visual profile splits river into Check-Bet-Bet and Bet-Check-Bet with miss and donk rows', () => {
  const rows = [
    // XBB bet
    {
      flop: '(10) BB_target x onAhKd2c / BTN_other x',
      turn: '(10) BB_target b55 onAhKd2c7d / BTN_other c',
      river: '(20) BB_target b62 onAhKd2c7d9s / BTN_other f'
    },
    // XBB miss
    {
      flop: '(10) BB_target x onAhKd2c / BTN_other x',
      turn: '(10) BB_target b55 onAhKd2c7d / BTN_other c',
      river: '(20) BB_target x onAhKd2c7d9s / BTN_other x'
    },
    // XBB donk
    {
      flop: '(10) BB_target x onAhKd2c / BTN_other x',
      turn: '(10) BB_target x onAhKd2c7d / BTN_other b60 / BB_target c',
      river: '(32) BB_target b50 onAhKd2c7d9s / BTN_other f'
    },
    // XBB miss donk
    {
      flop: '(10) BB_target x onAhKd2c / BTN_other x',
      turn: '(10) BB_target x onAhKd2c7d / BTN_other b60 / BB_target c',
      river: '(32) BB_target x onAhKd2c7d9s / BTN_other x'
    },
    // BXB bet
    {
      flop: '(10) BB_target cb50 onAhKd2c / BTN_other c',
      turn: '(20) BB_target x onAhKd2c7d / BTN_other x',
      river: '(20) BB_target b60 onAhKd2c7d9s / BTN_other f'
    },
    // BXB miss
    {
      flop: '(10) BB_target cb50 onAhKd2c / BTN_other c',
      turn: '(20) BB_target x onAhKd2c7d / BTN_other x',
      river: '(20) BB_target x onAhKd2c7d9s / BTN_other x'
    },
    // BXB donk
    {
      flop: '(10) BB_target cb50 onAhKd2c / BTN_other c',
      turn: '(20) BB_target x onAhKd2c7d / BTN_other b60 / BB_target c',
      river: '(40) BB_target b50 onAhKd2c7d9s / BTN_other f'
    },
    // BXB miss donk
    {
      flop: '(10) BB_target cb50 onAhKd2c / BTN_other c',
      turn: '(20) BB_target x onAhKd2c7d / BTN_other b60 / BB_target c',
      river: '(40) BB_target x onAhKd2c7d9s / BTN_other x'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'target' });
  const xbb = profile.sections.find((section) => section.id === 'riverXbb');
  const bxb = profile.sections.find((section) => section.id === 'riverBxb');

  assert.equal(xbb.groups[0].rows.find((row) => row.bucket === '6').total, 1);
  assert.equal(xbb.groups[0].rows.find((row) => row.bucket === 'Miss').total, 1);
  assert.equal(xbb.groups[0].rows.find((row) => row.bucket === 'Donk').total, 1);
  assert.equal(xbb.groups[0].rows.find((row) => row.bucket === 'Miss Donk').total, 1);

  assert.equal(bxb.groups[0].rows.find((row) => row.bucket === '6').total, 1);
  assert.equal(bxb.groups[0].rows.find((row) => row.bucket === 'Miss').total, 1);
  assert.equal(bxb.groups[0].rows.find((row) => row.bucket === 'Donk').total, 1);
  assert.equal(bxb.groups[0].rows.find((row) => row.bucket === 'Miss Donk').total, 1);
});

test('visual profile adds River Once miss row when x-x flop and x-x turn end in river check', () => {
  const rows = [
    {
      flop: '(8.2) BB_target x onAh7d4c / BTN_other x',
      turn: '(8.2) BB_target x onAh7d4c2s / BTN_other x',
      river: '(8.2) BB_target b52 onAh7d4c2s9h / BTN_other f'
    },
    {
      flop: '(8.2) BB_target x onAh7d4c / BTN_other x',
      turn: '(8.2) BB_target x onAh7d4c2s / BTN_other x',
      river: '(8.2) BB_target x onAh7d4c2s9h / BTN_other x'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'target' });
  const riverOnce = profile.sections.find((section) => section.id === 'riverOnce');
  const bucket5 = riverOnce.groups[0].rows.find((row) => row.bucket === '5');
  const miss = riverOnce.groups[0].rows.find((row) => row.bucket === 'Miss');

  assert.equal(bucket5.total, 1);
  assert.equal(miss.total, 1);
});

test('visual profile tracks BetBetBet donk and miss-donk rows', () => {
  const rows = [
    {
      flop: '(10) BB_other b50 onAhKd2c / BTN_target c',
      turn: '(20) BB_other b60 onAhKd2c7d / BTN_target c',
      river: '(40) BTN_target b52 onAhKd2c7d9s / BB_other f'
    },
    {
      flop: '(10) BB_other b50 onAhKd2c / BTN_target c',
      turn: '(20) BB_other b60 onAhKd2c7d / BTN_target c',
      river: '(40) BTN_target x onAhKd2c7d9s / BB_other x'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'target' });
  const bbb = profile.sections.find((section) => section.id === 'betbetbet');

  assert.equal(bbb.groups[0].rows.find((row) => row.bucket === 'Donk').total, 1);
  assert.equal(bbb.groups[0].rows.find((row) => row.bucket === 'Miss Donk').total, 1);
});

test('visual profile applies vs filter at stat anchor street (turn stats)', () => {
  const rows = [
    // VS player participates only until flop, should not count in turn BetBet.
    {
      flop: '(16.2) UTG_other x onKcAcTd / UTG1_vs x / CO_target b96.3 / BTN_other f / UTG_other c / UTG1_vs f',
      turn: '(47.4) UTG_other x onKcAcTd8h / CO_target b98.73 / UTG_other c',
      river: ''
    },
    // VS player is active on turn, should count.
    {
      flop: '(12) BB_vs x onAh7d4c / CO_target cb60 / BB_vs c',
      turn: '(32) BB_vs x onAh7d4c2s / CO_target b55 / BB_vs c',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, {
    opponent: 'target',
    filters: { vsOpponent: 'vs' }
  });

  const betbet = profile.sections.find((section) => section.id === 'betbet');
  const bucket6 = betbet.groups[0].rows.find((row) => row.bucket === '6');
  assert.equal(bucket6.total, 1);
});

test('visual profile applies vs filter at stat anchor street (flop stats)', () => {
  const rows = [
    {
      flop: '(10) BB_target cb50 onAhKd2c / CO_vs c'
    },
    {
      flop: '(10) BB_target cb50 onAhKd2c / CO_other c'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, {
    opponent: 'target',
    filters: { vsOpponent: 'vs' }
  });

  const flop = profile.sections.find((section) => section.id === 'flop');
  const bucket5 = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '5');
  assert.equal(bucket5.total, 1);
});

test('visual profile uses miss-street strength for BetBet miss (b-x-x)', () => {
  const rows = [
    {
      flop: '(10) UTG_spirituallybroken cb33 onAhKd2c / BB_other c',
      turn: '(16) BB_other x onAhKd2c7d / UTG_spirituallybroken xb KhQsJdTd9d_2p',
      river: '(16) BB_other x onAhKd2c7d9s / UTG_spirituallybroken x KhQsJdTd9d_str'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const betbet = profile.sections.find((section) => section.id === 'betbet');
  const missRow = betbet.groups[0].rows.find((row) => row.bucket === 'Miss');

  assert.equal(missRow.total, 1);
  assert.equal(missRow.counts.twoPair, 1);
  assert.equal(missRow.counts.strong, 0);
  assert.equal(missRow.counts.nuts, 0);
});

test('visual profile does not count x-b-x as BetBet miss (kept in probes)', () => {
  const rows = [
    {
      flop: '(10) UTG_spirituallybroken x onAhKd2c / BB_other x',
      turn: '(16) BB_other x onAhKd2c7d / UTG_spirituallybroken b58 KhQsJdTd9d_2p',
      river: '(16) BB_other x onAhKd2c7d9s / UTG_spirituallybroken x KhQsJdTd9d_str'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const betbet = profile.sections.find((section) => section.id === 'betbet');
  const probes = profile.sections.find((section) => section.id === 'probes');
  const missRow = betbet.groups[0].rows.find((row) => row.bucket === 'Miss');
  const probe6 = probes.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '6');

  assert.equal(missRow.total, 0);
  assert.equal(probe6.total, 1);
});

test('visual profile does not map multiway turn bet (x-b-x) to BetBet miss', () => {
  const rows = [
    {
      flop: '(31) SB_other x on6s8c9c / BB_other x / UTG_spirituallybroken x / CO_other x / BTN_other xb',
      turn: '(31) SB_other x on6s8c9c6d / BB_other x / UTG_spirituallybroken b50 AhAcTd8s6h_full / CO_other f / BTN_other f / SB_other f / BB_other c',
      river: '(62) BB_other x on6s8c9c6d2s / UTG_spirituallybroken xb AhAcTd8s6h_full'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const betbet = profile.sections.find((section) => section.id === 'betbet');
  const probes = profile.sections.find((section) => section.id === 'probes');
  const missRow = betbet.groups[0].rows.find((row) => row.bucket === 'Miss');
  const probe5Mw = probes.groups.find((group) => group.id === 'MW').rows.find((row) => row.bucket === '5');

  assert.equal(missRow.total, 0);
  assert.equal(probe5Mw.total, 1);
});

test('visual profile propagates conditional Sx strength across streets in the same line', () => {
  const rows = [
    {
      flop: '(10) UTG_spirituallybroken cb52 onAhKd2c / BB_other c',
      turn: '(22) BB_other x onAhKd2c7d / UTG_spirituallybroken b66 / BB_other f',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const betbet = profile.sections.find((section) => section.id === 'betbet');
  const flop5 = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '5');
  const betbet6 = betbet.groups[0].rows.find((row) => row.bucket === '6');

  assert.equal(flop5.total, 1);
  assert.equal(flop5.counts.conditionalStrong, 1);
  assert.equal(flop5.counts.unknown, 0);
  assert.equal(betbet6.total, 1);
  assert.equal(betbet6.counts.conditionalStrong, 1);
});

test('visual profile marks Lt when player folds on turn after own turn aggression', () => {
  const rows = [
    {
      flop: '(9.1) BB_other x onQhTs5s / HJ_spirituallybroken x',
      turn: '(9.1) BB_other x onQhTs5s4d / HJ_spirituallybroken b62 / BB_other r3x / HJ_spirituallybroken f',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const probes = profile.sections.find((section) => section.id === 'probes');
  const bucket6 = probes.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '6');

  assert.equal(bucket6.total, 1);
  assert.equal(bucket6.counts.lightFold, 1);
});

test('visual profile marks flop Miss as lightFold when line ends with turn fold after flop check', () => {
  const rows = [
    {
      flop: '(8.2) BB_spirituallybroken x on6cJd5h / UTG_other cb24.39 / BB_spirituallybroken c',
      turn: '(8.2) UTG_other b24.39 on6cJd5h2d / BB_spirituallybroken f',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const miss = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === 'Miss');

  assert.equal(miss.total, 1);
  assert.equal(miss.counts.lightFold, 1);
  assert.equal(miss.counts.unknown, 0);
});

test('visual profile marks flop Miss as lightFold when line ends with river fold after checks', () => {
  const rows = [
    {
      flop: '(9.1) BB_spirituallybroken x on2dTdJs / BTN_other x',
      turn: '(9.1) BB_spirituallybroken x on2dTdJs9c / BTN_other x',
      river: '(9.1) BTN_other b31.34 on2dTdJs9cQh / BB_spirituallybroken f'
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const miss = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === 'Miss');

  assert.equal(miss.total, 1);
  assert.equal(miss.counts.lightFold, 1);
  assert.equal(miss.counts.unknown, 0);
});

test('visual profile marks flop Miss as lightFold on same-street check-fold sequence', () => {
  const rows = [
    {
      flop: '(8.2) BB_spirituallybroken x onTd3c9h / BTN_other cb71.24 / BB_spirituallybroken f',
      turn: '',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const miss = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === 'Miss');

  assert.equal(miss.total, 1);
  assert.equal(miss.counts.lightFold, 1);
  assert.equal(miss.counts.unknown, 0);
});

test('visual profile marks MW flop Miss as lightFold on same-street check-fold sequence', () => {
  const rows = [
    {
      flop: '(11.7) BB_other x on6d8c3h / UTG_spirituallybroken x / CO_villain b77 / BB_other f / UTG_spirituallybroken f',
      turn: '',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const miss = flop.groups.find((group) => group.id === 'MW').rows.find((row) => row.bucket === 'Miss');

  assert.equal(miss.total, 1);
  assert.equal(miss.counts.lightFold, 1);
  assert.equal(miss.counts.unknown, 0);
});

test('visual profile does not classify check-raise multiplier (r5x) as micro bet bucket', () => {
  const rows = [
    {
      flop: '(8.1) BB_spirituallybroken x on9cKcQd / HJ_other cb47.49 / BB_spirituallybroken r5x / HJ_other f',
      turn: '',
      river: ''
    }
  ];

  const profile = buildOpponentVisualProfile(rows, { opponent: 'spirituallybroken' });
  const flop = profile.sections.find((section) => section.id === 'flop');
  const bucket2 = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === '2');
  const miss = flop.groups.find((group) => group.id === 'HU').rows.find((row) => row.bucket === 'Miss');

  assert.equal(bucket2.total, 0);
  assert.equal(miss.total, 0);
});

test('visual profile classifies board-discounted strong made as fragileStrong', () => {
  const setOnStraightBoard = __testables.classifyStrength('SB_hero b60 AhAcKd9d4h_set on9cKcQd');
  const straightOnPairedBoard = __testables.classifyStrength('SB_hero b60 AhTc9d8d7h_str on9c9dJcQh');
  const flushOnPairedBoard = __testables.classifyStrength('SB_hero b60 AhKhQd9d4h_flush on9c9dJdQd');
  const explicitTags = __testables.classifyStrength('SB_hero b60 AhTc9d8d7h_str_lowstr_STRB on6c7d8h9sKs');

  assert.equal(setOnStraightBoard, 'fragileStrong');
  assert.equal(straightOnPairedBoard, 'fragileStrong');
  assert.equal(flushOnPairedBoard, 'fragileStrong');
  assert.equal(explicitTags, 'fragileStrong');
});

test('visual profile uses opaque light-red palette for conditionalStrong legend on dark background', () => {
  const profile = buildOpponentVisualProfile([], { opponent: 'spirituallybroken' });
  const item = (profile.legend || []).find((entry) => entry.key === 'conditionalStrong');
  assert.equal(item?.color, '#efb8bf');
});

test('visual profile uses dedicated lighter color for fragileStrong legend', () => {
  const profile = buildOpponentVisualProfile([], { opponent: 'spirituallybroken' });
  const item = (profile.legend || []).find((entry) => entry.key === 'fragileStrong');
  assert.equal(item?.color, '#f8d8df');
});

test('visual profile section order keeps River Once above Check-Bet-Bet', () => {
  const profile = buildOpponentVisualProfile([], { opponent: 'target' });
  const ids = (profile.sections || []).map((section) => section.id);
  assert.deepEqual(ids, [
    'flop',
    'betbet',
    'probes',
    'riverBxb',
    'riverOnce',
    'riverXbb',
    'betbetbet',
    'tot'
  ]);
});
