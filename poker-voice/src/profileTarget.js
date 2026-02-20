function cleanProfileCell(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeActorIdentity(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function extractTargetIdHint(opponent) {
  const match = String(opponent || '').match(/\d{4,}/g);
  if (!match || !match.length) {
    return '';
  }
  return match[match.length - 1];
}

export function extractTargetIdentity(opponent) {
  const id = extractTargetIdHint(opponent);
  if (id) return id;
  return normalizeActorIdentity(opponent);
}

function buildTargetActorRegex(targetIdentity) {
  if (!targetIdentity) return null;
  return new RegExp(`\\b([A-Za-z0-9]+_${escapeRegExp(targetIdentity)})\\s+([^\\s/|]+)`, 'gi');
}

function extractTargetActions(text, targetIdentity) {
  const source = cleanProfileCell(text);
  const regex = buildTargetActorRegex(targetIdentity);
  if (!source || !regex) return [];
  const out = [];
  let match = regex.exec(source);
  while (match) {
    out.push({
      actor: String(match[1] || ''),
      action: String(match[2] || '').toLowerCase()
    });
    match = regex.exec(source);
  }
  return out;
}

function hasTargetToken(text, targetIdentity) {
  if (!targetIdentity) return false;
  const source = cleanProfileCell(text);
  if (!source) return false;
  const regex = new RegExp(`\\b[A-Za-z0-9]+_${escapeRegExp(targetIdentity)}\\b`, 'i');
  return regex.test(source);
}

function isContributionAction(actionRaw) {
  const action = String(actionRaw || '').trim().toLowerCase();
  if (!action) return false;
  if (['x', 'xb', 'f', 'xf'].includes(action)) return false;
  if (/^(?:c|b|cb|bb|bbb|bxb|d|tp|tpb|r|ai|rai|xrai|xr_ai|5bai|bbbai)/i.test(action)) {
    return true;
  }
  return false;
}

export function rowMatchesTargetProfile(row, opponent, targetIdentity = '') {
  const nickname = cleanProfileCell(row?.nickname);
  const normalizedOpponent = String(opponent || '').trim().toLowerCase();
  if (nickname && normalizedOpponent && nickname.toLowerCase() === normalizedOpponent) {
    return true;
  }
  if (!targetIdentity) {
    return false;
  }

  const preflop = cleanProfileCell(row?.preflop);
  const flop = cleanProfileCell(row?.flop);
  const turn = cleanProfileCell(row?.turn);
  const river = cleanProfileCell(row?.river);

  const hasPostflopPresence = [flop, turn, river].some((street) => hasTargetToken(street, targetIdentity));
  if (hasPostflopPresence) {
    return true;
  }

  const preflopActions = extractTargetActions(preflop, targetIdentity);
  if (!preflopActions.length) {
    return false;
  }
  return preflopActions.some((item) => isContributionAction(item.action));
}

export const __testables = {
  cleanProfileCell,
  normalizeActorIdentity,
  escapeRegExp
};
