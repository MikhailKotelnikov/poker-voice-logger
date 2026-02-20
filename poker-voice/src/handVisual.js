function clean(value) {
  return String(value || '').trim();
}

function parseCard(raw) {
  const token = clean(raw);
  const match = token.match(/^([2-9TJQKA])([cdhs])$/i);
  if (!match) return null;
  return {
    rank: match[1].toUpperCase(),
    suit: match[2].toLowerCase(),
    raw: `${match[1].toUpperCase()}${match[2].toLowerCase()}`
  };
}

function amountToBb(amount, bb) {
  if (!Number.isFinite(amount) || !Number.isFinite(bb) || bb <= 0) return null;
  return Number((amount / bb).toFixed(2));
}

function roundedToken(value) {
  if (!Number.isFinite(value)) return '';
  return String(Math.round(value));
}

function parseGameLabel(rawHandHistory, parsed) {
  const text = String(rawHandHistory || '');
  const gtMatch = text.match(/"gt"\s*:\s*"([^"]+)"/i);
  if (gtMatch?.[1]) {
    const gt = gtMatch[1].toUpperCase();
    if (/PLO(\d+)/.test(gt)) {
      const cards = gt.match(/PLO(\d+)/)?.[1] || '';
      return cards ? `Omaha${cards}` : gt;
    }
    return gt;
  }

  const line = text.split(/\r?\n/).find((item) => /card omaha/i.test(item)) || '';
  const cardsMatch = line.match(/(\d+)\s*Card\s+Omaha/i);
  if (cardsMatch?.[1]) return `Omaha${cardsMatch[1]}`;
  return 'Omaha';
}

function formatLimitLabel(parsed) {
  const bb = Number(parsed?.blinds?.bigBlind || 0);
  if (!bb) return '';
  return `PL${Math.round(bb * 100)}`;
}

function eventToken(event, street, previousAggBb) {
  if (!event) return { label: '', nextAggBb: previousAggBb };
  if (event.type === 'check') {
    return { label: 'X', nextAggBb: previousAggBb };
  }
  if (event.type === 'fold') {
    return { label: 'F', nextAggBb: previousAggBb };
  }
  if (event.type === 'call') {
    const bb = amountToBb(event.amount, event.bbRef);
    return { label: `C${roundedToken(bb)}`, nextAggBb: previousAggBb };
  }
  if (event.type === 'bet') {
    const bb = amountToBb(event.amount, event.bbRef);
    return { label: `B${roundedToken(bb)}`, nextAggBb: bb };
  }
  if (event.type === 'raise') {
    const toBb = amountToBb(event.toAmount, event.bbRef);
    const byX = Number.isFinite(previousAggBb) && previousAggBb > 0 && Number.isFinite(toBb)
      ? Number((toBb / previousAggBb).toFixed(2))
      : null;
    const xPart = Number.isFinite(byX) ? ` (${roundedToken(byX)}x)` : '';
    return { label: `R${roundedToken(toBb)}${xPart}`, nextAggBb: toBb };
  }
  return { label: '', nextAggBb: previousAggBb };
}

function getShowCards(parsed, player) {
  const cards = parsed?.showdown?.showCardsByPlayer?.[player];
  if (!Array.isArray(cards)) return [];
  return cards.map(parseCard).filter(Boolean);
}

function formatBoard(boardCards = []) {
  return boardCards.map(parseCard).filter(Boolean);
}

function buildStreetActions(parsed, street) {
  const events = (parsed?.events?.[street] || [])
    .filter((event) => ['check', 'fold', 'call', 'bet', 'raise'].includes(event.type));
  const bb = Number(parsed?.blinds?.bigBlind || 0);
  let previousAggBb = null;
  const out = [];

  for (const event of events) {
    const token = eventToken({ ...event, bbRef: bb }, street, previousAggBb);
    previousAggBb = token.nextAggBb;
    if (!token.label) continue;
    out.push({
      player: event.player,
      pos: parsed?.positionsByPlayer?.[event.player] || '',
      hero: event.player === parsed?.targetPlayer,
      label: token.label,
      cards: getShowCards(parsed, event.player)
    });
  }
  return out;
}

function buildPreflopActions(parsed) {
  const events = (parsed?.events?.preflop || [])
    .filter((event) => ['call', 'bet', 'raise'].includes(event.type));
  const bb = Number(parsed?.blinds?.bigBlind || 0);
  let start = events.findIndex((event) => event.type === 'raise' || event.type === 'bet');
  if (start < 0) start = 0;
  const out = [];
  for (const event of events.slice(start)) {
    const token = eventToken({ ...event, bbRef: bb }, 'preflop', null);
    if (!token.label) continue;
    out.push({
      player: event.player,
      pos: parsed?.positionsByPlayer?.[event.player] || '',
      hero: event.player === parsed?.targetPlayer,
      label: token.label,
      cards: getShowCards(parsed, event.player)
    });
  }
  return out;
}

export function buildHandVisualModel(rawHandHistory, parsed) {
  const bb = Number(parsed?.blinds?.bigBlind || 0);
  const target = parsed?.targetPlayer || '';
  const heroCards = getShowCards(parsed, target);
  const flopBoard = parsed?.board?.flop || [];
  const turnCard = clean(parsed?.board?.turn);
  const riverCard = clean(parsed?.board?.river);
  const turnBoard = turnCard ? [...flopBoard, turnCard] : [...flopBoard];
  const riverBoard = riverCard ? [...turnBoard, riverCard] : [...turnBoard];

  const preflopPotBb = amountToBb(parsed?.streetStartPot?.flop || 0, bb);
  const turnPotBb = amountToBb(parsed?.streetStartPot?.turn || 0, bb);
  const riverPotBb = amountToBb(parsed?.streetStartPot?.river || 0, bb);

  return {
    meta: {
      game: parseGameLabel(rawHandHistory, parsed),
      limit: formatLimitLabel(parsed),
      bb: bb ? String(bb) : '',
      hero: target
    },
    heroCards,
    preflop: {
      potBb: preflopPotBb,
      actions: buildPreflopActions(parsed)
    },
    streets: [
      {
        id: 'flop',
        board: formatBoard(flopBoard),
        potBb: preflopPotBb,
        actions: buildStreetActions(parsed, 'flop')
      },
      {
        id: 'turn',
        board: formatBoard(turnBoard),
        potBb: turnPotBb,
        actions: buildStreetActions(parsed, 'turn')
      },
      {
        id: 'river',
        board: formatBoard(riverBoard),
        potBb: riverPotBb,
        actions: buildStreetActions(parsed, 'river')
      }
    ]
  };
}
