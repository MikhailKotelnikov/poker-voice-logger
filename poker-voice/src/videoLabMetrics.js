import { countRunEvents, validateCanonicalRun } from './videoContract.js';

function buildHandIdSet(run) {
  const set = new Set();
  if (!Array.isArray(run?.hands)) return set;
  for (const hand of run.hands) {
    const id = String(hand?.hand_id || '').trim();
    if (!id) continue;
    set.add(id);
  }
  return set;
}

function buildEventIdSet(run) {
  const set = new Set();
  if (!Array.isArray(run?.hands)) return set;
  for (const hand of run.hands) {
    const handId = String(hand?.hand_id || '').trim();
    if (!handId || !Array.isArray(hand?.events)) continue;
    for (const event of hand.events) {
      const eventId = String(event?.event_id || '').trim();
      if (!eventId) continue;
      set.add(`${handId}:${eventId}`);
    }
  }
  return set;
}

function intersectionSize(left, right) {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) count += 1;
  }
  return count;
}

function buildZeroLabeledSummary() {
  return {
    hands: 0,
    events: 0
  };
}

export function computeVideoLabMetrics({ predicted, labeled } = {}) {
  const predictedValidation = validateCanonicalRun(predicted);
  const predictedHands = Array.isArray(predictedValidation?.normalized?.hands) ? predictedValidation.normalized.hands.length : 0;
  const predictedEvents = countRunEvents(predictedValidation.normalized);

  if (!predictedValidation.ok) {
    return {
      status: 'invalid_predicted',
      predicted: {
        hands: predictedHands,
        events: predictedEvents
      },
      labeled: buildZeroLabeledSummary(),
      delta: {
        hand_count: predictedHands,
        event_count: predictedEvents
      },
      coverage: {
        hands_recall: null,
        events_recall: null
      },
      errors: predictedValidation.errors
    };
  }

  if (labeled === undefined || labeled === null) {
    return {
      status: 'no_labels',
      predicted: {
        hands: predictedHands,
        events: predictedEvents
      },
      labeled: buildZeroLabeledSummary(),
      delta: {
        hand_count: predictedHands,
        event_count: predictedEvents
      },
      coverage: {
        hands_recall: null,
        events_recall: null
      },
      errors: []
    };
  }

  const labeledValidation = validateCanonicalRun(labeled);
  if (!labeledValidation.ok) {
    return {
      status: 'invalid_labels',
      predicted: {
        hands: predictedHands,
        events: predictedEvents
      },
      labeled: buildZeroLabeledSummary(),
      delta: {
        hand_count: predictedHands,
        event_count: predictedEvents
      },
      coverage: {
        hands_recall: null,
        events_recall: null
      },
      errors: labeledValidation.errors
    };
  }

  const labeledHands = labeledValidation.normalized.hands.length;
  const labeledEvents = countRunEvents(labeledValidation.normalized);

  const predictedHandIds = buildHandIdSet(predictedValidation.normalized);
  const labeledHandIds = buildHandIdSet(labeledValidation.normalized);
  const predictedEventIds = buildEventIdSet(predictedValidation.normalized);
  const labeledEventIds = buildEventIdSet(labeledValidation.normalized);

  const matchedHands = intersectionSize(labeledHandIds, predictedHandIds);
  const matchedEvents = intersectionSize(labeledEventIds, predictedEventIds);

  return {
    status: 'ok',
    predicted: {
      hands: predictedHands,
      events: predictedEvents
    },
    labeled: {
      hands: labeledHands,
      events: labeledEvents
    },
    delta: {
      hand_count: predictedHands - labeledHands,
      event_count: predictedEvents - labeledEvents
    },
    coverage: {
      hands_recall: labeledHands > 0 ? matchedHands / labeledHands : null,
      events_recall: labeledEvents > 0 ? matchedEvents / labeledEvents : null
    },
    errors: []
  };
}
