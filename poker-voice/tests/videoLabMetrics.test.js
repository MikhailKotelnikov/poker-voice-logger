import test from 'node:test';
import assert from 'node:assert/strict';

import { computeVideoLabMetrics } from '../src/videoLabMetrics.js';

function makeRun(handCount = 1, eventCountPerHand = 2) {
  const hands = [];
  for (let handIndex = 0; handIndex < handCount; handIndex += 1) {
    const handId = `h${handIndex + 1}`;
    const events = [];
    for (let eventIndex = 0; eventIndex < eventCountPerHand; eventIndex += 1) {
      events.push({
        event_id: `e${eventIndex + 1}`,
        street: 'preflop',
        actor: 'SB_hero',
        action: 'call',
        size_bb: 1,
        confidence: 0.8,
        evidence: {
          frame_ms: (handIndex + 1) * 1000 + eventIndex * 100,
          text_raw: 'test'
        }
      });
    }
    hands.push({
      hand_id: handId,
      start_ms: handIndex * 2000,
      end_ms: handIndex * 2000 + 1500,
      events
    });
  }
  return {
    version: 'canonical_hand_v1',
    video: {
      path: '/tmp/sample.mp4',
      size_bytes: 2048,
      created_at: '2026-03-03T13:00:00.000Z'
    },
    hands
  };
}

test('computeVideoLabMetrics calculates deltas and recall coverage with valid labels', () => {
  const predicted = makeRun(2, 2); // 4 events
  const labeled = makeRun(1, 2); // 2 events

  const metrics = computeVideoLabMetrics({ predicted, labeled });
  assert.equal(metrics.status, 'ok');
  assert.equal(metrics.predicted.hands, 2);
  assert.equal(metrics.predicted.events, 4);
  assert.equal(metrics.labeled.hands, 1);
  assert.equal(metrics.labeled.events, 2);
  assert.equal(metrics.delta.hand_count, 1);
  assert.equal(metrics.delta.event_count, 2);
  assert.equal(metrics.coverage.hands_recall, 1);
  assert.equal(metrics.coverage.events_recall, 1);
});

test('computeVideoLabMetrics reports invalid_labels on malformed label payload', () => {
  const predicted = makeRun(1, 1);
  const labeled = { version: 'canonical_hand_v1', video: {}, hands: 'bad' };

  const metrics = computeVideoLabMetrics({ predicted, labeled });
  assert.equal(metrics.status, 'invalid_labels');
  assert.equal(Array.isArray(metrics.errors), true);
  assert.equal(metrics.errors.length > 0, true);
  assert.equal(metrics.labeled.hands, 0);
  assert.equal(metrics.labeled.events, 0);
  assert.equal(metrics.coverage.hands_recall, null);
  assert.equal(metrics.coverage.events_recall, null);
});
