import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReconstructionRun } from '../src/videoReconstruction.js';

function makeRun(events = []) {
  return {
    version: 'canonical_hand_v1',
    video: {
      path: '/tmp/sample.mp4',
      size_bytes: 100,
      created_at: '2026-03-03T13:00:00.000Z'
    },
    hands: [
      {
        hand_id: 'video_hand_0001',
        start_ms: 0,
        end_ms: 35000,
        events
      }
    ]
  };
}

test('buildReconstructionRun infers stale preflop response from next anchor pot delta', () => {
  const run = makeRun([
    { event_id: 'e1', street: 'preflop', actor: 'leeuw', action: 'fold', size_bb: null, confidence: 0.99, evidence: { frame_ms: 0, text_raw: 'FOLD', frame_pot: 346 } },
    { event_id: 'e2', street: 'preflop', actor: 'AbbyMartin', action: 'raise', size_bb: null, confidence: 0.99, evidence: { frame_ms: 0, text_raw: 'RAISE', frame_pot: 346 } },
    { event_id: 'e3', street: 'preflop', actor: 'MrLouie', action: 'fold', size_bb: null, confidence: 0.99, evidence: { frame_ms: 3000, text_raw: 'FOLD', frame_pot: 346 } },
    { event_id: 'e4', street: 'preflop', actor: 'ZootedCamel', action: 'call', size_bb: null, confidence: 0.98, evidence: { frame_ms: 11000, text_raw: 'CALL', frame_pot: 569 } },
    { event_id: 'e5', street: 'preflop', actor: 'ilsy', action: 'raise', size_bb: null, confidence: 0.99, evidence: { frame_ms: 14000, text_raw: 'RAISE', frame_pot: 1534 } },
    { event_id: 'e6', street: 'preflop', actor: 'PickleBaller', action: 'fold', size_bb: null, confidence: 0.99, evidence: { frame_ms: 14000, text_raw: 'FOLD', frame_pot: 1534 } },
    { event_id: 'e7', street: 'preflop', actor: 'AbbyMartin', action: 'call', size_bb: null, confidence: 0.87, evidence: { frame_ms: 27000, text_raw: 'CALL', frame_pot: 2301 } },
    { event_id: 'e8', street: 'preflop', actor: 'ZootedCamel', action: 'call', size_bb: null, confidence: 0.86, evidence: { frame_ms: 30000, text_raw: 'CALL', frame_pot: 2301 } },
    { event_id: 'e9', street: 'flop', actor: 'ilsy', action: 'check', size_bb: null, confidence: 0.99, evidence: { frame_ms: 35000, text_raw: 'CHECK', frame_pot: 3068 } }
  ]);

  const reconstruction = buildReconstructionRun(run);
  const hand = reconstruction.hands[0];
  const zootCall = hand.events.find((event) => event.event_id === 'e8');

  assert.equal(reconstruction.version, 'reconstruction_run_v1');
  assert.equal(zootCall.resolution_state, 'inferred');
  assert.equal(zootCall.reason_codes.includes('anchor_window_pot_delta_confirms_response'), true);
  assert.equal(zootCall.proof.pot_before, 2301);
  assert.equal(zootCall.proof.pot_after, 3068);
  assert.equal(zootCall.proof.amount, 767);
  assert.equal(hand.validation.status, 'valid');
  assert.equal(hand.validation.checks.requiredResponses, 'pass');
  assert.equal(hand.validation.checks.streetClosure, 'pass');
});

test('buildReconstructionRun marks hand invalid when street changes with unresolved pending responder', () => {
  const run = makeRun([
    { event_id: 'e1', street: 'preflop', actor: 'AbbyMartin', action: 'raise', size_bb: null, confidence: 0.99, evidence: { frame_ms: 0, text_raw: 'RAISE', frame_pot: 346 } },
    { event_id: 'e2', street: 'preflop', actor: 'ilsy', action: 'raise', size_bb: null, confidence: 0.99, evidence: { frame_ms: 14000, text_raw: 'RAISE', frame_pot: 1534 } },
    { event_id: 'e3', street: 'preflop', actor: 'AbbyMartin', action: 'call', size_bb: null, confidence: 0.87, evidence: { frame_ms: 27000, text_raw: 'CALL', frame_pot: 2301 } },
    { event_id: 'e4', street: 'preflop', actor: 'ZootedCamel', action: 'call', size_bb: null, confidence: 0.86, evidence: { frame_ms: 30000, text_raw: 'CALL', frame_pot: 2301 } },
    { event_id: 'e5', street: 'flop', actor: 'ilsy', action: 'check', size_bb: null, confidence: 0.99, evidence: { frame_ms: 35000, text_raw: 'CHECK', frame_pot: 2301 } }
  ]);

  const reconstruction = buildReconstructionRun(run);
  const hand = reconstruction.hands[0];
  const unresolved = hand.events.find((event) => event.event_id === 'e4');

  assert.equal(unresolved.resolution_state, 'pending');
  assert.equal(hand.validation.status, 'invalid');
  assert.equal(hand.validation.checks.requiredResponses, 'fail');
  assert.equal(hand.validation.checks.streetClosure, 'fail');
});

test('buildReconstructionRun normalizes first postflop raise token to bet', () => {
  const run = makeRun([
    { event_id: 'e1', street: 'preflop', actor: 'AbbyMartin', action: 'raise', size_bb: null, confidence: 0.99, evidence: { frame_ms: 0, text_raw: 'RAISE', frame_pot: 346 } },
    { event_id: 'e2', street: 'preflop', actor: 'leeuw', action: 'call', size_bb: null, confidence: 0.99, evidence: { frame_ms: 2000, text_raw: 'CALL', frame_pot: 569 } },
    { event_id: 'e3', street: 'flop', actor: 'AbbyMartin', action: 'raise', size_bb: null, confidence: 0.98, evidence: { frame_ms: 4000, text_raw: 'RAISE', frame_pot: 900 } }
  ]);

  const reconstruction = buildReconstructionRun(run);
  const flopEvent = reconstruction.hands[0].events.find((event) => event.event_id === 'e3');

  assert.ok(flopEvent);
  assert.equal(flopEvent.street, 'flop');
  assert.equal(flopEvent.action, 'bet');
});
