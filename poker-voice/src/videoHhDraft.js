import { validateCanonicalRun } from './videoContract.js';

function formatEvent(event) {
  const actor = String(event?.actor || '').trim();
  const action = String(event?.action || '').trim();
  const size = event?.size_bb;
  const sizePart = Number.isFinite(size) ? ` ${size}bb` : '';
  return `${actor} ${action}${sizePart}`.trim();
}

function joinStreetEvents(events = []) {
  return events.map(formatEvent).filter(Boolean).join(' / ');
}

export function buildHhDraftFromCanonical(runPayload) {
  const validation = validateCanonicalRun(runPayload);
  if (!validation.ok) {
    return {
      version: 'hh_draft_v1',
      source_version: String(runPayload?.version || ''),
      ok: false,
      errors: validation.errors,
      hands: []
    };
  }

  const hands = validation.normalized.hands.map((hand) => {
    const byStreet = {
      preflop: [],
      flop: [],
      turn: [],
      river: [],
      unknown: []
    };

    for (const event of hand.events) {
      const street = byStreet[event.street] ? event.street : 'unknown';
      byStreet[street].push(event);
    }

    return {
      hand_id: hand.hand_id,
      preflop: joinStreetEvents(byStreet.preflop),
      flop: joinStreetEvents(byStreet.flop),
      turn: joinStreetEvents(byStreet.turn),
      river: joinStreetEvents(byStreet.river),
      unresolved: joinStreetEvents(byStreet.unknown)
    };
  });

  return {
    version: 'hh_draft_v1',
    source_version: validation.normalized.version,
    ok: true,
    errors: [],
    hands
  };
}
