import { validateCanonicalRun } from './videoContract.js';
import { validateReconstructedHand } from './videoValidator.js';

const RECONSTRUCTION_VERSION = 'reconstruction_run_v1';
const POSTFLOP_STREETS = new Set(['flop', 'turn', 'river']);
const STALE_RESPONSE_ACTIONS = new Set(['call', 'call_allin', 'allin']);

function toText(value) {
  return String(value ?? '').trim();
}

function toNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function unique(values = []) {
  return [...new Set(values.map((value) => toText(value)).filter(Boolean))];
}

function cloneEvent(event = {}) {
  const resolutionState = toText(event?.resolution_state || 'committed').toLowerCase() || 'committed';
  return {
    event_id: toText(event.event_id),
    street: toText(event.street || 'unknown').toLowerCase() || 'unknown',
    actor: toText(event.actor),
    action: toText(event.action).toLowerCase(),
    size_bb: event.size_bb === null || event.size_bb === undefined ? null : Number(event.size_bb),
    confidence: Number.isFinite(Number(event.confidence)) ? Number(event.confidence) : 0,
    evidence: {
      frame_ms: Math.max(0, Math.round(Number(event?.evidence?.frame_ms || 0))),
      text_raw: toText(event?.evidence?.text_raw),
      ...(event?.evidence?.focus_actor ? { focus_actor: toText(event.evidence.focus_actor) } : {}),
      ...(Number.isFinite(Number(event?.evidence?.frame_pot)) ? { frame_pot: Number(event.evidence.frame_pot) } : {})
    },
    ...(resolutionState !== 'committed' ? { resolution_state: resolutionState } : {}),
    ...(Array.isArray(event?.reason_codes) && event.reason_codes.length ? { reason_codes: unique(event.reason_codes) } : {}),
    ...(event?.proof && typeof event.proof === 'object' ? { proof: { ...event.proof } } : {})
  };
}

function isAggression(action = '') {
  const normalized = toText(action).toLowerCase();
  return normalized === 'bet'
    || normalized === 'raise'
    || normalized === 'allin'
    || normalized === 'bet_allin'
    || normalized === 'raise_allin';
}

function normalizeStreetActions(events = []) {
  const out = [];
  let currentStreet = '';
  let hasAggression = false;
  for (const rawEvent of events) {
    const event = cloneEvent(rawEvent);
    if (event.street !== currentStreet) {
      currentStreet = event.street;
      hasAggression = false;
    }

    if (POSTFLOP_STREETS.has(currentStreet)) {
      if (event.action === 'raise' && !hasAggression) {
        event.action = 'bet';
      } else if (event.action === 'raise_allin' && !hasAggression) {
        event.action = 'bet_allin';
      } else if (event.action === 'allin') {
        event.action = hasAggression ? 'call_allin' : 'bet_allin';
      }
    }

    if (isAggression(event.action)) hasAggression = true;
    out.push(event);
  }
  return out;
}

function markInferredByNextAnchor(event, nextEvent) {
  const potBefore = toNumberOrNull(event?.evidence?.frame_pot);
  const potAfter = toNumberOrNull(nextEvent?.evidence?.frame_pot);
  if (potBefore === null || potAfter === null || potAfter <= potBefore) return false;

  event.resolution_state = 'inferred';
  event.reason_codes = unique([...(event.reason_codes || []), 'anchor_window_pot_delta_confirms_response']);
  event.proof = {
    type: 'anchor_window',
    pot_before: potBefore,
    pot_after: potAfter,
    amount: potAfter - potBefore,
    pending_responders: [event.actor],
    anchor_from_frame_ms: toNumberOrNull(event?.evidence?.frame_ms),
    anchor_to_frame_ms: toNumberOrNull(nextEvent?.evidence?.frame_ms),
    chosen_resolution: `${event.actor} ${event.action}`.trim(),
    next_event_id: toText(nextEvent?.event_id)
  };
  return true;
}

function resolvePendingAnchorWindows(events = []) {
  if (!events.length) return events;
  const out = events.map((event) => ({ ...event, evidence: { ...event.evidence } }));

  for (let index = 1; index < out.length; index += 1) {
    const prev = out[index - 1];
    const event = out[index];
    const next = out[index + 1] || null;
    if (event.street !== 'preflop') continue;
    if (!STALE_RESPONSE_ACTIONS.has(event.action)) continue;
    if (toText(event?.resolution_state).toLowerCase() === 'inferred') continue;

    const prevPot = toNumberOrNull(prev?.evidence?.frame_pot);
    const currPot = toNumberOrNull(event?.evidence?.frame_pot);
    if (prevPot === null || currPot === null || currPot > prevPot * 1.001) continue;

    const nextPot = toNumberOrNull(next?.evidence?.frame_pot);
    const streetChanged = Boolean(next && toText(next.street) !== toText(event.street));
    const potGrew = nextPot !== null && currPot !== null && nextPot > currPot * 1.001;

    if (next && (streetChanged || potGrew) && markInferredByNextAnchor(event, next)) {
      continue;
    }

    event.resolution_state = 'pending';
    event.reason_codes = unique([...(event.reason_codes || []), 'pending_preflop_response_unresolved_before_transition']);
  }

  return out;
}

function reconstructHand(hand = {}) {
  const normalizedEvents = normalizeStreetActions(Array.isArray(hand?.events) ? hand.events : []);
  const reconstructedEvents = resolvePendingAnchorWindows(normalizedEvents);
  const validation = validateReconstructedHand({
    hand_id: hand?.hand_id,
    events: reconstructedEvents
  });

  return {
    hand_id: toText(hand?.hand_id),
    start_ms: Math.max(0, Math.round(Number(hand?.start_ms || 0))),
    end_ms: Math.max(0, Math.round(Number(hand?.end_ms || 0))),
    events: reconstructedEvents,
    validation
  };
}

export function buildReconstructionRun(runPayload = {}) {
  const canonicalValidation = validateCanonicalRun(runPayload);
  if (!canonicalValidation.ok) {
    return {
      version: RECONSTRUCTION_VERSION,
      source_version: toText(runPayload?.version),
      video: {
        path: toText(runPayload?.video?.path),
        size_bytes: Number(runPayload?.video?.size_bytes || 0),
        created_at: toText(runPayload?.video?.created_at)
      },
      hands: [],
      meta: {
        status: 'invalid_canonical_input',
        errors: canonicalValidation.errors
      }
    };
  }

  const rawHands = Array.isArray(runPayload?.hands) ? runPayload.hands : [];
  const hands = rawHands.map((hand) => reconstructHand(hand));
  const invalidHands = hands.filter((hand) => hand?.validation?.status === 'invalid').length;

  return {
    version: RECONSTRUCTION_VERSION,
    source_version: canonicalValidation.normalized.version,
    video: canonicalValidation.normalized.video,
    hands,
    meta: {
      source_event_count: canonicalValidation.normalized.hands.reduce(
        (sum, hand) => sum + (Array.isArray(hand?.events) ? hand.events.length : 0),
        0
      ),
      invalid_hands: invalidHands
    }
  };
}

export { RECONSTRUCTION_VERSION };
