import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCanonicalRunFromOcrFrames,
  parseOcrLineToEvent
} from '../src/videoBaselineExtractor.js';

test('parseOcrLineToEvent extracts actor/action/size from OCR line', () => {
  const parsed = parseOcrLineToEvent({
    line: 'SB_hero raises to 2.5bb',
    frameMs: 1200,
    eventIndex: 1,
    defaultStreet: 'preflop',
    confidence: 0.87
  });

  assert.ok(parsed);
  assert.equal(parsed.event.actor, 'SB_hero');
  assert.equal(parsed.event.action, 'raise');
  assert.equal(parsed.event.size_bb, 2.5);
  assert.equal(parsed.event.street, 'preflop');
  assert.equal(parsed.event.confidence, 0.87);
});

test('buildCanonicalRunFromOcrFrames builds events and dedupes near-identical repeats', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    frames: [
      {
        ms: 1000,
        lines: [
          'PRE FLOP',
          { text: 'SB_hero raises to 2.5bb', confidence: 0.8 },
          { text: 'BB_villain calls 2.5bb', confidence: 0.72 }
        ]
      },
      {
        ms: 1500,
        lines: [
          { text: 'SB_hero raises to 2.5bb', confidence: 0.82 }
        ]
      },
      {
        ms: 3200,
        lines: [
          'FLOP',
          'BB_villain checks',
          'SB_hero bets 3bb'
        ]
      }
    ]
  });

  assert.equal(run.version, 'canonical_hand_v1');
  assert.equal(run.hands.length, 1);
  assert.equal(run.hands[0].events.length, 4);
  assert.equal(run.hands[0].events[0].action, 'raise');
  assert.equal(run.hands[0].events[1].action, 'call');
  assert.equal(run.hands[0].events[2].street, 'flop');
  assert.equal(run.hands[0].events[3].action, 'bet');
  assert.equal(run.meta.event_count, 4);
  assert.equal(run.meta.raw_event_count >= run.meta.event_count, true);
});

test('buildCanonicalRunFromOcrFrames ignores bottom action buttons and keeps seat action badges', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    frames: [
      {
        ms: 1000,
        lines: [
          { text: 'AbbyMartin', cx: 382, cy: 80, confidence: 0.9 },
          { text: 'RAISE', cx: 382, cy: 540, confidence: 0.98 }
        ]
      },
      {
        ms: 2000,
        lines: [
          { text: 'AbbyMartin', cx: 382, cy: 80, confidence: 0.9 },
          { text: 'RAISE', cx: 382, cy: 120, confidence: 0.98 }
        ]
      }
    ]
  });

  assert.equal(run.hands.length, 1);
  assert.equal(run.hands[0].events.length, 1);
  assert.equal(run.hands[0].events[0].actor, 'AbbyMartin');
  assert.equal(run.hands[0].events[0].action, 'raise');
  assert.equal(run.hands[0].events[0].evidence.frame_ms, 2000);
});

test('buildCanonicalRunFromOcrFrames dedupes persistent action-only overlays within a hand', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    handGapMs: 60000,
    frames: [
      {
        ms: 1000,
        lines: [
          { text: 'leeuw', cx: 80, cy: 120, confidence: 0.9 },
          { text: 'FOLD', cx: 85, cy: 140, confidence: 0.98 },
          'Pot346'
        ]
      },
      {
        ms: 12000,
        lines: [
          { text: 'leeuw', cx: 80, cy: 120, confidence: 0.9 },
          { text: 'FOLD', cx: 84, cy: 138, confidence: 0.98 },
          'Pot346'
        ]
      },
      {
        ms: 22000,
        lines: [
          { text: 'leeuw', cx: 80, cy: 120, confidence: 0.9 },
          { text: 'FOLD', cx: 83, cy: 139, confidence: 0.98 },
          'Pot346'
        ]
      }
    ]
  });

  assert.equal(run.hands.length, 1);
  assert.equal(run.hands[0].events.length, 1);
  assert.equal(run.hands[0].events[0].actor, 'leeuw');
  assert.equal(run.hands[0].events[0].action, 'fold');
});

test('buildCanonicalRunFromOcrFrames splits hands on strong pot reset even without long time gap', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    handGapMs: 20000,
    frames: [
      {
        ms: 1000,
        lines: [
          { text: 'AbbyMartin raises to 2.5bb', confidence: 0.9 },
          'Pot1,600'
        ]
      },
      {
        ms: 4000,
        lines: [
          { text: 'leeuw calls 2.5bb', confidence: 0.9 },
          'Pot2,100'
        ]
      },
      {
        ms: 7000,
        lines: [
          { text: 'MrLouie folds', confidence: 0.9 },
          'Pot346'
        ]
      }
    ]
  });

  assert.equal(run.hands.length, 2);
  assert.equal(run.hands[0].events.length, 2);
  assert.equal(run.hands[1].events.length, 1);
});

test('buildCanonicalRunFromOcrFrames infers flop after preflop action flow when checks start', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    frames: [
      {
        ms: 1000,
        lines: [
          { text: 'AbbyMartin raises to 2.5bb', confidence: 0.9 }
        ]
      },
      {
        ms: 2000,
        lines: [
          { text: 'leeuw calls 2.5bb', confidence: 0.9 }
        ]
      },
      {
        ms: 3000,
        lines: [
          { text: 'leeuw', cx: 80, cy: 120, confidence: 0.9 },
          { text: 'CHECK', cx: 82, cy: 142, confidence: 0.95 }
        ]
      }
    ]
  });

  assert.equal(run.hands.length, 1);
  assert.equal(run.hands[0].events.length, 3);
  assert.equal(run.hands[0].events[2].action, 'check');
  assert.equal(run.hands[0].events[2].street, 'flop');
});

test('buildCanonicalRunFromOcrFrames uses focus-first deciding actor to gate action-only events', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    frames: [
      {
        ms: 1000,
        lines: [
          { text: 'AbbyMartin', cx: 412, cy: 545, confidence: 0.99 },
          { text: 'leeuw', cx: 717, cy: 434, confidence: 0.99 },
          { text: 'AbbyMartin is currently deciding', cx: 410, cy: 392, confidence: 0.95 },
          { text: 'FOLD', cx: 686, cy: 413, confidence: 0.99 },
          { text: 'CALL', cx: 382, cy: 523, confidence: 0.88 }
        ]
      }
    ]
  });

  assert.equal(run.hands.length, 1);
  assert.equal(run.hands[0].events.length, 1);
  assert.equal(run.hands[0].events[0].actor, 'AbbyMartin');
  assert.equal(run.hands[0].events[0].action, 'call');
});

test('buildCanonicalRunFromOcrFrames persists focus actor in event evidence for QA', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    frames: [
      {
        ms: 1000,
        lines: [
          { text: 'AbbyMartin is currently deciding', cx: 410, cy: 392, confidence: 0.95 },
          { text: 'AbbyMartin calls', confidence: 0.87 }
        ]
      }
    ]
  });

  assert.equal(run.hands.length, 1);
  assert.equal(run.hands[0].events.length, 1);
  assert.equal(run.hands[0].events[0].evidence.focus_actor, 'AbbyMartin');
});

test('buildCanonicalRunFromOcrFrames blocks actions from players already folded in same hand', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    frames: [
      {
        ms: 1000,
        lines: [
          'leeuw folds'
        ]
      },
      {
        ms: 4000,
        lines: [
          'FLOP',
          'leeuw folds'
        ]
      }
    ]
  });

  assert.equal(run.hands.length, 1);
  assert.equal(run.hands[0].events.length, 1);
  assert.equal(run.hands[0].events[0].actor, 'leeuw');
  assert.equal(run.hands[0].events[0].street, 'preflop');
});

test('buildCanonicalRunFromOcrFrames infers missing squeeze response calls before flop transition', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    frames: [
      { ms: 1000, lines: ['AbbyMartin raises'] },
      { ms: 2000, lines: ['ZootedCamel calls'] },
      { ms: 3000, lines: ['ilsy raises'] },
      {
        ms: 4000,
        lines: [
          { text: 'ilsy', cx: 411, cy: 144, confidence: 0.95 },
          { text: 'CHECK', cx: 382, cy: 123, confidence: 0.98 }
        ]
      }
    ]
  });

  assert.equal(run.hands.length, 1);
  assert.equal(run.hands[0].events.length, 6);
  assert.equal(run.hands[0].events[3].actor, 'AbbyMartin');
  assert.equal(run.hands[0].events[3].action, 'call');
  assert.equal(run.hands[0].events[3].resolution_state, 'inferred');
  assert.equal(run.hands[0].events[4].actor, 'ZootedCamel');
  assert.equal(run.hands[0].events[4].action, 'call');
  assert.equal(run.hands[0].events[4].resolution_state, 'inferred');
  assert.equal(run.hands[0].events[4].reason_codes.includes('anchor_inferred_preflop_response'), true);
  assert.equal(run.hands[0].events[5].action, 'check');
  assert.equal(run.hands[0].events[5].street, 'flop');
});

test('buildCanonicalRunFromOcrFrames normalizes first postflop raise token to bet', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    frames: [
      { ms: 1000, lines: ['AbbyMartin raises'] },
      { ms: 2000, lines: ['leeuw calls'] },
      { ms: 3000, lines: ['FLOP', 'AbbyMartin raises'] }
    ]
  });

  assert.equal(run.hands.length, 1);
  const flopEvent = run.hands[0].events.find((event) => event.street === 'flop');
  assert.ok(flopEvent);
  assert.equal(flopEvent.actor, 'AbbyMartin');
  assert.equal(flopEvent.action, 'bet');
});

test('buildCanonicalRunFromOcrFrames marks postflop all-in facing bet as call_allin', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    frames: [
      { ms: 1000, lines: ['AbbyMartin raises'] },
      { ms: 2000, lines: ['leeuw calls'] },
      { ms: 3000, lines: ['FLOP', 'AbbyMartin bets', 'ZootedCamel all-in'] }
    ]
  });

  assert.equal(run.hands.length, 1);
  const allinEvent = run.hands[0].events.find((event) => event.actor === 'ZootedCamel');
  assert.ok(allinEvent);
  assert.equal(allinEvent.street, 'flop');
  assert.equal(allinEvent.action, 'call_allin');
});

test('buildCanonicalRunFromOcrFrames suppresses stale bottom-seat action badge when pot is unchanged', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    frames: [
      {
        ms: 1000,
        lines: [
          { text: 'AbbyMartin', cx: 412, cy: 545, confidence: 0.99 },
          { text: 'RAISE', cx: 382, cy: 523, confidence: 0.99 },
          'Pot1,534'
        ]
      },
      {
        ms: 2000,
        lines: [
          { text: 'AbbyMartin', cx: 412, cy: 545, confidence: 0.99 },
          { text: 'RAISE', cx: 382, cy: 523, confidence: 0.99 },
          'Pot1,534'
        ]
      }
    ]
  });

  assert.equal(run.hands.length, 1);
  assert.equal(run.hands[0].events.length, 1);
  assert.equal(run.hands[0].events[0].actor, 'AbbyMartin');
  assert.equal(run.hands[0].events[0].action, 'raise');
});

test('buildCanonicalRunFromOcrFrames suppresses stale pending preflop response action without pot change', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    sampleMs: 2000,
    frames: [
      {
        ms: 1000,
        lines: [
          { text: 'AbbyMartin raises', confidence: 0.9 },
          'Pot300'
        ]
      },
      {
        ms: 3000,
        lines: [
          { text: 'ZootedCamel calls', confidence: 0.9 },
          'Pot600'
        ]
      },
      {
        ms: 5000,
        lines: [
          { text: 'ilsy raises', confidence: 0.9 },
          'Pot1200'
        ]
      },
      {
        ms: 7000,
        lines: [
          { text: 'AbbyMartin', cx: 412, cy: 545, confidence: 0.99 },
          { text: 'RAISE', cx: 382, cy: 523, confidence: 0.99 },
          'Pot1200'
        ]
      },
      {
        ms: 9000,
        lines: [
          { text: 'AbbyMartin', cx: 412, cy: 545, confidence: 0.99 },
          { text: 'CALL', cx: 382, cy: 523, confidence: 0.99 },
          'Pot1800'
        ]
      }
    ]
  });

  const actions = run.hands[0].events.map((event) => `${event.actor}:${event.action}:${event.evidence.frame_ms}`);
  assert.equal(actions.includes('AbbyMartin:raise:7000'), false);
  assert.equal(actions.includes('AbbyMartin:call:9000'), true);
});

test('buildCanonicalRunFromOcrFrames suppresses stale pending preflop call without pot confirmation', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    sampleMs: 2000,
    frames: [
      {
        ms: 1000,
        lines: [
          { text: 'AbbyMartin raises', confidence: 0.9 },
          'Pot300'
        ]
      },
      {
        ms: 3000,
        lines: [
          { text: 'ZootedCamel calls', confidence: 0.9 },
          'Pot600'
        ]
      },
      {
        ms: 5000,
        lines: [
          { text: 'ilsy raises', confidence: 0.9 },
          'Pot1200'
        ]
      },
      {
        ms: 6500,
        lines: [
          { text: 'AbbyMartin', cx: 412, cy: 545, confidence: 0.99 },
          { text: 'CALL', cx: 382, cy: 523, confidence: 0.99 },
          'Pot1800'
        ]
      },
      {
        ms: 7000,
        lines: [
          { text: 'ZootedCamel', cx: 123, cy: 193, confidence: 0.99 },
          { text: 'CALL', cx: 94, cy: 172, confidence: 0.99 },
          'Pot1800'
        ]
      }
    ]
  });

  assert.equal(run.hands.length, 1);
  const zootCalls = run.hands[0].events.filter(
    (event) => event.actor === 'ZootedCamel' && event.action === 'call' && event.evidence.frame_ms >= 6500
  );
  assert.equal(zootCalls.length, 0);
});

test('buildCanonicalRunFromOcrFrames can reorder early preflop fold before first aggression in pre-roll mode', () => {
  const run = buildCanonicalRunFromOcrFrames({
    videoPath: '/tmp/sample.mp4',
    sizeBytes: 100,
    createdAtIso: '2026-03-03T13:00:00.000Z',
    dedupeWindowMs: 1200,
    sampleMs: 2000,
    frames: [
      {
        ms: 0,
        lines: [
          { text: 'RAISE', cx: 382, cy: 523, confidence: 0.99 },
          { text: 'AbbyMartin', cx: 412, cy: 545, confidence: 0.99 }
        ]
      },
      {
        ms: 2000,
        lines: [
          { text: 'FOLD', cx: 685, cy: 413, confidence: 0.99 },
          { text: 'leeuw', cx: 717, cy: 434, confidence: 0.99 },
          'Pot346'
        ]
      }
    ]
  });

  assert.equal(run.hands.length, 1);
  assert.equal(run.hands[0].events.length, 2);
  assert.equal(run.hands[0].events[0].actor, 'leeuw');
  assert.equal(run.hands[0].events[0].action, 'fold');
  assert.equal(run.hands[0].events[1].actor, 'AbbyMartin');
  assert.equal(run.hands[0].events[1].action, 'raise');
  assert.equal(run.hands[0].events[0].evidence.text_raw.includes('pre_roll_inferred_order'), true);
});
