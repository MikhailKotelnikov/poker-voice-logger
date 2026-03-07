import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExplainabilityTrace, flattenEvents, resolveFocusActors } from '../src/videoLabPreview.js';

test('flattenEvents uses global event numbering without hand-level reset', () => {
  const rows = flattenEvents({
    hands: [
      {
        hand_id: 'h1',
        events: [
          { event_id: 'e1', actor: 'A', action: 'fold', street: 'preflop', confidence: 0.8, evidence: { frame_ms: 1000, text_raw: 'A folds' } },
          { event_id: 'e2', actor: 'B', action: 'raise', street: 'preflop', confidence: 0.8, evidence: { frame_ms: 2000, text_raw: 'B raises' } }
        ]
      },
      {
        hand_id: 'h2',
        events: [
          { event_id: 'e3', actor: 'C', action: 'call', street: 'preflop', confidence: 0.8, evidence: { frame_ms: 3000, text_raw: 'C calls' } },
          { event_id: 'e4', actor: 'D', action: 'fold', street: 'preflop', confidence: 0.8, evidence: { frame_ms: 4000, text_raw: 'D folds' } }
        ]
      }
    ]
  });

  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.eventIndex), [1, 2, 3, 4]);
  assert.deepEqual(rows.map((row) => row.handEventIndex), [1, 2, 1, 2]);
});

test('flattenEvents exposes focus actor and frame pot when present in evidence', () => {
  const rows = flattenEvents({
    hands: [
      {
        hand_id: 'h1',
        events: [
          {
            event_id: 'e1',
            actor: 'AbbyMartin',
            action: 'call',
            street: 'preflop',
            confidence: 0.83,
            evidence: {
              frame_ms: 1200,
              text_raw: 'CALL',
              focus_actor: 'AbbyMartin',
              frame_pot: 1534
            }
          }
        ]
      }
    ]
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].focusActorDetected, 'AbbyMartin');
  assert.equal(rows[0].framePot, 1534);
  assert.equal(rows[0].resolutionState, 'committed');
});

test('flattenEvents exposes inferred state and reason codes when present', () => {
  const rows = flattenEvents({
    hands: [
      {
        hand_id: 'h1',
        events: [
          {
            event_id: 'e1',
            actor: 'ZootedCamel',
            action: 'call',
            street: 'preflop',
            confidence: 0.31,
            resolution_state: 'inferred',
            reason_codes: ['anchor_inferred_preflop_response'],
            evidence: {
              frame_ms: 3380,
              text_raw: 'ZootedCamel inferred call (preflop response chain)',
              frame_pot: 2301
            }
          }
        ]
      }
    ]
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].resolutionState, 'inferred');
  assert.deepEqual(rows[0].reasonCodes, ['anchor_inferred_preflop_response']);
});

test('flattenEvents exposes proof summary and hand validation from reconstruction payload', () => {
  const rows = flattenEvents({
    version: 'reconstruction_run_v1',
    hands: [
      {
        hand_id: 'h1',
        validation: {
          status: 'valid',
          checks: {
            requiredResponses: 'pass'
          }
        },
        events: [
          {
            event_id: 'e1',
            actor: 'ZootedCamel',
            action: 'call',
            street: 'preflop',
            confidence: 0.31,
            resolution_state: 'inferred',
            reason_codes: ['anchor_window_pot_delta_confirms_response'],
            proof: {
              pot_before: 2301,
              pot_after: 3068,
              amount: 767,
              anchor_from_frame_ms: 30000,
              anchor_to_frame_ms: 35000
            },
            evidence: {
              frame_ms: 30000,
              text_raw: 'CALL',
              frame_pot: 2301
            }
          }
        ]
      }
    ]
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].handValidationStatus, 'valid');
  assert.match(rows[0].proofSummary, /2301 -> 3068/);
  assert.match(rows[0].proofSummary, /767/);
});

test('flattenEvents provides fallback-ready focus field when no focus cue in evidence', () => {
  const rows = flattenEvents({
    hands: [
      {
        hand_id: 'h1',
        events: [
          {
            event_id: 'e1',
            actor: 'leeuw',
            action: 'fold',
            street: 'preflop',
            confidence: 0.9,
            evidence: {
              frame_ms: 0,
              text_raw: 'FOLD'
            }
          },
          {
            event_id: 'e2',
            actor: 'AbbyMartin',
            action: 'raise',
            street: 'preflop',
            confidence: 0.9,
            evidence: {
              frame_ms: 1000,
              text_raw: 'RAISE'
            }
          }
        ]
      }
    ]
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].focusActorDetected, '');
  assert.equal(rows[1].focusActorDetected, '');
});

test('resolveFocusActors assigns same focus for all events in frame using next frame actor', () => {
  const rows = [
    { handId: 'h1', handIndex: 1, eventIndex: 1, frameMs: 0, actor: 'leeuw', focusActorDetected: '' },
    { handId: 'h1', handIndex: 1, eventIndex: 2, frameMs: 0, actor: 'AbbyMartin', focusActorDetected: '' },
    { handId: 'h1', handIndex: 1, eventIndex: 3, frameMs: 1000, actor: 'MrLouie', focusActorDetected: '' }
  ];

  const resolved = resolveFocusActors(rows, 1000);
  assert.equal(resolved[0].focusActor, 'MrLouie');
  assert.equal(resolved[1].focusActor, 'MrLouie');
  assert.equal(resolved[2].focusActor, 'MrLouie');
});

test('resolveFocusActors overrides stale detected focus when frame has multiple postfactum actions', () => {
  const rows = [
    { handId: 'h1', handIndex: 1, eventIndex: 1, frameMs: 0, actor: 'leeuw', focusActorDetected: 'AbbyMartin' },
    { handId: 'h1', handIndex: 1, eventIndex: 2, frameMs: 0, actor: 'AbbyMartin', focusActorDetected: '' },
    { handId: 'h1', handIndex: 1, eventIndex: 3, frameMs: 1000, actor: 'MrLouie', focusActorDetected: '' }
  ];

  const resolved = resolveFocusActors(rows, 1000);
  assert.equal(resolved[0].focusActor, 'MrLouie');
  assert.equal(resolved[1].focusActor, 'MrLouie');
  assert.equal(resolved[0].focusSource, 'frame_inferred_override_stale_detected');
});

test('resolveFocusActors keeps inferred row focus on its actor instead of next-frame actor', () => {
  const rows = [
    {
      handId: 'h1',
      handIndex: 1,
      eventIndex: 1,
      frameMs: 3380,
      actor: 'ZootedCamel',
      action: 'call',
      resolutionState: 'inferred',
      focusActorDetected: ''
    },
    {
      handId: 'h1',
      handIndex: 1,
      eventIndex: 2,
      frameMs: 3500,
      actor: 'ilsy',
      action: 'check',
      resolutionState: 'committed',
      focusActorDetected: ''
    }
  ];

  const resolved = resolveFocusActors(rows, 1000);
  assert.equal(resolved[0].focusActor, 'ZootedCamel');
  assert.equal(resolved[0].focusSource, 'inferred_actor_locked');
});

test('resolveFocusActors sets focus none on terminal last frame-group', () => {
  const rows = [
    {
      handId: 'h1',
      handIndex: 1,
      eventIndex: 1,
      frameMs: 1000,
      actor: 'ZootedCamel',
      action: 'call_allin',
      resolutionState: 'committed',
      focusActorDetected: ''
    },
    {
      handId: 'h1',
      handIndex: 1,
      eventIndex: 2,
      frameMs: 2000,
      actor: 'ilsy',
      action: 'fold',
      resolutionState: 'committed',
      focusActorDetected: ''
    }
  ];

  const resolved = resolveFocusActors(rows, 1000);
  assert.equal(resolved[1].focusActor, 'none');
  assert.equal(resolved[1].focusSource, 'terminal_focus_none');
});

test('resolveFocusActors locks stale preflop response on actor and marks row pending', () => {
  const rows = [
    {
      handId: 'h1',
      handIndex: 1,
      eventIndex: 7,
      frameMs: 27000,
      street: 'preflop',
      actor: 'AbbyMartin',
      action: 'call',
      resolutionState: 'committed',
      reasonCodes: [],
      framePot: 2301,
      focusActorDetected: ''
    },
    {
      handId: 'h1',
      handIndex: 1,
      eventIndex: 8,
      frameMs: 30000,
      street: 'preflop',
      actor: 'ZootedCamel',
      action: 'call',
      resolutionState: 'committed',
      reasonCodes: [],
      framePot: 2301,
      focusActorDetected: ''
    },
    {
      handId: 'h1',
      handIndex: 1,
      eventIndex: 9,
      frameMs: 35000,
      street: 'flop',
      actor: 'ilsy',
      action: 'check',
      resolutionState: 'committed',
      reasonCodes: [],
      framePot: 3068,
      focusActorDetected: ''
    }
  ];

  const resolved = resolveFocusActors(rows, 1000);
  assert.equal(resolved[1].focusActor, 'ZootedCamel');
  assert.equal(resolved[1].focusSource, 'stale_preflop_response_actor_lock');
  assert.equal(resolved[1].resolutionState, 'pending');
  assert.equal(resolved[1].reasonCodes.includes('pending_preflop_response_without_pot_growth'), true);
  buildExplainabilityTrace(resolved);
  assert.equal(resolved[1].displayAction, 'ожидание решения');
  assert.match(resolved[1].explainTrace, /игрок еще думает/i);
});

test('buildExplainabilityTrace includes observed/past/expected trace fields', () => {
  const rows = [
    {
      handId: 'h1',
      handIndex: 1,
      eventIndex: 1,
      handEventIndex: 1,
      frameMs: 0,
      street: 'preflop',
      actor: 'leeuw',
      action: 'fold',
      resolutionState: 'committed',
      reasonCodes: [],
      sizeBb: '',
      framePot: 346,
      confidence: '0.99',
      focusActorDetected: '',
      focusActor: 'MrLouie',
      focusSource: 'frame_inferred_next_frame_actor',
      textRaw: 'FOLD'
    },
    {
      handId: 'h1',
      handIndex: 1,
      eventIndex: 2,
      handEventIndex: 2,
      frameMs: 1000,
      street: 'preflop',
      actor: 'AbbyMartin',
      action: 'raise',
      resolutionState: 'inferred',
      reasonCodes: ['focus_hint_inferred_open_raise'],
      sizeBb: '',
      framePot: 346,
      confidence: '0.33',
      focusActorDetected: '',
      focusActor: 'MrLouie',
      focusSource: 'inferred_actor_locked',
      textRaw: 'RAISE'
    }
  ];

  const traced = buildExplainabilityTrace(rows);
  assert.equal(traced.length, 2);
  assert.equal(typeof traced[0].explainTrace, 'string');
  assert.match(traced[0].explainTrace, /Наблюдение:/);
  assert.match(traced[0].explainTrace, /Уже зафиксировано до этого:/);
  assert.match(traced[1].explainTrace, /Вывод: действие выведено по контексту/);
  assert.match(traced[1].explainTrace, /следующего подтвержденного кадра/i);
});
