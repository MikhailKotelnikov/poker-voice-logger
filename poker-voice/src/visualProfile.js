import { extractTargetIdentity } from './profileTarget.js';

const BUCKET_ORDER = ['2', '3', '5', '6', '7', 'P', 'Miss'];
const STRENGTH_ORDER = ['nuts', 'strong', 'strongDraw', 'weakDraw', 'weak', 'unknown'];

const LEGEND = [
  { key: 'nuts', label: 'nuts / top full+', color: '#8f2a5c' },
  { key: 'strong', label: 'strong made', color: '#d76575' },
  { key: 'strongDraw', label: 'strong draw', color: '#325cbc' },
  { key: 'weakDraw', label: 'weak draw', color: '#73b7ff' },
  { key: 'weak', label: 'weak / one pair / air', color: '#97d578' },
  { key: 'unknown', label: 'no showdown / unknown', color: '#f2f5f3' }
];

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildSamplePayload(rowLabel, streets, focusStreet = '') {
  return JSON.stringify({
    type: 'profile_sample_v2',
    rowLabel: cleanText(rowLabel),
    focusStreet: String(focusStreet || '').toLowerCase(),
    streets: {
      preflop: cleanText(streets?.preflop),
      flop: cleanText(streets?.flop),
      turn: cleanText(streets?.turn),
      river: cleanText(streets?.river)
    }
  });
}

function parseActorToken(segment) {
  const text = cleanText(segment);
  if (!text) return null;
  const match = text.match(/^(?:\(\d+(?:\.\d+)?\)\s*)?([A-Za-z0-9]+)_([A-Za-z0-9]{2,24})\b/i);
  if (!match) return null;
  return {
    actor: `${match[1]}_${match[2]}`,
    identity: String(match[2] || '').toLowerCase()
  };
}

function filterStreetByTargetActor(streetText, targetIdentity) {
  const text = cleanText(streetText);
  if (!text || !targetIdentity) return text;

  const segments = text.split(/\s*\/\s*/).map(cleanText).filter(Boolean);
  if (!segments.length) return '';

  const actorSegments = segments.filter((segment) => Boolean(parseActorToken(segment)));
  if (!actorSegments.length) return text;

  const targetSegments = actorSegments.filter((segment) => {
    const actor = parseActorToken(segment);
    return actor && actor.identity === targetIdentity;
  });

  if (!targetSegments.length) return '';
  return targetSegments.join(' / ');
}

function createBucketCounters() {
  const out = {};
  BUCKET_ORDER.forEach((bucket) => {
    out[bucket] = {
      total: 0,
      nuts: 0,
      strong: 0,
      strongDraw: 0,
      weakDraw: 0,
      weak: 0,
      unknown: 0,
      samples: {
        all: [],
        nuts: [],
        strong: [],
        strongDraw: [],
        weakDraw: [],
        weak: [],
        unknown: []
      }
    };
  });
  return out;
}

function createSectionState(title, groups) {
  const groupMap = {};
  groups.forEach((group) => {
    groupMap[group] = createBucketCounters();
  });
  return {
    title,
    groups: groupMap
  };
}

function detectBucket(textRaw) {
  const text = cleanText(textRaw).toLowerCase();
  if (!text) return null;

  const sizingMatch = text.match(/\b(?:cb|bbb|bb|bxb|tpb|tp|fp|d|r|b)\s*(\d+(?:\.\d+)?)\b/i);
  if (sizingMatch) {
    const size = Number(sizingMatch[1]);
    if (Number.isFinite(size)) {
      if (size <= 0) return null;
      if (size < 30) return '2';
      if (size < 45) return '3';
      if (size < 55) return '5';
      if (size < 70) return '6';
      if (size < 95) return '7';
      return 'P';
    }
  }

  if (/\bmiss\b/i.test(text)) return 'Miss';
  const hasCheck = /\b(?:x|xb|xc|xf)\b/i.test(text);
  const hasSizedAction = /\b(?:cb|bbb|bb|bxb|tpb|tp|fp|d|r|b)\s*\d+(?:\.\d+)?\b/i.test(text);
  if (hasCheck && !hasSizedAction) return 'Miss';

  return null;
}

function classifyStrength(textRaw) {
  const text = ` ${cleanText(textRaw).toLowerCase()} `;

  if (/\b(?:nuts|nutstr|nutfull|nutflush|topfull|quads?|strflush)\b/.test(text)) {
    return 'nuts';
  }

  if (/\b(?:topset|set|2p|tri|full|lowfull|2ndstr|3rdfull)\b/.test(text) || /_(?:topset|set|2p|tri|full|str)\b/.test(text)) {
    return 'strong';
  }

  const hasFd = /\b(?:nfd|fd)\b/.test(text);
  const hasStraightDraw = /\b(?:wrap|oe|g)\b/.test(text);
  if (/\bwrap\b/.test(text) || (hasFd && hasStraightDraw) || /\bnfd\b/.test(text)) {
    return 'strongDraw';
  }

  if (hasFd || hasStraightDraw || /\bdraws?\b/.test(text)) {
    return 'weakDraw';
  }

  const hasWeakToken = /\b(?:air|weak|mp|bp|bu|p)\b/.test(text) || /_(?:p|mp|bp|air)\b/.test(text);
  if (hasWeakToken) {
    return 'weak';
  }

  return 'unknown';
}

function hasAnyToken(textRaw, pattern) {
  return pattern.test(cleanText(textRaw).toLowerCase());
}

function detectMultiwayMarker(textRaw) {
  return hasAnyToken(textRaw, /\b(?:3w|4w|5w|mw|3-way|4-way|multiway|multi-way)\b/i);
}

function detectMultiwayByActorCount(textRaw) {
  const text = cleanText(textRaw);
  if (!text) return false;
  const matches = text.match(/\b(?:SB|BB|BTN|CO|HJ|UTG|UTG1|LJ|MP|P\d+)_[A-Za-z0-9]{2,24}\b/ig) || [];
  if (!matches.length) return false;
  const unique = new Set(matches.map((token) => String(token).toLowerCase()));
  return unique.size > 2;
}

function detectMultiway(textRaw) {
  return detectMultiwayByActorCount(textRaw) || detectMultiwayMarker(textRaw);
}

function detectProbeLine(textRaw) {
  return hasAnyToken(textRaw, /\b(?:tpb\d*|tp\d*|fp\d*|probe|prob)\b/i);
}

function detectTripleBarrelLine(textRaw) {
  return hasAnyToken(textRaw, /\bbbb(?:\d|\b)/i);
}

function detectBetBetLine(textRaw) {
  return hasAnyToken(textRaw, /\b(?:bb\d*|bxb|tpb)\b/i);
}

function detectSingleRiverBetLine(textRaw) {
  const text = cleanText(textRaw).toLowerCase();
  if (!text) return false;
  if (detectTripleBarrelLine(text) || detectBetBetLine(text)) return false;
  return /\b(?:cb|b|r|d)\s*\d+(?:\.\d+)?\b/i.test(text);
}

function addSample(samples, key, text) {
  if (!samples || !key || !text) return;
  const list = samples[key];
  if (!Array.isArray(list)) return;
  list.push(text);
}

function addCount(section, group, bucket, strength, sampleText = '') {
  if (!section || !section.groups[group] || !bucket || !section.groups[group][bucket]) return;
  const entry = section.groups[group][bucket];
  entry.total += 1;
  if (STRENGTH_ORDER.includes(strength)) {
    entry[strength] += 1;
  }
  if (sampleText) {
    addSample(entry.samples, 'all', sampleText);
    if (STRENGTH_ORDER.includes(strength)) {
      addSample(entry.samples, strength, sampleText);
    }
  }
}

function groupToRows(groupCounters) {
  return BUCKET_ORDER.map((bucket) => {
    const row = groupCounters[bucket];
    return {
      bucket,
      total: row.total,
      counts: {
        nuts: row.nuts,
        strong: row.strong,
        strongDraw: row.strongDraw,
        weakDraw: row.weakDraw,
        weak: row.weak,
        unknown: row.unknown
      },
      samples: row.samples
    };
  });
}

export function buildOpponentVisualProfile(rows, options = {}) {
  const items = Array.isArray(rows) ? rows : [];
  const targetIdentity = extractTargetIdentity(options?.opponent);
  const sections = {
    flop: createSectionState('Flop Bets', ['HU', 'MW']),
    betbet: createSectionState('BetBet', ['All']),
    probes: createSectionState('Probes', ['HU', 'MW']),
    riverBetBet: createSectionState('River BetBet', ['All']),
    riverOnce: createSectionState('River Once', ['All']),
    betbetbet: createSectionState('BetBetBet', ['All']),
    total: createSectionState('TOT', ['All'])
  };

  let analyzedRows = 0;
  for (const row of items) {
    const rowLabel = cleanText(row?.rowLabel) || (row?.row ? `#${row.row}` : '#?');
    const preflopRaw = cleanText(row?.preflop);
    const flopRaw = cleanText(row?.flop);
    const turnRaw = cleanText(row?.turn);
    const riverRaw = cleanText(row?.river);
    const preflopText = filterStreetByTargetActor(row?.preflop, targetIdentity);
    const flopText = filterStreetByTargetActor(row?.flop, targetIdentity);
    const turnText = filterStreetByTargetActor(row?.turn, targetIdentity);
    const riverText = filterStreetByTargetActor(row?.river, targetIdentity);
    const sampleBase = {
      preflop: preflopRaw,
      flop: flopRaw,
      turn: turnRaw,
      river: riverRaw
    };

    if (flopText) {
      const bucket = detectBucket(flopText);
      if (bucket) {
        const group = detectMultiway(flopRaw || flopText) ? 'MW' : 'HU';
        const strength = classifyStrength(flopText);
        addCount(
          sections.flop,
          group,
          bucket,
          strength,
          buildSamplePayload(rowLabel, sampleBase, 'flop')
        );
        analyzedRows += 1;
      }
    }

    if (turnText) {
      const bucket = detectBucket(turnText);
      if (bucket) {
        const strength = classifyStrength(turnText);
        const targetFlopHasBet = /\b(?:cb|b)\s*\d+(?:\.\d+)?\b/i.test(flopText);
        const targetFlopChecked = /\b(?:^|[\s/])(?:x|xb)\b/i.test(flopText) && !targetFlopHasBet;
        const targetTurnHasBet = /\b(?:cb|b)\s*\d+(?:\.\d+)?\b/i.test(turnText);
        const isTurnBetBet = detectBetBetLine(turnText) || (targetFlopHasBet && targetTurnHasBet);
        if (isTurnBetBet) {
          addCount(sections.betbet, 'All', bucket, strength, buildSamplePayload(rowLabel, sampleBase, 'turn'));
        }
        const isTurnProbe = detectProbeLine(turnText) || (targetFlopChecked && targetTurnHasBet);
        if (isTurnProbe) {
          const group = detectMultiway(turnRaw || turnText) ? 'MW' : 'HU';
          addCount(sections.probes, group, bucket, strength, buildSamplePayload(rowLabel, sampleBase, 'turn'));
        }
      }
    }

    if (riverText) {
      const bucket = detectBucket(riverText);
      if (bucket) {
        const strength = classifyStrength(riverText);
        addCount(sections.total, 'All', bucket, strength, buildSamplePayload(rowLabel, sampleBase, 'river'));
        if (detectTripleBarrelLine(riverText)) {
          addCount(sections.betbetbet, 'All', bucket, strength, buildSamplePayload(rowLabel, sampleBase, 'river'));
        }
        if (detectBetBetLine(riverText)) {
          addCount(sections.riverBetBet, 'All', bucket, strength, buildSamplePayload(rowLabel, sampleBase, 'river'));
        }
        if (detectSingleRiverBetLine(riverText)) {
          addCount(sections.riverOnce, 'All', bucket, strength, buildSamplePayload(rowLabel, sampleBase, 'river'));
        }
        analyzedRows += 1;
      }
    }
  }

  return {
    opponent: options.opponent || '',
    generatedAt: new Date().toISOString(),
    totalRows: items.length,
    analyzedRows,
    bucketOrder: [...BUCKET_ORDER],
    legend: LEGEND.map((item) => ({ ...item })),
    sections: [
      {
        id: 'flop',
        title: sections.flop.title,
        groups: [
          { id: 'HU', title: 'HU', rows: groupToRows(sections.flop.groups.HU) },
          { id: 'MW', title: 'MW', rows: groupToRows(sections.flop.groups.MW) }
        ]
      },
      {
        id: 'betbet',
        title: sections.betbet.title,
        groups: [{ id: 'All', title: 'All', rows: groupToRows(sections.betbet.groups.All) }]
      },
      {
        id: 'probes',
        title: sections.probes.title,
        groups: [
          { id: 'HU', title: 'HU', rows: groupToRows(sections.probes.groups.HU) },
          { id: 'MW', title: 'MW', rows: groupToRows(sections.probes.groups.MW) }
        ]
      },
      {
        id: 'riverBetBet',
        title: sections.riverBetBet.title,
        groups: [{ id: 'All', title: 'All', rows: groupToRows(sections.riverBetBet.groups.All) }]
      },
      {
        id: 'riverOnce',
        title: sections.riverOnce.title,
        groups: [{ id: 'All', title: 'All', rows: groupToRows(sections.riverOnce.groups.All) }]
      },
      {
        id: 'betbetbet',
        title: sections.betbetbet.title,
        groups: [{ id: 'All', title: 'All', rows: groupToRows(sections.betbetbet.groups.All) }]
      },
      {
        id: 'tot',
        title: sections.total.title,
        groups: [{ id: 'All', title: 'All', rows: groupToRows(sections.total.groups.All) }]
      }
    ]
  };
}

export const __testables = {
  detectBucket,
  classifyStrength,
  detectProbeLine,
  detectBetBetLine,
  detectMultiwayByActorCount,
  detectTripleBarrelLine,
  detectSingleRiverBetLine,
  filterStreetByTargetActor
};
