import test from 'node:test';
import assert from 'node:assert/strict';

import { validateCanonicalRun } from '../src/videoContract.js';

function makeValidPayload() {
  return {
    version: 'canonical_hand_v1',
    video: {
      path: '/tmp/sample.mp4',
      size_bytes: 1024,
      created_at: '2026-03-03T13:00:00.000Z'
    },
    hands: [
      {
        hand_id: 'h1',
        start_ms: 1000,
        end_ms: 2000,
        events: [
          {
            event_id: 'e1',
            street: 'preflop',
            actor: 'SB_hero',
            action: 'raise',
            size_bb: 2.5,
            confidence: 0.77,
            evidence: {
              frame_ms: 1200,
              text_raw: 'SB raises'
            }
          }
        ]
      }
    ]
  };
}

test('validateCanonicalRun accepts valid canonical_hand_v1 payload', () => {
  const result = validateCanonicalRun(makeValidPayload());
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.normalized.hands.length, 1);
  assert.equal(result.normalized.hands[0].events.length, 1);
});

test('validateCanonicalRun rejects malformed payload with explicit error codes', () => {
  const payload = makeValidPayload();
  payload.version = 'v0';
  payload.video.path = '';
  payload.hands[0].end_ms = 500;
  payload.hands[0].events[0].confidence = 1.5;
  payload.hands[0].events[0].evidence.frame_ms = -1;

  const result = validateCanonicalRun(payload);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 5);
  const codes = new Set(result.errors.map((item) => item.code));
  assert.equal(codes.has('invalid_version'), true);
  assert.equal(codes.has('missing_video_path'), true);
  assert.equal(codes.has('invalid_hand_time_range'), true);
  assert.equal(codes.has('invalid_event_confidence'), true);
  assert.equal(codes.has('invalid_event_evidence_frame_ms'), true);
});
