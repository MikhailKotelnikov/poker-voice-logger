function toNumber(value) {
  const clean = String(value || '')
    .replace(/[^0-9.,-]/g, '')
    .replace(/,/g, '.')
    .trim();
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function formatNum(value) {
  if (!Number.isFinite(value)) return '';
  const rounded = round2(value);
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return String(rounded);
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseBlinds(handHistory) {
  const line = String(handHistory || '')
    .split(/\r?\n/)
    .find((item) => item.includes('(') && item.includes('/') && item.includes('Card'));
  if (!line) {
    return { smallBlind: null, bigBlind: null };
  }

  const paren = line.match(/\(([^)]*)\)/);
  if (!paren?.[1]) {
    return { smallBlind: null, bigBlind: null };
  }

  const nums = paren[1].match(/\d+(?:[.,]\d+)?/g) || [];
  if (nums.length < 2) {
    return { smallBlind: null, bigBlind: null };
  }

  return {
    smallBlind: toNumber(nums[0]),
    bigBlind: toNumber(nums[1])
  };
}

function parseGameCardCount(handHistory) {
  const source = String(handHistory || '');
  const match = source.match(/(\d+)\s*Card\s+Omaha/i);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function parseButtonSeat(line) {
  const match = String(line || '').match(/Seat\s+#?(\d+)\s+is the button/i);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function buildPositionMap(buttonSeat, seatToPlayer) {
  const result = {};
  if (!seatToPlayer || typeof seatToPlayer.size !== 'number' || !seatToPlayer.size) {
    return result;
  }
  const orderedSeats = Array.from(seatToPlayer.keys()).sort((a, b) => a - b);
  let button = Number(buttonSeat);
  if (!Number.isFinite(button) || !seatToPlayer.has(button)) {
    button = orderedSeats[0];
  }
  const buttonIndex = orderedSeats.indexOf(button);
  const orderedFromButton = [
    ...orderedSeats.slice(buttonIndex),
    ...orderedSeats.slice(0, buttonIndex)
  ];

  const labelsByCount = {
    2: ['BTN', 'BB'],
    3: ['BTN', 'SB', 'BB'],
    4: ['BTN', 'SB', 'BB', 'CO'],
    5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
    6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
    7: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'HJ', 'CO'],
    8: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'LJ', 'HJ', 'CO'],
    9: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'MP']
  };
  const labels = labelsByCount[orderedFromButton.length]
    || labelsByCount[6]
    || [];

  orderedFromButton.forEach((seat, index) => {
    const player = seatToPlayer.get(seat);
    if (!player) return;
    result[player] = labels[index] || `P${index + 1}`;
  });
  return result;
}

function parseStreetMarker(line) {
  if (line.startsWith('*** HOLE CARDS ***')) return 'preflop';
  if (line.startsWith('*** FLOP ***')) return 'flop';
  if (line.startsWith('*** TURN ***')) return 'turn';
  if (line.startsWith('*** RIVER ***')) return 'river';
  if (line.startsWith('*** SHOW DOWN ***')) return 'showdown';
  return '';
}

function parseBoardCards(line, street, board) {
  if (street === 'flop') {
    const m = line.match(/\*\*\* FLOP \*\*\* \[([^\]]+)\]/);
    if (m?.[1]) {
      board.flop = m[1].trim().split(/\s+/).filter(Boolean);
    }
    return;
  }
  if (street === 'turn') {
    const m = line.match(/\*\*\* TURN \*\*\* \[[^\]]+\] \[([^\]]+)\]/);
    if (m?.[1]) {
      board.turn = m[1].trim();
    }
    return;
  }
  if (street === 'river') {
    const m = line.match(/\*\*\* RIVER \*\*\* \[[^\]]+\] \[([^\]]+)\]/);
    if (m?.[1]) {
      board.river = m[1].trim();
    }
  }
}

function extractTargetIdHint(opponent) {
  const match = String(opponent || '').match(/\d{4,}/g);
  if (!match || !match.length) {
    return '';
  }
  return match[match.length - 1];
}

function findTargetPlayer(opponent, players) {
  const idHint = extractTargetIdHint(opponent);
  if (idHint) {
    const byId = players.find((name) => String(name).includes(idHint));
    if (byId) return byId;
  }

  const normalizedOpponent = String(opponent || '').trim().toLowerCase();
  if (!normalizedOpponent) return '';

  const exact = players.find((name) => String(name).trim().toLowerCase() === normalizedOpponent);
  if (exact) return exact;

  const contains = players.find((name) => normalizedOpponent.includes(String(name).toLowerCase()) || String(name).toLowerCase().includes(normalizedOpponent));
  return contains || '';
}

function parseActionLine(line) {
  const m = line.match(/^([^:]+):\s+(.+)$/);
  if (!m) return null;
  const player = m[1].trim();
  const action = m[2].trim();

  if (/^checks\b/i.test(action)) return { player, type: 'check', raw: action };
  if (/^folds\b/i.test(action)) return { player, type: 'fold', raw: action };
  if (/^calls\b/i.test(action)) {
    const amount = toNumber(action.match(/calls\s+[^0-9]*([0-9.,]+)/i)?.[1]);
    return { player, type: 'call', amount, raw: action };
  }
  if (/^bets\b/i.test(action)) {
    const amount = toNumber(action.match(/bets\s+[^0-9]*([0-9.,]+)/i)?.[1]);
    return { player, type: 'bet', amount, raw: action };
  }
  if (/^raises\b/i.test(action)) {
    const amount = toNumber(action.match(/raises\s+[^0-9]*([0-9.,]+)/i)?.[1]);
    const toAmount = toNumber(action.match(/\bto\s+[^0-9]*([0-9.,]+)/i)?.[1]);
    return { player, type: 'raise', amount, toAmount, raw: action };
  }
  if (/^posts the ante\b/i.test(action)) {
    const amount = toNumber(action.match(/ante\s+[^0-9]*([0-9.,]+)/i)?.[1]);
    return { player, type: 'ante', amount, raw: action };
  }
  if (/^posts small blind\b/i.test(action)) {
    const amount = toNumber(action.match(/blind\s+[^0-9]*([0-9.,]+)/i)?.[1]);
    return { player, type: 'small_blind', amount, raw: action };
  }
  if (/^posts big blind\b/i.test(action)) {
    const amount = toNumber(action.match(/blind\s+[^0-9]*([0-9.,]+)/i)?.[1]);
    return { player, type: 'big_blind', amount, raw: action };
  }
  if (/^posts straddle\b/i.test(action)) {
    const amount = toNumber(action.match(/straddle\s+[^0-9]*([0-9.,]+)/i)?.[1]);
    return { player, type: 'straddle', amount, raw: action };
  }
  if (/^shows\b/i.test(action)) {
    const cards = action.match(/\[([^\]]+)\]/)?.[1] || '';
    return { player, type: 'show', cards: cards.split(/\s+/).filter(Boolean), raw: action };
  }
  return { player, type: 'other', raw: action };
}

function amountToBb(amount, bb) {
  if (!Number.isFinite(amount) || !Number.isFinite(bb) || bb <= 0) return null;
  return round2(amount / bb);
}

const RANK_VALUE = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};
const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const CARD_SUITS = ['c', 'd', 'h', 's'];

function parseCardToken(token) {
  const card = String(token || '').trim();
  const match = card.match(/^([2-9TJQKA])([cdhs])$/i);
  if (!match) return null;
  const rank = match[1].toUpperCase();
  const suit = match[2].toLowerCase();
  const value = RANK_VALUE[rank];
  if (!Number.isFinite(value)) return null;
  return { rank, suit, value, raw: `${rank}${suit}` };
}

function combinations(items, size) {
  const out = [];
  if (!Array.isArray(items) || size < 1 || items.length < size) return out;
  const stack = [];

  function walk(start) {
    if (stack.length === size) {
      out.push(stack.slice());
      return;
    }
    for (let i = start; i < items.length; i += 1) {
      stack.push(items[i]);
      walk(i + 1);
      stack.pop();
    }
  }

  walk(0);
  return out;
}

function evaluateStraightHigh(values) {
  const uniq = Array.from(new Set(values)).sort((a, b) => b - a);
  if (uniq.length !== 5) return 0;
  if (uniq[0] - uniq[4] === 4) return uniq[0];
  if (uniq.join(',') === '14,5,4,3,2') return 5;
  return 0;
}

function evaluateFiveCardStrength(cards) {
  if (!Array.isArray(cards) || cards.length !== 5) {
    return { category: -1, straightHigh: 0 };
  }

  const values = cards.map((card) => card.value).sort((a, b) => b - a);
  const suits = cards.map((card) => card.suit);
  const rankCounts = new Map();
  for (const value of values) {
    rankCounts.set(value, (rankCounts.get(value) || 0) + 1);
  }
  const counts = Array.from(rankCounts.values()).sort((a, b) => b - a);

  const flush = suits.every((suit) => suit === suits[0]);
  const straightHigh = evaluateStraightHigh(values);
  const straight = straightHigh > 0;

  let category = 0;
  if (straight && flush) category = 8;
  else if (counts[0] === 4) category = 7;
  else if (counts[0] === 3 && counts[1] === 2) category = 6;
  else if (flush) category = 5;
  else if (straight) category = 4;
  else if (counts[0] === 3) category = 3;
  else if (counts[0] === 2 && counts[1] === 2) category = 2;
  else if (counts[0] === 2) category = 1;

  return { category, straightHigh };
}

function categoryToClassToken(category) {
  switch (category) {
    case 8:
      return 'strflush';
    case 7:
      return 'quads';
    case 6:
      return 'full';
    case 5:
      return 'flush';
    case 4:
      return 'str';
    case 3:
      return 'set';
    case 2:
      return '2p';
    case 1:
      return 'p';
    case 0:
      return 'air';
    default:
      return '';
  }
}

function evaluateOmahaStreetClass(holeCardsRaw, boardCardsRaw) {
  const holeCards = (holeCardsRaw || []).map(parseCardToken).filter(Boolean);
  const boardCards = (boardCardsRaw || []).map(parseCardToken).filter(Boolean);
  if (holeCards.length < 2 || boardCards.length < 3) {
    return { classToken: '', straightHigh: 0 };
  }

  let bestCategory = -1;
  let bestStraightHigh = 0;
  const holeCombos = combinations(holeCards, 2);
  const boardCombos = combinations(boardCards, 3);
  for (const hole of holeCombos) {
    for (const board of boardCombos) {
      const strength = evaluateFiveCardStrength([...hole, ...board]);
      const category = strength.category;
      if (category > bestCategory) {
        bestCategory = category;
        bestStraightHigh = strength.straightHigh;
      } else if (category === bestCategory && category >= 4 && strength.straightHigh > bestStraightHigh) {
        bestStraightHigh = strength.straightHigh;
      }
    }
  }
  return {
    classToken: categoryToClassToken(bestCategory),
    straightHigh: bestStraightHigh
  };
}

function buildStreetBoards(board) {
  const flop = Array.isArray(board?.flop) ? board.flop.filter(Boolean) : [];
  const turn = board?.turn ? [...flop, board.turn] : [...flop];
  const river = board?.river ? [...turn, board.river] : [...turn];
  return { flop, turn, river };
}

function computeStreetClasses(cards, board) {
  const boards = buildStreetBoards(board);
  const flop = evaluateOmahaStreetClass(cards, boards.flop);
  const turn = evaluateOmahaStreetClass(cards, boards.turn);
  const river = evaluateOmahaStreetClass(cards, boards.river);

  const out = {
    flop: flop.classToken || '',
    turn: turn.classToken || '',
    river: river.classToken || '',
    _details: { flop, turn, river }
  };

  for (const street of ['flop', 'turn', 'river']) {
    const boardCards = boards[street] || [];
    const detail = out._details[street];
    if (!detail || detail.classToken !== 'str' || !detail.straightHigh) continue;
    if (boardIsPaired(boardCards)) continue;
    if (boardMaxSuitCount(boardCards) >= 3) continue;
    const nutStraightHigh = nutStraightHighOnBoard(boardCards);
    if (nutStraightHigh > 0 && detail.straightHigh === nutStraightHigh) {
      out[street] = 'nutstr';
      out._details[street] = { ...detail, classToken: 'nutstr', nutStraightHigh };
    }
  }

  return out;
}

function boardIsPaired(boardCardsRaw) {
  const values = (boardCardsRaw || [])
    .map(parseCardToken)
    .filter(Boolean)
    .map((card) => card.value);
  return new Set(values).size !== values.length;
}

function boardMaxSuitCount(boardCardsRaw) {
  const suits = (boardCardsRaw || [])
    .map(parseCardToken)
    .filter(Boolean)
    .map((card) => card.suit);
  const counts = new Map();
  for (const suit of suits) {
    counts.set(suit, (counts.get(suit) || 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

function cardDeckExcluding(boardCardsRaw) {
  const excluded = new Set(
    (boardCardsRaw || [])
      .map(parseCardToken)
      .filter(Boolean)
      .map((card) => card.raw)
  );
  const deck = [];
  for (const rank of CARD_RANKS) {
    for (const suit of CARD_SUITS) {
      const raw = `${rank}${suit}`;
      if (excluded.has(raw)) continue;
      deck.push(raw);
    }
  }
  return deck;
}

function nutStraightHighOnBoard(boardCardsRaw) {
  const boardCards = (boardCardsRaw || []).map(parseCardToken).filter(Boolean);
  if (boardCards.length < 3) return 0;
  const deck = cardDeckExcluding(boardCardsRaw);
  let best = 0;
  for (let i = 0; i < deck.length; i += 1) {
    for (let j = i + 1; j < deck.length; j += 1) {
      const details = evaluateOmahaStreetClass([deck[i], deck[j]], boardCardsRaw);
      if (details.classToken === 'str' && details.straightHigh > best) {
        best = details.straightHigh;
      }
    }
  }
  return best;
}

function selectPrimaryShowdownOpponent(targetPlayer, showEvents, events) {
  const candidates = (showEvents || []).filter((event) => event.player && event.player !== targetPlayer);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const weights = new Map();
  for (const street of ['preflop', 'flop', 'turn', 'river']) {
    for (const event of events?.[street] || []) {
      if (!event?.player || event.player === targetPlayer) continue;
      weights.set(event.player, (weights.get(event.player) || 0) + 1);
    }
  }

  return candidates
    .slice()
    .sort((a, b) => {
      const aWeight = weights.get(a.player) || 0;
      const bWeight = weights.get(b.player) || 0;
      if (aWeight !== bWeight) return bWeight - aWeight;
      return 0;
    })[0];
}

export function parseHandHistory(handHistory, opponent) {
  const source = String(handHistory || '');
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const blinds = parseBlinds(source);
  const gameCardCount = parseGameCardCount(source);
  const bb = blinds.bigBlind;
  const board = { flop: [], turn: '', river: '' };
  const streetStartPot = { preflop: 0, flop: null, turn: null, river: null };
  const events = { preflop: [], flop: [], turn: [], river: [] };
  const showEvents = [];
  const voluntaryShowEvents = [];
  const playersSet = new Set();
  const seatToPlayer = new Map();
  let buttonSeat = null;
  let showdownSeen = false;

  let street = 'preflop';
  let pot = 0;
  let roundContrib = new Map();

  for (const line of lines) {
    const streetMarker = parseStreetMarker(line);
    if (streetMarker) {
      if (streetMarker === 'showdown') {
        street = 'showdown';
        showdownSeen = true;
      } else {
        street = streetMarker;
        if (street !== 'preflop') {
          streetStartPot[street] = round2(pot);
          roundContrib = new Map();
        }
        parseBoardCards(line, street, board);
      }
      continue;
    }

    const parsedButton = parseButtonSeat(line);
    if (Number.isFinite(parsedButton)) {
      buttonSeat = parsedButton;
      continue;
    }

    const seatMatch = line.match(/^Seat\s+(\d+):\s+(.+?)\s+\(/i);
    if (seatMatch?.[2]) {
      const seat = Number(seatMatch[1]);
      const playerName = seatMatch[2].trim();
      playersSet.add(playerName);
      if (Number.isFinite(seat)) {
        seatToPlayer.set(seat, playerName);
      }
      continue;
    }

    const parsed = parseActionLine(line);
    if (!parsed) {
      continue;
    }
    if (parsed.type === 'other') {
      continue;
    }

    const player = parsed.player;
    playersSet.add(player);

    if (!events[street]) {
      if (parsed.type === 'show') {
        showEvents.push({
          player,
          cards: Array.isArray(parsed.cards) ? parsed.cards : []
        });
      }
      continue;
    }

    if (parsed.type === 'show') {
      voluntaryShowEvents.push({
        street,
        player,
        cards: Array.isArray(parsed.cards) ? parsed.cards : []
      });
    }

    const event = {
      street,
      player,
      type: parsed.type,
      raw: parsed.raw,
      amount: Number.isFinite(parsed.amount) ? parsed.amount : null,
      toAmount: Number.isFinite(parsed.toAmount) ? parsed.toAmount : null,
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      potBefore: round2(pot),
      potAfter: round2(pot)
    };

    if (parsed.type === 'ante') {
      if (Number.isFinite(parsed.amount)) {
        pot += parsed.amount;
      }
      event.potAfter = round2(pot);
      events[street].push(event);
      continue;
    }

    if (parsed.type === 'small_blind' || parsed.type === 'big_blind' || parsed.type === 'straddle') {
      if (Number.isFinite(parsed.amount)) {
        pot += parsed.amount;
        const prev = roundContrib.get(player) || 0;
        roundContrib.set(player, prev + parsed.amount);
      }
      event.potAfter = round2(pot);
      events[street].push(event);
      continue;
    }

    if (parsed.type === 'call' || parsed.type === 'bet') {
      if (Number.isFinite(parsed.amount)) {
        pot += parsed.amount;
        const prev = roundContrib.get(player) || 0;
        roundContrib.set(player, prev + parsed.amount);
      }
      event.potAfter = round2(pot);
      event.amountBb = amountToBb(event.amount, bb);
      event.pctPot = Number.isFinite(event.amount) && event.potBefore > 0
        ? round2((event.amount / event.potBefore) * 100)
        : null;
      events[street].push(event);
      continue;
    }

    if (parsed.type === 'raise') {
      if (Number.isFinite(parsed.amount)) {
        pot += parsed.amount;
      }
      if (Number.isFinite(parsed.toAmount)) {
        roundContrib.set(player, parsed.toAmount);
      } else if (Number.isFinite(parsed.amount)) {
        const prev = roundContrib.get(player) || 0;
        roundContrib.set(player, prev + parsed.amount);
      }
      event.potAfter = round2(pot);
      event.amountBb = amountToBb(event.amount, bb);
      event.toAmountBb = amountToBb(event.toAmount, bb);
      event.pctPot = Number.isFinite(event.amount) && event.potBefore > 0
        ? round2((event.amount / event.potBefore) * 100)
        : null;
      event.toPctPot = Number.isFinite(event.toAmount) && event.potBefore > 0
        ? round2((event.toAmount / event.potBefore) * 100)
        : null;
      events[street].push(event);
      continue;
    }

    event.potAfter = round2(pot);
    events[street].push(event);
  }

  const players = Array.from(playersSet);
  const positionsByPlayer = buildPositionMap(buttonSeat, seatToPlayer);
  const targetPlayer = findTargetPlayer(opponent, players);
  const targetShow = showEvents.find((event) => event.player === targetPlayer);
  const targetCards = targetShow?.cards || [];
  const showCardsByPlayer = {};
  for (const event of showEvents) {
    if (!event?.player || !Array.isArray(event.cards) || !event.cards.length) continue;
    showCardsByPlayer[event.player] = event.cards;
  }
  const streetClassByPlayer = {};
  for (const [player, cards] of Object.entries(showCardsByPlayer)) {
    streetClassByPlayer[player] = computeStreetClasses(cards, board);
  }
  const primaryOpponentShow = selectPrimaryShowdownOpponent(targetPlayer, showEvents, events);
  const primaryOpponentCards = primaryOpponentShow?.cards || [];
  const targetStreetClass = streetClassByPlayer[targetPlayer]
    || (targetCards.length ? computeStreetClasses(targetCards, board) : { flop: '', turn: '', river: '' });
  const opponentStreetClass = primaryOpponentShow?.player
    ? (streetClassByPlayer[primaryOpponentShow.player] || { flop: '', turn: '', river: '' })
    : { flop: '', turn: '', river: '' };

  if (streetStartPot.preflop === 0) {
    streetStartPot.preflop = round2(
      (events.preflop || [])
        .filter((event) => ['ante', 'small_blind', 'big_blind', 'straddle'].includes(event.type))
        .reduce((sum, event) => sum + (event.amount || 0), 0)
    );
  }

  return {
    gameCardCount,
    blinds,
    board,
    streetStartPot,
    events,
    players,
    positionsByPlayer,
    targetPlayer,
    targetCards,
    targetIdHint: extractTargetIdHint(opponent),
    showdown: {
      seen: showdownSeen,
      mandatory: Boolean(showdownSeen && showEvents.length),
      showEvents,
      voluntaryShowEvents,
      targetCards,
      targetStreetClass,
      primaryOpponent: primaryOpponentShow?.player || '',
      primaryOpponentCards,
      opponentStreetClass,
      showCardsByPlayer,
      streetClassByPlayer
    }
  };
}

function summarizeEvent(event, bb, targetPlayer) {
  const role = event.player === targetPlayer ? 'TARGET' : 'OTHER';
  const who = `${role}:${event.player}`;
  if (event.type === 'check') return `${who} x`;
  if (event.type === 'fold') return `${who} f`;
  if (event.type === 'show') return `${who} showed [${(event.cards || []).join(' ')}]`;
  if (event.type === 'call') {
    return `${who} c ${formatNum(event.amount)} (${formatNum(event.amountBb)}bb)`;
  }
  if (event.type === 'bet') {
    return `${who} b ${formatNum(event.amount)} (${formatNum(event.amountBb)}bb, ${formatNum(event.pctPot)}%pot)`;
  }
  if (event.type === 'raise') {
    return `${who} r ${formatNum(event.amount)} to ${formatNum(event.toAmount)} (${formatNum(event.toAmountBb)}bb, to ${formatNum(event.toPctPot)}%pot)`;
  }
  if (event.type === 'small_blind') return `${who} posts SB ${formatNum(event.amount)} (${formatNum(amountToBb(event.amount, bb))}bb)`;
  if (event.type === 'big_blind') return `${who} posts BB ${formatNum(event.amount)} (${formatNum(amountToBb(event.amount, bb))}bb)`;
  if (event.type === 'straddle') return `${who} posts straddle ${formatNum(event.amount)} (${formatNum(amountToBb(event.amount, bb))}bb)`;
  if (event.type === 'ante') return `${who} ante ${formatNum(event.amount)} (${formatNum(amountToBb(event.amount, bb))}bb)`;
  return `${who} ${event.raw}`;
}

export function buildHandHistoryContext(parsed) {
  const bb = parsed?.blinds?.bigBlind;
  const lines = [];
  lines.push(`target_player=${parsed?.targetPlayer || ''}`);
  lines.push(`target_id_hint=${parsed?.targetIdHint || ''}`);
  lines.push(`blinds=SB:${formatNum(parsed?.blinds?.smallBlind)} BB:${formatNum(bb)}`);
  lines.push(`street_start_pot=preflop:${formatNum(parsed?.streetStartPot?.preflop)} flop:${formatNum(parsed?.streetStartPot?.flop)} turn:${formatNum(parsed?.streetStartPot?.turn)} river:${formatNum(parsed?.streetStartPot?.river)}`);
  lines.push(`board=flop:[${(parsed?.board?.flop || []).join(' ')}] turn:[${parsed?.board?.turn || ''}] river:[${parsed?.board?.river || ''}]`);
  lines.push(`target_cards=[${(parsed?.targetCards || []).join(' ')}]`);
  const positions = parsed?.positionsByPlayer || {};
  const positionPairs = Object.entries(positions)
    .map(([player, position]) => `${player}:${position}`)
    .join(' ');
  lines.push(`positions=${positionPairs}`);
  lines.push(`showdown_mode=${parsed?.showdown?.mandatory ? 'mandatory' : parsed?.showdown?.seen ? 'present_without_cards' : 'none'}`);
  lines.push(`voluntary_show_count=${(parsed?.showdown?.voluntaryShowEvents || []).length}`);
  lines.push(`target_class_by_street=flop:${parsed?.showdown?.targetStreetClass?.flop || ''} turn:${parsed?.showdown?.targetStreetClass?.turn || ''} river:${parsed?.showdown?.targetStreetClass?.river || ''}`);
  lines.push(`showdown_primary_opponent=${parsed?.showdown?.primaryOpponent || ''}`);
  lines.push(`showdown_primary_cards=[${(parsed?.showdown?.primaryOpponentCards || []).join(' ')}]`);
  lines.push(`opponent_class_by_street=flop:${parsed?.showdown?.opponentStreetClass?.flop || ''} turn:${parsed?.showdown?.opponentStreetClass?.turn || ''} river:${parsed?.showdown?.opponentStreetClass?.river || ''}`);
  lines.push('rule_showed=Use token showed only for voluntary reveal when showdown is not mandatory. For mandatory showdown use sd + cards.');

  for (const street of ['preflop', 'flop', 'turn', 'river']) {
    lines.push(`${street.toUpperCase()}:`);
    const streetEvents = parsed?.events?.[street] || [];
    for (const event of streetEvents) {
      const position = positions?.[event.player] || '';
      lines.push(`- ${summarizeEvent(event, bb, parsed?.targetPlayer)}${position ? ` [${position}]` : ''}`);
    }
  }

  return lines.join('\n');
}

function compactCards(cards) {
  return (cards || []).map((card) => String(card || '').trim()).filter(Boolean).join('');
}

function sanitizeArtifacts(text) {
  return String(text || '')
    .replace(/\(\s*\d+\s+\d+(?:\.\d+)?bb\s*\)/gi, '')
    .replace(/\bvs\s*\d+c\b/gi, '')
    .replace(/\btclass_[a-z0-9_]+\b/gi, '')
    .replace(/\bvclass_[a-z0-9_]+\b/gi, '')
    .replace(/\btcards_[a-z0-9]+\b/gi, '')
    .replace(/\bvcards_[a-z0-9]+\b/gi, '')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .replace(/(^\/\s*|\s*\/$)/g, '')
    .trim();
}

function stripShowedToken(text) {
  return String(text || '')
    .replace(/\bshow(?:ed)?\b/gi, '')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .replace(/(^\/\s*|\s*\/$)/g, '')
    .trim();
}

function appendUniqueToken(text, token) {
  const source = String(text || '').trim();
  const cleanToken = String(token || '').trim();
  if (!cleanToken) return source;
  const regex = new RegExp(`\\b${escapeRegExp(cleanToken)}\\b`, 'i');
  if (regex.test(source)) {
    return source;
  }
  return source ? `${source} ${cleanToken}` : cleanToken;
}

function containsToken(text, token) {
  if (!token) return false;
  const regex = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i');
  return regex.test(String(text || ''));
}

function compactStreetClassToken(cardsCompact, cls) {
  const cards = String(cardsCompact || '').trim();
  const streetClass = String(cls || '').trim();
  if (!cards && !streetClass) return '';
  if (cards && streetClass) return `${cards}_${streetClass}`;
  return cards || streetClass;
}

function streetBoardCards(parsedHistory, street) {
  const flop = parsedHistory?.board?.flop || [];
  const turn = parsedHistory?.board?.turn || '';
  const river = parsedHistory?.board?.river || '';
  if (street === 'flop') return flop;
  if (street === 'turn') return turn ? [...flop, turn] : flop;
  if (street === 'river') return river ? [...flop, turn].filter(Boolean).concat([river]) : [...flop, turn].filter(Boolean);
  return [];
}

function boardToken(parsedHistory, street) {
  const cards = streetBoardCards(parsedHistory, street)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (!cards.length) return '';
  return `on${cards.join('')}`;
}

function deriveTargetInterpretation(parsedHistory, street, actionEvent, targetClass) {
  if (!actionEvent) return '';
  const events = parsedHistory?.events?.[street] || [];
  const target = parsedHistory?.targetPlayer;
  const board = streetBoardCards(parsedHistory, street);

  if (street === 'turn' && actionEvent.type === 'check' && targetClass === 'nutstr') {
    const hasAnyAggression = events.some((event) => event.type === 'bet' || event.type === 'raise');
    const targetIndex = events.indexOf(actionEvent);
    const hasCheckBehind = targetIndex >= 0
      && events.slice(targetIndex + 1).some((event) => event.player !== target && event.type === 'check');
    if (!hasAnyAggression && hasCheckBehind) {
      return '[z]';
    }
  }

  if (street === 'river' && actionEvent.type === 'check' && boardIsPaired(board)) {
    return '[potctrl]';
  }

  return '';
}

function findTargetPrimaryActionEvent(parsedHistory, street) {
  const target = parsedHistory?.targetPlayer;
  const events = parsedHistory?.events?.[street] || [];
  const targetEvents = events.filter((event) => event.player === target);
  if (!targetEvents.length) return null;

  const actionable = targetEvents.filter((event) => ['call', 'bet', 'raise', 'check', 'fold'].includes(event.type));
  if (!actionable.length) return null;

  if (street === 'preflop') {
    const raiseOrBet = actionable.filter((event) => event.type === 'raise' || event.type === 'bet');
    if (raiseOrBet.length) return raiseOrBet[raiseOrBet.length - 1];
  }
  return actionable[0];
}

function isTargetPreflopAggressor(parsedHistory) {
  const target = parsedHistory?.targetPlayer;
  const preflop = parsedHistory?.events?.preflop || [];
  for (let i = preflop.length - 1; i >= 0; i -= 1) {
    const event = preflop[i];
    if (event.type === 'raise' || event.type === 'bet') {
      return event.player === target;
    }
  }
  return false;
}

function eventActionToken(event, street, isCheckBehind = false) {
  if (!event) return '';
  if (event.type === 'fold') return 'f';
  if (event.type === 'check') return isCheckBehind ? 'xb' : 'x';
  if (event.type === 'call') {
    if (street === 'preflop' && Number.isFinite(event.amountBb)) {
      return `c${formatNum(event.amountBb)}bb`;
    }
    return 'c';
  }
  if (event.type === 'bet') {
    if (street !== 'preflop' && Number.isFinite(event.pctPot)) {
      return `b${formatNum(event.pctPot)}`;
    }
    if (street === 'preflop' && Number.isFinite(event.amountBb)) {
      return `b${formatNum(event.amountBb)}bb`;
    }
    return 'b';
  }
  if (event.type === 'raise') {
    if (street === 'preflop') {
      if (Number.isFinite(event.toAmountBb)) return `r${formatNum(event.toAmountBb)}bb`;
      if (Number.isFinite(event.amountBb)) return `r${formatNum(event.amountBb)}bb`;
      return 'r';
    }
    if (Number.isFinite(event.toPctPot)) return `r${formatNum(event.toPctPot)}`;
    if (Number.isFinite(event.pctPot)) return `r${formatNum(event.pctPot)}`;
    return 'r';
  }
  return '';
}

function buildOpponentFragmentsForStreet(parsedHistory, street) {
  const events = parsedHistory?.events?.[street] || [];
  const target = parsedHistory?.targetPlayer;
  if (!target || !events.length) return [];

  const positions = parsedHistory?.positionsByPlayer || {};
  const showCardsByPlayer = parsedHistory?.showdown?.showCardsByPlayer || {};
  const streetClassByPlayer = parsedHistory?.showdown?.streetClassByPlayer || {};
  let relevant = events;

  if (street === 'preflop') {
    let targetAggIndex = -1;
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      if (event.player === target && (event.type === 'raise' || event.type === 'bet')) {
        targetAggIndex = i;
      }
    }
    if (targetAggIndex >= 0) {
      relevant = events.slice(targetAggIndex + 1);
    }
  }

  const out = [];
  for (let i = 0; i < relevant.length; i += 1) {
    const event = relevant[i];
    if (!event || event.player === target) continue;
    if (!['fold', 'check', 'call', 'bet', 'raise'].includes(event.type)) continue;
    if (street === 'preflop' && event.type === 'fold') continue;

    const absoluteIndex = events.indexOf(event);
    const prev = absoluteIndex > 0 ? events[absoluteIndex - 1] : null;
    const seenAggBefore = events
      .slice(0, absoluteIndex + 1)
      .some((item) => item.type === 'bet' || item.type === 'raise');
    const isCheckBehind = Boolean(
      street !== 'preflop'
      && event.type === 'check'
      && prev
      && prev.player === target
      && prev.type === 'check'
      && !seenAggBefore
    );

    const action = eventActionToken(event, street, isCheckBehind);
    if (!action) continue;
    const pos = String(positions[event.player] || '').toUpperCase();
    const prefix = pos || event.player;
    let token = `${prefix} ${action}`;

    const cards = compactCards(showCardsByPlayer[event.player]);
    const cls = streetClassByPlayer[event.player]?.[street] || '';
    const withClass = compactStreetClassToken(cards, cls);
    if (withClass) token = `${token} ${withClass}`;

    out.push(token.trim());
  }
  return out;
}

function buildTargetStreetPrefix(parsedHistory, street) {
  const target = parsedHistory?.targetPlayer || '';
  const targetPos = String(parsedHistory?.positionsByPlayer?.[target] || '').toUpperCase();
  const targetCardsCompact = compactCards(parsedHistory?.showdown?.targetCards);
  const targetClass = parsedHistory?.showdown?.targetStreetClass?.[street] || '';
  const actionEvent = findTargetPrimaryActionEvent(parsedHistory, street);
  if (!actionEvent) return '';

  const action = eventActionToken(actionEvent, street, false);
  if (!action) return '';
  const normalizedAction = (
    street === 'flop'
    && actionEvent.type === 'bet'
    && isTargetPreflopAggressor(parsedHistory)
    && /^b\d/.test(action)
  )
    ? action.replace(/^b/, 'cb')
    : action;

  const parts = [];
  if (street === 'preflop') {
    const hasStraddle = (parsedHistory?.events?.preflop || [])
      .some((event) => event.player === target && event.type === 'straddle');
    if (hasStraddle && Number.isFinite(parsedHistory?.gameCardCount)) {
      parts.push(`${parsedHistory.gameCardCount}c`);
      parts.push('straddle');
    } else if (hasStraddle) {
      parts.push('straddle');
    }
  }

  if (targetPos) parts.push(targetPos);
  parts.push(normalizedAction);

  if (targetCardsCompact) {
    if (street === 'preflop') {
      parts.push(targetCardsCompact);
    } else {
      parts.push(compactStreetClassToken(targetCardsCompact, targetClass));
    }
  }

  if (street !== 'preflop') {
    const board = boardToken(parsedHistory, street);
    if (board) parts.push(board);
  }

  const interpretation = deriveTargetInterpretation(parsedHistory, street, actionEvent, targetClass);
  if (interpretation) {
    parts.push(interpretation);
  }

  return parts.join(' ').trim();
}

function buildDeterministicStreetNote(parsedHistory, street) {
  const targetPrefix = buildTargetStreetPrefix(parsedHistory, street);
  const opponents = buildOpponentFragmentsForStreet(parsedHistory, street);
  if (!targetPrefix && !opponents.length) return '';
  if (!targetPrefix) return opponents.join(' / ');
  if (!opponents.length) return targetPrefix;
  return `${targetPrefix} / ${opponents.join(' / ')}`.trim();
}

export function enrichHandHistoryParsed(parsedFields, parsedHistory) {
  const out = {
    preflop: sanitizeArtifacts(String(parsedFields?.preflop || '')),
    flop: sanitizeArtifacts(String(parsedFields?.flop || '')),
    turn: sanitizeArtifacts(String(parsedFields?.turn || '')),
    river: sanitizeArtifacts(String(parsedFields?.river || '')),
    presupposition: sanitizeArtifacts(String(parsedFields?.presupposition || ''))
  };

  const showdown = parsedHistory?.showdown || {};
  if (showdown.mandatory) {
    for (const key of Object.keys(out)) {
      out[key] = stripShowedToken(out[key]);
    }
  }

  for (const street of ['preflop', 'flop', 'turn', 'river']) {
    const deterministic = buildDeterministicStreetNote(parsedHistory, street);
    if (deterministic) {
      out[street] = sanitizeArtifacts(deterministic);
    }
  }

  if (showdown.mandatory) {
    const riverTarget = out.river ? 'river' : 'presupposition';
    out[riverTarget] = appendUniqueToken(out[riverTarget], 'sd');
  }

  return out;
}

function dedupeReplacements(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.raw}|${item.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function buildStreetReplacements(parsed, street) {
  const target = parsed?.targetPlayer;
  const events = (parsed?.events?.[street] || []).filter((event) => event.player === target);
  const replacements = [];

  if (street === 'preflop') {
    for (const event of events) {
      if (event.type === 'raise' && Number.isFinite(event.toAmount) && Number.isFinite(event.toAmountBb)) {
        replacements.push({ raw: formatNum(event.toAmount), value: `${formatNum(event.toAmountBb)}bb` });
      }
      if (['call', 'bet', 'raise'].includes(event.type) && Number.isFinite(event.amount) && Number.isFinite(event.amountBb)) {
        replacements.push({ raw: formatNum(event.amount), value: `${formatNum(event.amountBb)}bb` });
      }
    }
    return dedupeReplacements(replacements);
  }

  for (const event of events) {
    if (event.type === 'bet' && Number.isFinite(event.amount) && Number.isFinite(event.pctPot)) {
      replacements.push({ raw: formatNum(event.amount), value: formatNum(event.pctPot) });
    }
    if (event.type === 'raise') {
      if (Number.isFinite(event.toAmount) && Number.isFinite(event.toPctPot)) {
        replacements.push({ raw: formatNum(event.toAmount), value: formatNum(event.toPctPot) });
      }
      if (Number.isFinite(event.amount) && Number.isFinite(event.pctPot)) {
        replacements.push({ raw: formatNum(event.amount), value: formatNum(event.pctPot) });
      }
    }
  }
  return dedupeReplacements(replacements);
}

function applyReplacements(text, replacements) {
  let out = String(text || '');
  if (!out || !replacements.length) return out;
  const prefixes = '(tpb|tp|cb|bbb|bb|bxb|xr|r|d|b|c)';

  for (const item of replacements.sort((a, b) => String(b.raw).length - String(a.raw).length)) {
    const rawEscaped = escapeRegExp(item.raw);
    const regex = new RegExp(`\\b${prefixes}\\s*${rawEscaped}\\b`, 'gi');
    out = out.replace(regex, (_match, prefix) => `${prefix}${item.value}`);
  }

  return out;
}

export function canonicalizeHandHistoryUnits(parsedFields, parsedHistory) {
  const out = {
    preflop: String(parsedFields?.preflop || ''),
    flop: String(parsedFields?.flop || ''),
    turn: String(parsedFields?.turn || ''),
    river: String(parsedFields?.river || ''),
    presupposition: String(parsedFields?.presupposition || '')
  };

  out.preflop = applyReplacements(out.preflop, buildStreetReplacements(parsedHistory, 'preflop'));
  out.flop = applyReplacements(out.flop, buildStreetReplacements(parsedHistory, 'flop'));
  out.turn = applyReplacements(out.turn, buildStreetReplacements(parsedHistory, 'turn'));
  out.river = applyReplacements(out.river, buildStreetReplacements(parsedHistory, 'river'));

  return out;
}
