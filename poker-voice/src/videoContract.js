const CANONICAL_VERSION = 'canonical_hand_v1';
const ALLOWED_STREETS = new Set(['preflop', 'flop', 'turn', 'river', 'unknown']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addError(errors, code, path, message) {
  errors.push({ code, path, message });
}

function toText(value) {
  return String(value ?? '').trim();
}

function isNonNegativeFinite(value) {
  return Number.isFinite(value) && value >= 0;
}

export function countRunEvents(run) {
  if (!Array.isArray(run?.hands)) return 0;
  return run.hands.reduce((sum, hand) => sum + (Array.isArray(hand?.events) ? hand.events.length : 0), 0);
}

export function validateCanonicalRun(payload) {
  const errors = [];
  const normalized = {
    version: '',
    video: {
      path: '',
      size_bytes: 0,
      created_at: ''
    },
    hands: []
  };

  if (!isPlainObject(payload)) {
    addError(errors, 'invalid_payload_type', 'root', 'Canonical run payload must be an object.');
    return { ok: false, errors, normalized };
  }

  normalized.version = toText(payload.version);
  if (normalized.version !== CANONICAL_VERSION) {
    addError(errors, 'invalid_version', 'version', `Expected ${CANONICAL_VERSION}.`);
  }

  if (!isPlainObject(payload.video)) {
    addError(errors, 'invalid_video_object', 'video', 'video must be an object.');
  } else {
    normalized.video.path = toText(payload.video.path);
    normalized.video.size_bytes = Number(payload.video.size_bytes);
    normalized.video.created_at = toText(payload.video.created_at);

    if (!normalized.video.path) {
      addError(errors, 'missing_video_path', 'video.path', 'video.path is required.');
    }
    if (!isNonNegativeFinite(normalized.video.size_bytes)) {
      addError(errors, 'invalid_video_size_bytes', 'video.size_bytes', 'video.size_bytes must be a non-negative number.');
    }
    if (!normalized.video.created_at) {
      addError(errors, 'missing_video_created_at', 'video.created_at', 'video.created_at is required.');
    }
  }

  if (!Array.isArray(payload.hands)) {
    addError(errors, 'invalid_hands_array', 'hands', 'hands must be an array.');
    return { ok: false, errors, normalized };
  }

  normalized.hands = payload.hands.map((hand, handIndex) => {
    const handPath = `hands[${handIndex}]`;
    if (!isPlainObject(hand)) {
      addError(errors, 'invalid_hand_object', handPath, 'Each hand must be an object.');
      return {
        hand_id: '',
        start_ms: 0,
        end_ms: 0,
        events: []
      };
    }

    const normalizedHand = {
      hand_id: toText(hand.hand_id),
      start_ms: Number(hand.start_ms),
      end_ms: Number(hand.end_ms),
      events: []
    };

    if (!normalizedHand.hand_id) {
      addError(errors, 'missing_hand_id', `${handPath}.hand_id`, 'hand_id is required.');
    }
    if (!isNonNegativeFinite(normalizedHand.start_ms) || !isNonNegativeFinite(normalizedHand.end_ms) || normalizedHand.end_ms < normalizedHand.start_ms) {
      addError(errors, 'invalid_hand_time_range', handPath, 'Hand must have valid start_ms/end_ms with end_ms >= start_ms.');
    }

    if (!Array.isArray(hand.events)) {
      addError(errors, 'invalid_hand_events', `${handPath}.events`, 'events must be an array.');
      return normalizedHand;
    }

    normalizedHand.events = hand.events.map((event, eventIndex) => {
      const eventPath = `${handPath}.events[${eventIndex}]`;
      if (!isPlainObject(event)) {
        addError(errors, 'invalid_event_object', eventPath, 'Event must be an object.');
        return {
          event_id: '',
          street: 'unknown',
          actor: '',
          action: '',
          size_bb: null,
          confidence: 0,
          evidence: {
            frame_ms: 0,
            text_raw: ''
          }
        };
      }

      const normalizedEvent = {
        event_id: toText(event.event_id),
        street: toText(event.street).toLowerCase() || 'unknown',
        actor: toText(event.actor),
        action: toText(event.action),
        size_bb: event.size_bb === null || event.size_bb === undefined ? null : Number(event.size_bb),
        confidence: Number(event.confidence),
        evidence: {
          frame_ms: Number(event?.evidence?.frame_ms),
          text_raw: toText(event?.evidence?.text_raw)
        }
      };

      if (!normalizedEvent.event_id) {
        addError(errors, 'missing_event_id', `${eventPath}.event_id`, 'event_id is required.');
      }
      if (!ALLOWED_STREETS.has(normalizedEvent.street)) {
        addError(errors, 'invalid_event_street', `${eventPath}.street`, 'street must be preflop/flop/turn/river/unknown.');
      }
      if (!normalizedEvent.actor) {
        addError(errors, 'missing_event_actor', `${eventPath}.actor`, 'actor is required.');
      }
      if (!normalizedEvent.action) {
        addError(errors, 'missing_event_action', `${eventPath}.action`, 'action is required.');
      }
      if (normalizedEvent.size_bb !== null && !isNonNegativeFinite(normalizedEvent.size_bb)) {
        addError(errors, 'invalid_event_size_bb', `${eventPath}.size_bb`, 'size_bb must be null or a non-negative number.');
      }
      if (!Number.isFinite(normalizedEvent.confidence) || normalizedEvent.confidence < 0 || normalizedEvent.confidence > 1) {
        addError(errors, 'invalid_event_confidence', `${eventPath}.confidence`, 'confidence must be in [0..1].');
      }
      if (!isPlainObject(event.evidence)) {
        addError(errors, 'invalid_event_evidence', `${eventPath}.evidence`, 'evidence must be an object.');
      } else {
        if (!isNonNegativeFinite(normalizedEvent.evidence.frame_ms)) {
          addError(errors, 'invalid_event_evidence_frame_ms', `${eventPath}.evidence.frame_ms`, 'frame_ms must be a non-negative number.');
        }
      }

      return normalizedEvent;
    });

    return normalizedHand;
  });

  return {
    ok: errors.length === 0,
    errors,
    normalized
  };
}

export function buildPlaceholderCanonicalRun({ videoPath, sizeBytes, createdAtIso }) {
  return {
    version: CANONICAL_VERSION,
    video: {
      path: toText(videoPath),
      size_bytes: Number(sizeBytes),
      created_at: toText(createdAtIso)
    },
    hands: [],
    meta: {
      extractor_stage: 'placeholder'
    }
  };
}

export { CANONICAL_VERSION, ALLOWED_STREETS };
