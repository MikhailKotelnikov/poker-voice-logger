import test from 'node:test';
import assert from 'node:assert/strict';

import { validateReconstructedHand } from '../src/videoValidator.js';

test('validateReconstructedHand fails pot reconciliation when proof amount does not match pot delta', () => {
  const result = validateReconstructedHand({
    hand_id: 'h1',
    events: [
      {
        event_id: 'e1',
        street: 'preflop',
        actor: 'ZootedCamel',
        action: 'call',
        resolution_state: 'inferred',
        proof: {
          pot_before: 2301,
          pot_after: 3068,
          amount: 500
        }
      }
    ]
  });

  assert.equal(result.status, 'invalid');
  assert.equal(result.checks.potReconciliation, 'fail');
});

test('validateReconstructedHand fails actor order when same actor acts twice consecutively on same street', () => {
  const result = validateReconstructedHand({
    hand_id: 'h1',
    events: [
      {
        event_id: 'e1',
        street: 'flop',
        actor: 'AbbyMartin',
        action: 'bet'
      },
      {
        event_id: 'e2',
        street: 'flop',
        actor: 'AbbyMartin',
        action: 'call'
      }
    ]
  });

  assert.equal(result.status, 'invalid');
  assert.equal(result.checks.actorOrder, 'fail');
});
