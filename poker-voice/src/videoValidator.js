function toText(value) {
  return String(value ?? '').trim();
}

function toNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function failedChecks(checks = {}) {
  return Object.entries(checks)
    .filter(([, status]) => status === 'fail')
    .map(([name]) => name);
}

export function validateReconstructedHand(hand = {}) {
  const checks = {
    potReconciliation: 'pass',
    actorOrder: 'pass',
    streetClosure: 'pass',
    requiredResponses: 'pass',
    stackNonNegative: 'unknown'
  };
  const warnings = [];
  const errors = [];
  const events = Array.isArray(hand?.events) ? hand.events : [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const prev = index > 0 ? events[index - 1] : null;
    const resolutionState = toText(event?.resolution_state || 'committed').toLowerCase() || 'committed';
    const proof = event?.proof && typeof event.proof === 'object' ? event.proof : null;

    if (prev) {
      const sameStreet = toText(prev.street) === toText(event.street);
      const sameActor = toText(prev.actor) && toText(prev.actor) === toText(event.actor);
      if (sameStreet && sameActor) {
        checks.actorOrder = 'fail';
        errors.push({
          code: 'illegal_same_actor_repeat',
          event_id: toText(event?.event_id),
          message: `Actor ${toText(event.actor)} acted twice consecutively on ${toText(event.street)}.`
        });
      }
    }

    if (proof) {
      const potBefore = toNumberOrNull(proof.pot_before);
      const potAfter = toNumberOrNull(proof.pot_after);
      const amount = toNumberOrNull(proof.amount);
      if (potBefore === null || potAfter === null || potAfter < potBefore) {
        checks.potReconciliation = 'fail';
        errors.push({
          code: 'invalid_proof_pot_range',
          event_id: toText(event?.event_id),
          message: 'Proof has invalid pot_before/pot_after.'
        });
      } else if (amount !== null && Math.abs((potAfter - potBefore) - amount) > 0.0001) {
        checks.potReconciliation = 'fail';
        errors.push({
          code: 'proof_amount_mismatch',
          event_id: toText(event?.event_id),
          message: 'Proof amount does not match pot delta.'
        });
      }
    }

    if (resolutionState === 'pending') {
      checks.requiredResponses = 'fail';
      errors.push({
        code: 'pending_response_unresolved',
        event_id: toText(event?.event_id),
        message: `Pending action for ${toText(event.actor)} was not resolved.`
      });
    }
  }

  for (let index = 1; index < events.length; index += 1) {
    const prev = events[index - 1];
    const event = events[index];
    if (toText(prev.street) !== toText(event.street)) {
      const unresolvedBeforeTransition = events
        .slice(0, index)
        .some((candidate) => toText(candidate?.street) === toText(prev.street)
          && toText(candidate?.resolution_state || 'committed').toLowerCase() === 'pending');
      if (unresolvedBeforeTransition) {
        checks.streetClosure = 'fail';
        if (checks.requiredResponses !== 'fail') checks.requiredResponses = 'fail';
        errors.push({
          code: 'street_transition_with_unresolved_response',
          event_id: toText(event?.event_id),
          message: `Street transitioned to ${toText(event.street)} while previous street had unresolved responses.`
        });
      }
    }
  }

  const failed = failedChecks(checks);
  const status = failed.length ? 'invalid' : 'valid';
  if (!failed.length && events.some((event) => toText(event?.resolution_state).toLowerCase() === 'ambiguous')) {
    warnings.push({
      code: 'ambiguous_actions_present',
      message: 'Hand contains ambiguous actions and should stay in review mode.'
    });
  }

  return {
    status,
    checks,
    warnings,
    errors
  };
}
