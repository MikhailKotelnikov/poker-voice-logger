import { readFramesWithPythonOcr } from './videoOcrPython.js';
import { readFramesWithAvFoundationOcr } from './videoOcrAvFoundation.js';

const ACTION_ALIASES = new Map([
  ['fold', 'fold'],
  ['folds', 'fold'],
  ['call', 'call'],
  ['calls', 'call'],
  ['check', 'check'],
  ['checks', 'check'],
  ['bet', 'bet'],
  ['bets', 'bet'],
  ['raise', 'raise'],
  ['raises', 'raise'],
  ['allin', 'allin'],
  ['all-in', 'allin'],
  ['all in', 'allin']
]);

const NOISE_NAME_TOKENS = new Set([
  'coinpoker',
  'joinwaitlist',
  'find',
  'seat',
  'pot',
  'playerinline',
  'sb',
  'bb',
  'plo',
  'dealer'
]);

function normalizeText(value) {
  return String(value || '').replace(/\u0000/g, '').trim();
}

function normalizeStreetToken(token) {
  const text = normalizeText(token).toLowerCase();
  if (!text) return '';
  if (text.includes('pre') && text.includes('flop')) return 'preflop';
  if (text.includes('flop')) return 'flop';
  if (text.includes('turn')) return 'turn';
  if (text.includes('river')) return 'river';
  return '';
}

function normalizeAction(raw) {
  const text = normalizeText(raw).toLowerCase();
  if (!text) return '';
  const compact = text.replace(/\s+/g, ' ');
  return ACTION_ALIASES.get(compact) || ACTION_ALIASES.get(compact.replace(/\s+/g, '')) || '';
}

function normalizeActor(raw) {
  return normalizeText(raw)
    .replace(/^[^A-Za-z0-9_]+/, '')
    .replace(/[^A-Za-z0-9_]+$/, '')
    .slice(0, 40);
}

function toNumberOrNull(value) {
  if (!Number.isFinite(Number(value))) return null;
  return Number(value);
}

function parseLineCandidate(entry) {
  if (typeof entry === 'string') {
    return { text: normalizeText(entry), confidence: null, cx: null, cy: null };
  }
  if (entry && typeof entry === 'object') {
    return {
      text: normalizeText(entry.text),
      confidence: Number.isFinite(entry.confidence) ? Number(entry.confidence) : null,
      cx: toNumberOrNull(entry.cx),
      cy: toNumberOrNull(entry.cy)
    };
  }
  return { text: '', confidence: null, cx: null, cy: null };
}

function isLikelyPlayerName(text) {
  const clean = normalizeActor(text);
  if (!clean) return false;
  if (clean.includes(' ')) return false;
  const lower = clean.toLowerCase();
  if (lower.length < 3) return false;
  if (!/[a-z]/i.test(clean)) return false;
  if (NOISE_NAME_TOKENS.has(lower)) return false;
  if (ACTION_ALIASES.has(lower)) return false;
  if (/^(pot\d+|plo\d+|\d+)$/.test(lower)) return false;
  return true;
}

function findNearestAnchor(line, nameAnchors) {
  if (!nameAnchors.length) return null;
  if (!Number.isFinite(line?.cx) || !Number.isFinite(line?.cy)) return nameAnchors[0];

  let best = nameAnchors[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const anchor of nameAnchors) {
    if (!Number.isFinite(anchor.cx) || !Number.isFinite(anchor.cy)) continue;
    const dx = line.cx - anchor.cx;
    const dy = line.cy - anchor.cy;
    const score = Math.sqrt(dx * dx + dy * dy);
    if (score < bestScore) {
      best = anchor;
      bestScore = score;
    }
  }
  return best || null;
}

function findNearestNameActor(line, nameAnchors) {
  const anchor = findNearestAnchor(line, nameAnchors);
  return anchor?.name || 'table_unknown';
}

function detectBoardStreetFromText(text) {
  const compact = normalizeText(text).replace(/\s+/g, '');
  if (!compact) return '';
  const cards = compact.match(/([2-9TJQKA][cdhs])/gi);
  if (!cards || cards.length < 3) return '';
  if (cards.length >= 5) return 'river';
  if (cards.length === 4) return 'turn';
  return 'flop';
}

function parsePotValue(lines = []) {
  for (const line of lines) {
    const text = normalizeText(line?.text || line);
    if (!text) continue;
    const match = text.match(/\bpot\s*([0-9][0-9,\.]*)\b/i) || text.match(/\bpot([0-9][0-9,\.]*)\b/i);
    if (!match) continue;
    const numeric = Number(String(match[1]).replace(/,/g, ''));
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  return null;
}

function parseActionToken(text) {
  const match = String(text || '').match(/^\s*(fold|call|check|bet|raise|all\s*-?\s*in)\s*([0-9]+(?:[\.,][0-9]+)?)?\s*(bb|b)?\s*$/i);
  if (!match) return null;
  const action = normalizeAction(match[1]);
  if (!action) return null;

  let sizeBb = null;
  if (match[2]) {
    const numeric = Number(String(match[2]).replace(',', '.'));
    if (Number.isFinite(numeric) && numeric >= 0) {
      sizeBb = numeric;
    }
  }

  return { action, sizeBb };
}

function parseDecidingActorFromText(text) {
  const value = normalizeText(text);
  if (!value) return '';

  const strict = value.match(/^([A-Za-z0-9_]{2,40})\s+is\s+currently\s+decid\w*/i);
  if (strict) {
    return normalizeActor(strict[1]);
  }

  const soft = value.match(/([A-Za-z0-9_]{2,40})\s+is\s+current\w*\s+decid\w*/i);
  if (soft) {
    return normalizeActor(soft[1]);
  }

  return '';
}

function detectFrameFocusActor(lines = []) {
  for (const line of lines) {
    const actor = parseDecidingActorFromText(line?.text || '');
    if (actor) return actor;
  }
  return '';
}

export function parseOcrLineToEvent({ line, frameMs, eventIndex, defaultStreet = 'unknown', confidence = null } = {}) {
  const text = normalizeText(line);
  if (!text) return null;

  const streetFromLine = normalizeStreetToken(text);
  const street = streetFromLine || defaultStreet || 'unknown';

  const actionRegex = /(?:^|\b)([A-Za-z0-9_\-]{2,40})\s+(folds?|calls?|checks?|bets?|raises?|all[-\s]?in)(?:\s+(?:to|for))?\s*([0-9]+(?:[\.,][0-9]+)?)?\s*(bb|b|x|%)?/i;
  const match = text.match(actionRegex);
  if (!match) {
    return {
      streetHint: streetFromLine || '',
      event: null
    };
  }

  const actor = normalizeActor(match[1]);
  const action = normalizeAction(match[2]);
  if (!actor || !action) {
    return {
      streetHint: streetFromLine || '',
      event: null
    };
  }

  let sizeBb = null;
  if (match[3]) {
    const numeric = Number(String(match[3]).replace(',', '.'));
    if (Number.isFinite(numeric) && numeric >= 0) {
      sizeBb = numeric;
    }
  }

  const event = {
    event_id: `e${String(eventIndex).padStart(5, '0')}`,
    street,
    actor,
    action,
    size_bb: sizeBb,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.55,
    evidence: {
      frame_ms: Math.max(0, Math.round(Number(frameMs) || 0)),
      text_raw: text
    },
    _source: 'inline_actor_action'
  };

  return {
    streetHint: streetFromLine || '',
    event
  };
}

function getBottomSeatAnchor(nameAnchors = [], frameMaxCy = null) {
  if (!Number.isFinite(frameMaxCy) || !nameAnchors.length) return null;
  const bottomAnchors = nameAnchors
    .filter((anchor) => Number.isFinite(anchor?.cy) && anchor.cy >= frameMaxCy * 0.78)
    .sort((a, b) => Number(b.cy) - Number(a.cy));
  return bottomAnchors[0] || null;
}

function distanceToAnchor(line, anchor) {
  if (!Number.isFinite(line?.cx) || !Number.isFinite(line?.cy)) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(anchor?.cx) || !Number.isFinite(anchor?.cy)) return Number.POSITIVE_INFINITY;
  const dx = line.cx - anchor.cx;
  const dy = line.cy - anchor.cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function shouldSkipBottomActionButton(line, frameMaxCy, nameAnchors = []) {
  if (!Number.isFinite(frameMaxCy) || frameMaxCy < 500) return false;
  if (!Number.isFinite(line?.cy)) return false;
  const token = parseActionToken(line?.text);
  if (!token) return false;
  if (token.sizeBb !== null) return false;
  if (line.cy < frameMaxCy * 0.82) return false;

  // Keep likely seat-level badges near bottom player name; skip centered UI buttons.
  const nearest = findNearestAnchor(line, nameAnchors);
  if (!nearest) return true;
  const dist = distanceToAnchor(line, nearest);
  if (dist <= 95) return false;
  return true;
}

function parseActionOnlyLine({ text, frameMs, eventIndex, street, confidence, actor }) {
  const token = parseActionToken(text);
  if (!token) return null;

  return {
    event_id: `e${String(eventIndex).padStart(5, '0')}`,
    street: street || 'unknown',
    actor: normalizeActor(actor) || 'table_unknown',
    action: token.action,
    size_bb: token.sizeBb,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.4,
    evidence: {
      frame_ms: Math.max(0, Math.round(Number(frameMs) || 0)),
      text_raw: text
    },
    _source: 'action_only'
  };
}

function applyPlayerStateConstraints(events = []) {
  const out = [];
  const actorState = new Map();

  for (const event of events) {
    const actor = normalizeActor(event?.actor);
    if (!actor) continue;
    const state = actorState.get(actor) || 'active';

    if (state === 'folded') continue;
    if (state === 'allin') continue;

    if (event.action === 'fold' && state === 'folded') continue;
    if (event.action === 'allin' && state === 'allin') continue;

    out.push(event);

    if (event.action === 'fold') {
      actorState.set(actor, 'folded');
    } else if (event.action === 'allin') {
      actorState.set(actor, 'allin');
    } else if (!actorState.has(actor)) {
      actorState.set(actor, 'active');
    }
  }

  return out;
}

function inferPreflopOpenRaiseFromHints(events = [], hints = [], sampleMs = 1200) {
  if (!events.length || !hints.length) return events;
  const preflopEvents = events.filter((event) => event.street === 'preflop');
  if (!preflopEvents.length) return events;

  const raiseHints = hints
    .filter((hint) => hint.action === 'raise' && hint.actor && hint.actor !== 'table_unknown')
    .sort((a, b) => a.frame_ms - b.frame_ms);
  if (!raiseHints.length) return events;

  const firstAggression = preflopEvents.find((event) => event.action === 'raise' || event.action === 'allin');
  if (!firstAggression) return events;

  const hasResponsesBeforeAggression = preflopEvents
    .filter((event) => event.evidence.frame_ms < firstAggression.evidence.frame_ms)
    .some((event) => event.action === 'call' || event.action === 'fold');

  if (!hasResponsesBeforeAggression) return events;

  for (const hint of raiseHints) {
    const alreadyHasAggression = preflopEvents.some(
      (event) => event.actor === hint.actor && (event.action === 'raise' || event.action === 'allin')
    );
    if (alreadyHasAggression) continue;
    if (hint.frame_ms > firstAggression.evidence.frame_ms) continue;

    const synthetic = {
      event_id: `e_hint_${String(hint.frame_ms).padStart(8, '0')}_${hint.actor}`,
      street: 'preflop',
      actor: hint.actor,
      action: 'raise',
      size_bb: null,
      confidence: 0.33,
      evidence: {
        frame_ms: Math.max(0, hint.frame_ms),
        text_raw: `${hint.actor} inferred raise (focus-first preflop chain)`
      },
      _source: 'focus_inferred_open_raise',
      _frame_pot: hint._frame_pot,
      _resolution_state: 'inferred',
      _reason_codes: ['focus_hint_inferred_open_raise']
    };

    const merged = [...events, synthetic].sort((left, right) => left.evidence.frame_ms - right.evidence.frame_ms);
    return merged;
  }

  return events;
}

function inferMissingPreflopResponsesBeforeStreetTransition(events = [], sampleMs = 1200) {
  if (!events.length) return events;

  const out = [];
  let openActor = '';
  let coldCallerActor = '';
  let squeezeActor = '';
  const pendingResponses = new Set();
  let lastPreflopMs = events[0]?.evidence?.frame_ms || 0;

  for (const event of events) {
    const action = normalizeAction(event?.action);
    const actor = normalizeActor(event?.actor);
    const eventMs = Math.max(0, Math.round(Number(event?.evidence?.frame_ms || 0)));

    if (event.street === 'preflop') {
      out.push(event);
      lastPreflopMs = eventMs;

      if (action === 'raise' || action === 'bet' || action === 'allin') {
        if (!openActor) {
          openActor = actor;
        } else if (!squeezeActor && actor && actor !== openActor) {
          squeezeActor = actor;
          if (coldCallerActor && coldCallerActor !== squeezeActor) {
            pendingResponses.add(openActor);
            pendingResponses.add(coldCallerActor);
            pendingResponses.delete(squeezeActor);
          }
        }
      }

      if (action === 'call' && openActor && !squeezeActor && actor && actor !== openActor && !coldCallerActor) {
        coldCallerActor = actor;
      }

      if (pendingResponses.has(actor) && (action === 'call' || action === 'fold' || action === 'allin' || action === 'raise')) {
        pendingResponses.delete(actor);
      }

      continue;
    }

    if (pendingResponses.size) {
      const orderedActors = [];
      if (openActor && pendingResponses.has(openActor)) orderedActors.push(openActor);
      if (coldCallerActor && pendingResponses.has(coldCallerActor) && coldCallerActor !== openActor) orderedActors.push(coldCallerActor);
      for (const candidate of pendingResponses) {
        if (!orderedActors.includes(candidate)) orderedActors.push(candidate);
      }

      const insertionStartMs = Math.max(
        lastPreflopMs + 1,
        eventMs - Math.max(sampleMs, 1200)
      );
      const insertionStep = Math.max(120, Math.floor(sampleMs / 4));

      for (let index = 0; index < orderedActors.length; index += 1) {
        const actorName = orderedActors[index];
        const inferredMs = insertionStartMs + (index * insertionStep);
        out.push({
          event_id: `e_hint_resp_${String(inferredMs).padStart(8, '0')}_${actorName}`,
          street: 'preflop',
          actor: actorName,
          action: 'call',
          size_bb: null,
          confidence: 0.31,
          evidence: {
            frame_ms: inferredMs,
            text_raw: `${actorName} inferred call (preflop response chain)`
          },
          _source: 'inferred_preflop_response',
          _resolution_state: 'inferred',
          _reason_codes: ['anchor_inferred_preflop_response']
        });
      }
    }

    out.push(event);
    pendingResponses.clear();
    openActor = '';
    coldCallerActor = '';
    squeezeActor = '';
  }

  return out.sort((left, right) => left.evidence.frame_ms - right.evidence.frame_ms);
}

function suppressStalePendingPreflopAggression(events = []) {
  if (!events.length) return events;

  const out = [];
  let openActor = '';
  let coldCallerActor = '';
  let squeezeActor = '';
  const pendingResponses = new Set();
  let lastPreflopPot = null;

  for (const event of events) {
    const action = normalizeAction(event?.action);
    const actor = normalizeActor(event?.actor);
    const currPot = Number(event?._frame_pot);

    if (event.street !== 'preflop') {
      out.push(event);
      openActor = '';
      coldCallerActor = '';
      squeezeActor = '';
      pendingResponses.clear();
      lastPreflopPot = null;
      continue;
    }

    if (action === 'raise' || action === 'bet' || action === 'allin') {
      if (!openActor) {
        openActor = actor;
      } else if (!squeezeActor && actor && actor !== openActor) {
        squeezeActor = actor;
        if (coldCallerActor && coldCallerActor !== squeezeActor) {
          pendingResponses.add(openActor);
          pendingResponses.add(coldCallerActor);
          pendingResponses.delete(squeezeActor);
        }
      }
    }

    if (action === 'call' && openActor && !squeezeActor && actor && actor !== openActor && !coldCallerActor) {
      coldCallerActor = actor;
    }

    const hasPotEvidence = Number.isFinite(currPot) && Number.isFinite(lastPreflopPot);
    const potDidNotGrow = hasPotEvidence && currPot <= lastPreflopPot * 1.001;
    const isPendingResponseAction = action === 'raise' || action === 'call' || action === 'allin';
    const looksLikeUncommittedSqueezeResponse = isPendingResponseAction
      && potDidNotGrow
      && action === 'call'
      && Boolean(squeezeActor)
      && actor
      && actor !== squeezeActor;
    const isStalePendingAction = (pendingResponses.has(actor) && isPendingResponseAction && potDidNotGrow)
      || looksLikeUncommittedSqueezeResponse;
    if (isStalePendingAction) {
      // Keep this actor pending for anchor-based preflop response inference near street transition.
      if (actor) pendingResponses.add(actor);
      continue;
    }

    out.push(event);

    if (pendingResponses.has(actor) && (action === 'call' || action === 'fold' || action === 'allin' || action === 'raise')) {
      pendingResponses.delete(actor);
    }
    if (Number.isFinite(currPot)) {
      lastPreflopPot = currPot;
    }
  }

  return out;
}

function inferPrerollPreflopFolds(events = [], sampleMs = 1200) {
  if (!events.length) return events;

  const out = events.map((event) => ({
    ...event,
    evidence: {
      frame_ms: event?.evidence?.frame_ms,
      text_raw: event?.evidence?.text_raw
    }
  }));

  const firstAggressionIndex = out.findIndex(
    (event) => event.street === 'preflop' && (event.action === 'raise' || event.action === 'bet' || event.action === 'allin')
  );
  if (firstAggressionIndex < 0) return out;

  const firstAggression = out[firstAggressionIndex];
  const firstAggMs = Math.max(0, Math.round(Number(firstAggression?.evidence?.frame_ms || 0)));
  const foldWindowEnd = firstAggMs + Math.max(sampleMs, 1200);

  const candidates = [];
  for (let index = firstAggressionIndex + 1; index < out.length; index += 1) {
    const event = out[index];
    if (event.street !== 'preflop') break;
    const eventMs = Math.max(0, Math.round(Number(event?.evidence?.frame_ms || 0)));
    if (eventMs > foldWindowEnd) break;
    if (event.action !== 'fold') continue;
    if (event.actor === firstAggression.actor) continue;

    const hasEarlierActorEvent = out.some((entry, entryIndex) => entryIndex < firstAggressionIndex && entry.actor === event.actor);
    if (hasEarlierActorEvent) continue;
    candidates.push({ index, eventMs, actor: event.actor });
  }

  if (!candidates.length) return out;

  let shiftOffset = candidates.length;
  for (const candidate of candidates) {
    const event = out[candidate.index];
    const newMs = Math.max(0, firstAggMs - shiftOffset);
    event.evidence.frame_ms = newMs;
    event.evidence.text_raw = `${event.evidence.text_raw} [pre_roll_inferred_order]`;
    event._pre_roll_inferred_order = true;
    shiftOffset -= 1;
  }

  return out.sort((left, right) => {
    const msDiff = left.evidence.frame_ms - right.evidence.frame_ms;
    if (msDiff !== 0) return msDiff;
    const leftPriority = left._pre_roll_inferred_order ? 1 : 0;
    const rightPriority = right._pre_roll_inferred_order ? 1 : 0;
    return rightPriority - leftPriority;
  });
}

function normalizePostflopActionSemantics(events = []) {
  if (!events.length) return events;

  const postflop = new Set(['flop', 'turn', 'river']);
  const out = [];
  let currentStreet = '';
  let hasAggression = false;

  for (const event of events) {
    const copy = {
      ...event,
      evidence: {
        frame_ms: event?.evidence?.frame_ms,
        text_raw: event?.evidence?.text_raw
      }
    };

    if (copy.street !== currentStreet) {
      currentStreet = copy.street;
      hasAggression = false;
    }

    const action = normalizeAction(copy.action);
    if (postflop.has(currentStreet)) {
      if (action === 'raise' && !hasAggression) {
        copy.action = 'bet';
      } else if (action === 'allin') {
        copy.action = hasAggression ? 'call_allin' : 'bet_allin';
      }
    }

    const resolved = normalizeAction(copy.action);
    const isAggression = resolved === 'bet'
      || resolved === 'raise'
      || resolved === 'allin'
      || copy.action === 'bet_allin'
      || copy.action === 'raise_allin';
    if (isAggression) {
      hasAggression = true;
    }

    out.push(copy);
  }

  return out;
}

function dedupeEvents(events = [], { dedupeWindowMs = 1400, sampleMs = 1200 } = {}) {
  const out = [];
  const lastByKey = new Map();
  for (const event of events) {
    const key = `${event.street}|${event.actor}|${event.action}|${event.size_bb === null ? '' : event.size_bb}`;
    const previous = lastByKey.get(key);
    let windowMs = dedupeWindowMs;
    if (event.actor === 'table_unknown') {
      windowMs = Math.max(windowMs, sampleMs * 10, 12000);
    }
    if (event._source === 'action_only') {
      windowMs = Math.max(windowMs, sampleMs * 12, 18000);
    }
    if (event.size_bb === null) {
      windowMs = Math.max(windowMs, sampleMs * 8, 12000);
    }
    if (event._source === 'action_only' && event.action === 'fold') {
      windowMs = Math.max(windowMs, sampleMs * 20, 30000);
    }

    if (previous && Math.abs(event.evidence.frame_ms - previous.evidence.frame_ms) <= windowMs) {
      continue;
    }
    if (previous && event._source === 'action_only' && event.size_bb === null) {
      const prevPot = Number(previous._frame_pot);
      const currPot = Number(event._frame_pot);
      const stablePot = Number.isFinite(prevPot)
        && Number.isFinite(currPot)
        && prevPot > 0
        && Math.abs(currPot - prevPot) / prevPot <= 0.12;
      if (stablePot) {
        continue;
      }
    }

    lastByKey.set(key, event);
    out.push(event);
  }
  return out;
}

function splitEventsIntoHands(
  events = [],
  {
    handGapMs = 10000,
    potDropRatio = 0.35,
    potHighMin = 600,
    minGapForPotSplitMs = 600
  } = {}
) {
  if (!events.length) return [];

  const hands = [];
  let current = [events[0]];

  for (let i = 1; i < events.length; i += 1) {
    const prev = events[i - 1];
    const event = events[i];

    const gapMs = event.evidence.frame_ms - prev.evidence.frame_ms;
    const prevPot = Number(prev._frame_pot);
    const currPot = Number(event._frame_pot);
    const hasValidPot = Number.isFinite(prevPot) && Number.isFinite(currPot);
    const potDrop = hasValidPot && prevPot >= potHighMin && currPot <= prevPot * potDropRatio;
    const potSplitAllowed = gapMs >= minGapForPotSplitMs;

    const shouldSplit = gapMs >= handGapMs
      || (potDrop && potSplitAllowed);

    if (shouldSplit) {
      hands.push(current);
      current = [event];
    } else {
      current.push(event);
    }
  }

  if (current.length) hands.push(current);
  return hands;
}

function applyStreetFlowHints(event, currentStreet, flowState) {
  const action = normalizeAction(event?.action);
  if (!action) return currentStreet;

  if (currentStreet === 'preflop') {
    if (action === 'raise' || action === 'bet' || action === 'allin') {
      flowState.preflopAggressionSeen = true;
      if (!flowState.openActor) {
        flowState.openActor = event.actor;
      } else if (!flowState.squeezeActor && event.actor !== flowState.openActor) {
        flowState.squeezeActor = event.actor;
        if (flowState.coldCallerActor && flowState.coldCallerActor !== flowState.squeezeActor) {
          flowState.pendingPreflopResponses.add(flowState.openActor);
          flowState.pendingPreflopResponses.add(flowState.coldCallerActor);
          flowState.pendingPreflopResponses.delete(flowState.squeezeActor);
        }
      }
    }
    if (action === 'call' && flowState.openActor && !flowState.squeezeActor && event.actor !== flowState.openActor && !flowState.coldCallerActor) {
      flowState.coldCallerActor = event.actor;
    }
    if (action === 'call' || action === 'fold' || action === 'check' || action === 'allin' || action === 'raise') {
      flowState.preflopResponseSeen = true;
      if (flowState.pendingPreflopResponses.has(event.actor)) {
        flowState.pendingPreflopResponses.delete(event.actor);
      }
    }

    const canPromoteFlop = flowState.preflopAggressionSeen
      && flowState.preflopResponseSeen;
    if (canPromoteFlop && action === 'check' && event._source === 'action_only') {
      event.street = 'flop';
      return 'flop';
    }
  }

  return currentStreet;
}

function sanitizeEvent(event) {
  const rawResolution = String(event?._resolution_state || '').trim().toLowerCase();
  let resolutionState = rawResolution;
  if (resolutionState !== 'inferred' && resolutionState !== 'pending' && resolutionState !== 'committed') {
    const source = String(event?._source || '').toLowerCase();
    resolutionState = source.startsWith('inferred_') || source.startsWith('focus_inferred_')
      ? 'inferred'
      : 'committed';
  }

  const explicitReasonCodes = Array.isArray(event?._reason_codes)
    ? event._reason_codes.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const reasonCodes = explicitReasonCodes.length
    ? [...new Set(explicitReasonCodes)]
    : (resolutionState === 'inferred' ? ['inferred_from_context'] : []);

  const focusActor = normalizeActor(event?._focus_actor || event?.evidence?.focus_actor || '');
  const evidence = {
    frame_ms: event.evidence.frame_ms,
    text_raw: event.evidence.text_raw
  };
  if (focusActor) {
    evidence.focus_actor = focusActor;
  }
  if (Number.isFinite(Number(event?._frame_pot))) {
    evidence.frame_pot = Number(event._frame_pot);
  }

  const clean = {
    event_id: event.event_id,
    street: event.street,
    actor: event.actor,
    action: event.action,
    size_bb: event.size_bb,
    confidence: event.confidence,
    evidence
  };
  if (resolutionState && resolutionState !== 'committed') {
    clean.resolution_state = resolutionState;
  }
  if (reasonCodes.length) {
    clean.reason_codes = reasonCodes;
  }
  return clean;
}

export function buildCanonicalRunFromOcrFrames({
  videoPath,
  sizeBytes,
  createdAtIso,
  frames = [],
  extractorStage = 'baseline_ocr',
  sampleMs = 1000,
  dedupeWindowMs = 1400,
  handGapMs = 10000,
  warnings = [],
  extraMeta = {}
} = {}) {
  const sortedFrames = Array.isArray(frames)
    ? [...frames].sort((a, b) => Number(a?.ms || 0) - Number(b?.ms || 0))
    : [];

  const rawEvents = [];
  const bottomActionHints = [];
  let currentStreet = 'preflop';
  let eventIndex = 1;
  let lastFramePot = null;
  let focusCueFrames = 0;
  const flowState = {
    preflopAggressionSeen: false,
    preflopResponseSeen: false,
    openActor: '',
    coldCallerActor: '',
    squeezeActor: '',
    pendingPreflopResponses: new Set()
  };

  for (const frame of sortedFrames) {
    const frameMs = Math.max(0, Math.round(Number(frame?.ms) || 0));
    const lines = Array.isArray(frame?.lines) ? frame.lines.map(parseLineCandidate).filter((item) => item.text) : [];
    const cyValues = lines.map((line) => line.cy).filter((value) => Number.isFinite(value));
    const frameMaxCy = cyValues.length ? Math.max(...cyValues) : null;
    const prevFramePot = Number.isFinite(lastFramePot) ? Number(lastFramePot) : null;

    const framePot = parsePotValue(lines);
    const hasFramePot = Number.isFinite(framePot);
    const potResetBetweenFrames = hasFramePot
      && Number.isFinite(lastFramePot)
      && Number(lastFramePot) >= 600
      && Number(framePot) <= Number(lastFramePot) * 0.35;
    if (potResetBetweenFrames) {
      currentStreet = 'preflop';
      flowState.preflopAggressionSeen = false;
      flowState.preflopResponseSeen = false;
      flowState.openActor = '';
      flowState.coldCallerActor = '';
      flowState.squeezeActor = '';
      flowState.pendingPreflopResponses.clear();
    }
    if (hasFramePot) {
      lastFramePot = Number(framePot);
    }

    for (const line of lines) {
      const streetTextHint = normalizeStreetToken(line.text);
      if (streetTextHint) {
        currentStreet = streetTextHint;
      } else {
        const boardHint = detectBoardStreetFromText(line.text);
        if (boardHint) currentStreet = boardHint;
      }
    }

    const nameAnchors = lines
      .filter((line) => isLikelyPlayerName(line.text))
      .map((line) => ({ name: normalizeActor(line.text), cx: line.cx, cy: line.cy }));
    const focusActor = detectFrameFocusActor(lines);
    if (focusActor) focusCueFrames += 1;
    const focusAnchor = focusActor ? nameAnchors.find((anchor) => anchor.name === focusActor) || null : null;
    const bottomSeatAnchor = getBottomSeatAnchor(nameAnchors, frameMaxCy);

    for (const line of lines) {
      const parsed = parseOcrLineToEvent({
        line: line.text,
        frameMs,
        eventIndex,
        defaultStreet: currentStreet,
        confidence: line.confidence
      });

      if (parsed?.streetHint) {
        currentStreet = parsed.streetHint;
      }

      if (parsed?.event) {
        if (parsed.event.street === 'unknown' && currentStreet !== 'unknown') {
          parsed.event.street = currentStreet;
        }
        if (focusActor) {
          parsed.event._focus_actor = focusActor;
        }
        currentStreet = applyStreetFlowHints(parsed.event, currentStreet, flowState);
        parsed.event._frame_pot = framePot;
        rawEvents.push(parsed.event);
        eventIndex += 1;
        continue;
      }

      if (shouldSkipBottomActionButton(line, frameMaxCy, nameAnchors)) {
        const skippedToken = parseActionToken(line.text);
        if (skippedToken?.action === 'raise' && currentStreet === 'preflop' && bottomSeatAnchor?.name) {
          bottomActionHints.push({
            frame_ms: frameMs,
            actor: bottomSeatAnchor.name,
            action: skippedToken.action,
            _frame_pot: framePot
          });
        }
        continue;
      }

      const inferredActor = focusActor || findNearestNameActor(line, nameAnchors);
      if (focusActor && focusAnchor) {
        const distance = distanceToAnchor(line, focusAnchor);
        if (Number.isFinite(distance) && distance > 160) {
          continue;
        }
      }
      const inferred = parseActionOnlyLine({
        text: line.text,
        frameMs,
        eventIndex,
        street: currentStreet,
        confidence: line.confidence,
        actor: inferredActor
      });
      if (inferred) {
        if (focusActor && inferred.actor !== focusActor) {
          continue;
        }
        const isBottomActor = Boolean(bottomSeatAnchor?.name) && inferred.actor === bottomSeatAnchor.name;
        const hasPotEvidence = Number.isFinite(prevFramePot) && Number.isFinite(framePot);
        const hasPotIncrease = hasPotEvidence && framePot > prevFramePot * 1.01;
        const isLikelyStaleBottomBadge = isBottomActor
          && !focusActor
          && hasPotEvidence
          && !hasPotIncrease
          && inferred.action !== 'fold';
        const awaitingPreflopResponse = currentStreet === 'preflop'
          && flowState.pendingPreflopResponses.has(inferred.actor);
        const isLikelyStalePendingAction = awaitingPreflopResponse
          && !focusActor
          && hasPotEvidence
          && !hasPotIncrease
          && inferred.action !== 'fold';
        if (isLikelyStaleBottomBadge) {
          continue;
        }
        if (isLikelyStalePendingAction) {
          continue;
        }
        inferred._focus_actor = focusActor || inferred._focus_actor || '';
        currentStreet = applyStreetFlowHints(inferred, currentStreet, flowState);
        inferred._frame_pot = framePot;
        rawEvents.push(inferred);
        eventIndex += 1;
      }
    }
  }

  const splitRawHands = splitEventsIntoHands(rawEvents, {
    handGapMs,
    minGapForPotSplitMs: Math.max(600, Math.trunc(sampleMs))
  });
  const splitHands = splitRawHands
    .map((eventsInHand) => {
      const deduped = dedupeEvents(eventsInHand, { dedupeWindowMs, sampleMs });
      if (!deduped.length) return [];
      const startMs = Math.min(...deduped.map((event) => event.evidence.frame_ms));
      const endMs = Math.max(...deduped.map((event) => event.evidence.frame_ms));
      const hintsInRange = bottomActionHints.filter(
        (hint) => hint.frame_ms >= (startMs - sampleMs) && hint.frame_ms <= (endMs + sampleMs)
      );
      const inferredOpen = inferPreflopOpenRaiseFromHints(deduped, hintsInRange, sampleMs);
      const prunedPendingAggression = suppressStalePendingPreflopAggression(inferredOpen);
      const inferredResponses = inferMissingPreflopResponsesBeforeStreetTransition(prunedPendingAggression, sampleMs);
      const prerollInferred = inferPrerollPreflopFolds(inferredResponses, sampleMs);
      const constrained = applyPlayerStateConstraints(prerollInferred);
      const normalized = normalizePostflopActionSemantics(constrained);
      return normalized;
    })
    .filter((eventsInHand) => eventsInHand.length > 0);
  const events = splitHands.flat();

  const hands = splitHands.map((eventsInHand, index) => {
    const startMs = Math.min(...eventsInHand.map((event) => event.evidence.frame_ms));
    const endMs = Math.max(...eventsInHand.map((event) => event.evidence.frame_ms));
    return {
      hand_id: `video_hand_${String(index + 1).padStart(4, '0')}`,
      start_ms: startMs,
      end_ms: endMs,
      events: eventsInHand.map(sanitizeEvent)
    };
  });
  const inferredEventCount = hands.reduce(
    (sum, hand) => sum + hand.events.filter((event) => event?.resolution_state === 'inferred').length,
    0
  );
  const pendingEventCount = hands.reduce(
    (sum, hand) => sum + hand.events.filter((event) => event?.resolution_state === 'pending').length,
    0
  );
  const committedEventCount = Math.max(0, events.length - inferredEventCount - pendingEventCount);

  return {
    version: 'canonical_hand_v1',
    video: {
      path: normalizeText(videoPath),
      size_bytes: Number(sizeBytes) || 0,
      created_at: normalizeText(createdAtIso)
    },
    hands,
    meta: {
      extractor_stage: extractorStage,
      sampled_frames: sortedFrames.length,
      raw_event_count: rawEvents.length,
      event_count: events.length,
      committed_event_count: committedEventCount,
      inferred_event_count: inferredEventCount,
      pending_event_count: pendingEventCount,
      hand_count: hands.length,
      dedupe_window_ms: dedupeWindowMs,
      hand_gap_ms: handGapMs,
      focus_cue_frames: focusCueFrames,
      bottom_action_hints: bottomActionHints.length,
      warning_count: Array.isArray(warnings) ? warnings.length : 0,
      ...extraMeta
    }
  };
}

function extractWithStrategy(strategy, fn, options) {
  const ocr = fn(options);
  return {
    strategy,
    ocr,
    run: buildCanonicalRunFromOcrFrames({
      videoPath: options.videoPath,
      sizeBytes: options.sizeBytes,
      createdAtIso: options.createdAtIso,
      frames: ocr.frames,
      extractorStage: strategy,
      sampleMs: options.sampleMs,
      dedupeWindowMs: options.dedupeWindowMs,
      handGapMs: options.handGapMs,
      warnings: ocr.warnings,
      extraMeta: {
        ocr_duration_ms: Number(ocr?.meta?.duration_ms || 0),
        ocr_sample_ms: Number(ocr?.meta?.sample_ms || 0),
        ocr_max_frames: Number(ocr?.meta?.max_frames || 0),
        ocr_decoder: String(ocr?.meta?.decoder || strategy)
      }
    })
  };
}

export function extractCanonicalRunFromVideo({
  videoPath,
  sizeBytes,
  createdAtIso,
  sampleMs = 1000,
  maxFrames = 600,
  dedupeWindowMs = 1400,
  handGapMs = 10000
} = {}) {
  const options = {
    videoPath,
    sizeBytes,
    createdAtIso,
    sampleMs,
    maxFrames,
    dedupeWindowMs: Math.max(dedupeWindowMs, sampleMs * 3),
    handGapMs: Math.max(handGapMs, sampleMs * 4)
  };

  const strategyErrors = [];

  try {
    return extractWithStrategy('baseline_ocr_python', readFramesWithPythonOcr, options).run;
  } catch (error) {
    strategyErrors.push({ strategy: 'baseline_ocr_python', message: error?.message || String(error), details: error?.details || null });
  }

  try {
    return extractWithStrategy('baseline_ocr_avfoundation', readFramesWithAvFoundationOcr, options).run;
  } catch (error) {
    const details = {
      strategy_errors: strategyErrors,
      fallback: error?.details || null
    };
    const finalError = new Error(error?.message || 'All OCR extraction strategies failed.');
    finalError.details = details;
    throw finalError;
  }
}
