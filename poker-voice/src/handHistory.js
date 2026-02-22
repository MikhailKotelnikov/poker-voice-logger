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
  const source = String(line || '');
  if (/^\*\*\*\s+HOLE CARDS\s+\*\*\*/i.test(source)) return 'preflop';
  if (/^\*\*\*\s+(?:FIRST|SECOND)\s+FLOP\s+\*\*\*/i.test(source)) return 'flop';
  if (/^\*\*\*\s+(?:FIRST|SECOND)\s+TURN\s+\*\*\*/i.test(source)) return 'turn';
  if (/^\*\*\*\s+(?:FIRST|SECOND)\s+RIVER\s+\*\*\*/i.test(source)) return 'river';
  if (/^\*\*\*\s+(?:FIRST|SECOND)\s+SHOW DOWN\s+\*\*\*/i.test(source)) return 'showdown';
  if (/^\*\*\*\s+FLOP\s+\*\*\*/i.test(source)) return 'flop';
  if (/^\*\*\*\s+TURN\s+\*\*\*/i.test(source)) return 'turn';
  if (/^\*\*\*\s+RIVER\s+\*\*\*/i.test(source)) return 'river';
  if (/^\*\*\*\s+SHOW DOWN\s+\*\*\*/i.test(source)) return 'showdown';
  return '';
}

function parseBoardCards(line, street, board) {
  const source = String(line || '');
  const runMarker = source.match(/^\*\*\*\s+(FIRST|SECOND)\s+/i)?.[1]?.toUpperCase() || '';
  const canOverwrite = runMarker !== 'SECOND';

  if (street === 'flop') {
    const m = source.match(/\*\*\*\s+(?:FIRST\s+|SECOND\s+)?FLOP\s+\*\*\*\s+\[([^\]]+)\]/i);
    if (m?.[1] && (!Array.isArray(board.flop) || !board.flop.length || canOverwrite)) {
      board.flop = m[1].trim().split(/\s+/).filter(Boolean);
    }
    return;
  }
  if (street === 'turn') {
    const m = source.match(/\*\*\*\s+(?:FIRST\s+|SECOND\s+)?TURN\s+\*\*\*\s+\[[^\]]+\]\s+\[([^\]]+)\]/i);
    if (m?.[1] && (!board.turn || canOverwrite)) {
      board.turn = m[1].trim();
    }
    return;
  }
  if (street === 'river') {
    const m = source.match(/\*\*\*\s+(?:FIRST\s+|SECOND\s+)?RIVER\s+\*\*\*\s+\[[^\]]+\]\s+\[([^\]]+)\]/i);
    if (m?.[1] && (!board.river || canOverwrite)) {
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
  const allIn = /\ball-?in\b/i.test(action);

  if (/^checks\b/i.test(action)) return { player, type: 'check', raw: action };
  if (/^folds\b/i.test(action)) return { player, type: 'fold', raw: action };
  if (/^calls\b/i.test(action)) {
    const amount = toNumber(action.match(/calls\s+[^0-9]*([0-9.,]+)/i)?.[1]);
    return { player, type: 'call', amount, allIn, raw: action };
  }
  if (/^bets\b/i.test(action)) {
    const amount = toNumber(action.match(/bets\s+[^0-9]*([0-9.,]+)/i)?.[1]);
    return { player, type: 'bet', amount, allIn, raw: action };
  }
  if (/^raises\b/i.test(action)) {
    const amount = toNumber(action.match(/raises\s+[^0-9]*([0-9.,]+)/i)?.[1]);
    const toAmount = toNumber(action.match(/\bto\s+[^0-9]*([0-9.,]+)/i)?.[1]);
    return { player, type: 'raise', amount, toAmount, allIn, raw: action };
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

function parseUncalledReturnLine(line) {
  const match = String(line || '').match(/^Uncalled bet\s+\(([^)]+)\)\s+returned to\s+(.+)$/i);
  if (!match) return null;
  const amount = toNumber(match[1]);
  const player = String(match[2] || '').trim();
  if (!player || !Number.isFinite(amount)) return null;
  return { player, amount };
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

  for (const street of ['flop', 'turn', 'river']) {
    const boardCards = boards[street] || [];
    if (!boardIsPaired(boardCards)) continue;
    const detail = out._details[street];
    if (!detail || detail.classToken !== '2p') continue;
    out[street] = 'p';
    out._details[street] = { ...detail, classToken: 'p', downgradedFrom: '2p_on_paired_board' };
  }

  return out;
}

function buildStreetDraws(cardsRaw, board) {
  const cards = (cardsRaw || []).map(parseCardToken).filter(Boolean);
  if (cards.length < 2) {
    return { flop: [], turn: [], river: [] };
  }

  const boards = buildStreetBoards(board);
  const classes = computeStreetClasses(cardsRaw, board);

  return {
    flop: deriveStreetDrawTokens(cards, boards.flop, classes.flop),
    turn: deriveStreetDrawTokens(cards, boards.turn, classes.turn),
    river: []
  };
}

function deriveStreetDrawTokens(holeCards, boardCards, madeClass) {
  const cardsToCome = 5 - (boardCards?.length || 0);
  if (cardsToCome <= 0) return [];

  const made = String(madeClass || '').toLowerCase();
  const draws = [];

  const flushDrawToken = detectFlushDrawToken(holeCards, boardCards, cardsToCome, made);
  if (flushDrawToken) draws.push(flushDrawToken);

  const straightDrawToken = detectStraightDrawToken(holeCards, boardCards, cardsToCome, made);
  if (straightDrawToken) draws.push(straightDrawToken);

  return draws;
}

function detectFlushDrawToken(holeCards, boardCardsRaw, cardsToCome, madeClass) {
  if (['flush', 'strflush', 'full', 'quads'].includes(madeClass)) {
    return '';
  }

  const boardCards = (boardCardsRaw || []).map(parseCardToken).filter(Boolean);
  const holeSuitCounts = new Map();
  for (const card of holeCards || []) {
    holeSuitCounts.set(card.suit, (holeSuitCounts.get(card.suit) || 0) + 1);
  }
  const boardSuitCounts = new Map();
  for (const card of boardCards) {
    boardSuitCounts.set(card.suit, (boardSuitCounts.get(card.suit) || 0) + 1);
  }
  const hasTwoSuitBoard = Array.from(boardSuitCounts.values()).some((count) => count >= 2);
  if (!hasTwoSuitBoard) {
    return '';
  }

  let bestSuit = '';
  let bestNeeded = Infinity;
  let bestBoardCount = 0;
  for (const [suit, holeCount] of holeSuitCounts.entries()) {
    if (holeCount < 2) continue;
    const boardCount = boardSuitCounts.get(suit) || 0;
    // PLO rule for current project: flush draw is tracked only if board already has 2 cards of same suit.
    // 1-suited board (rainbow) is treated as no flush draw token.
    if (boardCount < 2) continue;
    const needed = 3 - boardCount;
    if (needed <= 0 || needed > cardsToCome) continue;
    if (needed < bestNeeded || (needed === bestNeeded && boardCount > bestBoardCount)) {
      bestNeeded = needed;
      bestBoardCount = boardCount;
      bestSuit = suit;
    }
  }

  if (!bestSuit) return '';
  const hasAceSuit = (holeCards || []).some((card) => card.rank === 'A' && card.suit === bestSuit);
  return hasAceSuit ? 'nfd' : 'fd';
}

function detectStraightDrawToken(holeCards, boardCardsRaw, cardsToCome, madeClass) {
  if (['str', 'nutstr', 'strflush', 'full', 'quads'].includes(madeClass)) {
    return '';
  }
  if (cardsToCome <= 0) return '';

  const boardCards = (boardCardsRaw || []).map(parseCardToken).filter(Boolean);
  if (boardCards.length < 3) return '';

  const holeRaw = (holeCards || []).map((card) => card.raw).filter(Boolean);
  const boardRaw = boardCards.map((card) => card.raw);
  const availableDeck = fullDeckExcluding([...holeRaw, ...boardRaw]);
  const outRanks = new Set();

  for (const rank of CARD_RANKS) {
    const forcedCards = availableDeck.filter((card) => card[0].toUpperCase() === rank);
    let support = 0;
    let possible = 0;
    for (const forcedCard of forcedCards) {
      const nextCount = Math.max(0, availableDeck.length - 1);
      possible += cardsToCome >= 2 ? nextCount : 1;
      support += countStraightSupportsWithForcedCard(holeRaw, boardRaw, forcedCard, cardsToCome, availableDeck);
    }
    const ratio = possible > 0 ? support / possible : 0;
    const rankWorks = cardsToCome >= 2 ? ratio >= 0.45 : support >= 1;
    if (rankWorks) {
      outRanks.add(rank);
    }
  }

  const count = outRanks.size;
  if (count >= 4) return 'wrap';
  if (count >= 2) return 'oe';
  if (count === 1) return 'g';
  return '';
}

function fullDeckExcluding(excludedCardsRaw) {
  const excluded = new Set((excludedCardsRaw || []).map((card) => String(card || '').trim()).filter(Boolean));
  const deck = [];
  for (const rank of CARD_RANKS) {
    for (const suit of CARD_SUITS) {
      const raw = `${rank}${suit}`;
      if (!excluded.has(raw)) {
        deck.push(raw);
      }
    }
  }
  return deck;
}

function countStraightSupportsWithForcedCard(holeRaw, boardRaw, forcedCard, cardsToCome, availableDeck) {
  if (!forcedCard) return 0;
  const remaining = Math.max(0, cardsToCome - 1);
  if (remaining === 0) {
    return hasStraightUsingForcedCard(holeRaw, [...boardRaw, forcedCard], forcedCard) ? 1 : 0;
  }

  const nextDeck = (availableDeck || []).filter((card) => card !== forcedCard);
  let support = 0;
  if (remaining === 1) {
    for (const second of nextDeck) {
      if (hasStraightUsingForcedCard(holeRaw, [...boardRaw, forcedCard, second], forcedCard)) {
        support += 1;
      }
    }
    return support;
  }

  for (const combo of combinations(nextDeck, remaining)) {
    if (hasStraightUsingForcedCard(holeRaw, [...boardRaw, forcedCard, ...combo], forcedCard)) {
      support += 1;
    }
  }
  return support;
}

function hasStraightUsingForcedCard(holeRaw, boardRaw, forcedCardRaw) {
  const holeCards = (holeRaw || []).map(parseCardToken).filter(Boolean);
  const boardCards = (boardRaw || []).map(parseCardToken).filter(Boolean);
  if (holeCards.length < 2 || boardCards.length < 3) return false;

  const forced = String(forcedCardRaw || '').trim();
  const holeCombos = combinations(holeCards, 2);
  const boardCombos = combinations(boardCards, 3);
  for (const hole of holeCombos) {
    for (const board of boardCombos) {
      if (!board.some((card) => card.raw === forced)) continue;
      const strength = evaluateFiveCardStrength([...hole, ...board]);
      if (strength.category === 4 || strength.category === 8) {
        return true;
      }
    }
  }
  return false;
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

function boardRankValues(boardCardsRaw) {
  return (boardCardsRaw || [])
    .map(parseCardToken)
    .filter(Boolean)
    .map((card) => card.value);
}

function boardRankVariants(boardCardsRaw) {
  const unique = Array.from(new Set(boardRankValues(boardCardsRaw))).sort((a, b) => a - b);
  if (!unique.length) return [];
  const variants = [unique];
  if (unique.includes(14)) {
    variants.push(
      Array.from(new Set(unique.map((value) => (value === 14 ? 1 : value))))
        .sort((a, b) => a - b)
    );
  }
  return variants;
}

function choose(items, size) {
  const out = [];
  if (!Array.isArray(items) || size <= 0 || items.length < size) return out;
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

function boardHasNToStraight(boardCardsRaw, n) {
  if (!Number.isInteger(n) || n < 3 || n > 5) return false;
  for (const values of boardRankVariants(boardCardsRaw)) {
    if (values.length < n) continue;
    for (const combo of choose(values, n)) {
      const min = Math.min(...combo);
      const max = Math.max(...combo);
      if (max - min <= 4) return true;
    }
  }
  return false;
}

function deriveFragileStrongTokens(streetClassToken, boardCardsRaw, detail = null) {
  const classToken = String(streetClassToken || '').toLowerCase();
  if (!classToken) return [];

  const boardPaired = boardIsPaired(boardCardsRaw);
  const boardFlushy = boardMaxSuitCount(boardCardsRaw) >= 3;
  const board3Str = boardHasNToStraight(boardCardsRaw, 3);
  const board4Or5Str = boardHasNToStraight(boardCardsRaw, 4) || boardHasNToStraight(boardCardsRaw, 5);

  const isSetLike = classToken === 'set' || classToken === 'topset' || classToken === 'tri';
  const isStraightLike = classToken === 'str';
  const isFlushLike = classToken === 'flush';

  const tags = [];

  if (isSetLike && board3Str) tags.push('STRB');
  if ((isSetLike || isStraightLike) && boardFlushy) tags.push('FLB');
  if ((isStraightLike || isFlushLike) && boardPaired) tags.push('pairedboard');

  if (isStraightLike && board4Or5Str) {
    const straightHigh = Number(detail?.straightHigh);
    const nutHigh = nutStraightHighOnBoard(boardCardsRaw);
    if (!Number.isFinite(straightHigh) || !Number.isFinite(nutHigh) || straightHigh < nutHigh) {
      tags.push('lowstr');
      tags.push('STRB');
    }
  }

  return Array.from(new Set(tags));
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
  let inTableHeader = true;

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
        if (streetMarker === 'preflop') {
          inTableHeader = false;
        }
      }
      continue;
    }

    if (inTableHeader) {
      const parsedButton = parseButtonSeat(line);
      if (Number.isFinite(parsedButton)) {
        buttonSeat = parsedButton;
        continue;
      }

      const seatMatch = line.match(/^Seat\s+(\d+):\s+(.+?)\s+\([^)]+in chips\)\s*$/i);
      if (seatMatch?.[2]) {
        const seat = Number(seatMatch[1]);
        const playerName = seatMatch[2].trim();
        playersSet.add(playerName);
        if (Number.isFinite(seat)) {
          seatToPlayer.set(seat, playerName);
        }
        continue;
      }
    }

    const uncalledReturn = parseUncalledReturnLine(line);
    if (uncalledReturn) {
      if (events[street]) {
        const event = {
          street,
          player: uncalledReturn.player,
          type: 'uncalled_return',
          raw: line,
          amount: uncalledReturn.amount,
          toAmount: null,
          cards: [],
          potBefore: round2(pot),
          potAfter: round2(pot)
        };

        pot = round2(Math.max(0, pot - uncalledReturn.amount));
        event.potAfter = round2(pot);

        const streetEvents = events[street];
        for (let i = streetEvents.length - 1; i >= 0; i -= 1) {
          const prev = streetEvents[i];
          if (!prev || prev.player !== uncalledReturn.player) continue;
          if (!['bet', 'raise'].includes(prev.type)) continue;
          if (Number.isFinite(prev.amount)) {
            const hadMatchedCounterAction = streetEvents
              .slice(i + 1)
              .some((candidate) => (
                candidate
                && candidate.player
                && candidate.player !== uncalledReturn.player
                && (candidate.type === 'call' || candidate.type === 'raise')
              ));
            prev.uncalledReturned = uncalledReturn.amount;
            if (hadMatchedCounterAction) {
              prev.amount = round2(Math.max(0, prev.amount - uncalledReturn.amount));
              prev.amountBb = amountToBb(prev.amount, bb);
              prev.pctPot = Number.isFinite(prev.potBefore) && prev.potBefore > 0
                ? round2((prev.amount / prev.potBefore) * 100)
                : null;
            }
          }
          break;
        }

        streetEvents.push(event);
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
    if (parsed.type === 'show') {
      showEvents.push({
        player,
        cards: Array.isArray(parsed.cards) ? parsed.cards : []
      });
    }

    if (!events[street]) {
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
      allIn: Boolean(parsed.allIn),
      amount: Number.isFinite(parsed.amount) ? parsed.amount : null,
      amountRaw: Number.isFinite(parsed.amount) ? parsed.amount : null,
      toAmount: Number.isFinite(parsed.toAmount) ? parsed.toAmount : null,
      toAmountRaw: Number.isFinite(parsed.toAmount) ? parsed.toAmount : null,
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
      event.rawPctPot = event.pctPot;
      events[street].push(event);
      continue;
    }

    if (parsed.type === 'raise') {
      const prevContribution = roundContrib.get(player) || 0;
      let addedAmount = Number.isFinite(parsed.amount) ? parsed.amount : null;
      event.rawPctPot = Number.isFinite(event.amountRaw) && event.potBefore > 0
        ? round2((event.amountRaw / event.potBefore) * 100)
        : null;
      event.rawToPctPot = Number.isFinite(event.toAmountRaw) && event.potBefore > 0
        ? round2((event.toAmountRaw / event.potBefore) * 100)
        : null;
      if (Number.isFinite(parsed.toAmount)) {
        const delta = round2(parsed.toAmount - prevContribution);
        if (Number.isFinite(delta) && delta >= 0) {
          addedAmount = delta;
        }
      }
      if (Number.isFinite(addedAmount)) {
        pot += addedAmount;
      }
      if (Number.isFinite(parsed.toAmount)) {
        roundContrib.set(player, parsed.toAmount);
      } else if (Number.isFinite(addedAmount)) {
        roundContrib.set(player, prevContribution + addedAmount);
      }
      event.amountRaw = Number.isFinite(event.amount) ? event.amount : null;
      if (Number.isFinite(addedAmount)) {
        event.amount = addedAmount;
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
  const streetDrawByPlayer = {};
  for (const [player, cards] of Object.entries(showCardsByPlayer)) {
    streetClassByPlayer[player] = computeStreetClasses(cards, board);
    streetDrawByPlayer[player] = buildStreetDraws(cards, board);
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
      mandatory: Boolean(showEvents.length && (showdownSeen || showEvents.length >= 2)),
      showEvents,
      voluntaryShowEvents,
      targetCards,
      targetStreetClass,
      primaryOpponent: primaryOpponentShow?.player || '',
      primaryOpponentCards,
      opponentStreetClass,
      showCardsByPlayer,
      streetClassByPlayer,
      streetDrawByPlayer
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
  lines.push('rule_showed=Use token showed only for voluntary reveal when showdown is not mandatory. Do not add sd token.');

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

function streetPotToken(parsedHistory, street) {
  if (street === 'preflop') return '';
  const bb = Number(parsedHistory?.blinds?.bigBlind || 0);
  const rawPot = Number(parsedHistory?.streetStartPot?.[street]);
  if (!Number.isFinite(bb) || bb <= 0 || !Number.isFinite(rawPot) || rawPot <= 0) return '';
  const potBb = amountToBb(rawPot, bb);
  if (!Number.isFinite(potBb) || potBb <= 0) return '';
  return `(${formatNum(potBb)})`;
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

function formatSizingNonZero(valueRaw) {
  if (!Number.isFinite(valueRaw)) return '';
  const value = Number(valueRaw);
  if (value <= 0) return '';
  const normalized = value > 0 && value < 0.01 ? 0.01 : value;
  const formatted = formatNum(normalized);
  return formatted === '0' ? '0.01' : formatted;
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
    const pctPot = Number.isFinite(event.pctPot) && event.pctPot > 0
      ? event.pctPot
      : Number.isFinite(event.rawPctPot) && event.rawPctPot > 0
        ? event.rawPctPot
        : null;
    if (street !== 'preflop' && Number.isFinite(pctPot)) {
      const formatted = formatSizingNonZero(pctPot);
      return formatted ? `b${formatted}` : 'b';
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
    const toPctPot = Number.isFinite(event.toPctPot) && event.toPctPot > 0
      ? event.toPctPot
      : Number.isFinite(event.rawToPctPot) && event.rawToPctPot > 0
        ? event.rawToPctPot
        : null;
    const pctPot = Number.isFinite(event.pctPot) && event.pctPot > 0
      ? event.pctPot
      : Number.isFinite(event.rawPctPot) && event.rawPctPot > 0
        ? event.rawPctPot
        : null;
    if (Number.isFinite(toPctPot)) {
      const formattedTo = formatSizingNonZero(toPctPot);
      return formattedTo ? `r${formattedTo}` : 'r';
    }
    if (Number.isFinite(pctPot)) {
      const formatted = formatSizingNonZero(pctPot);
      return formatted ? `r${formatted}` : 'r';
    }
    return 'r';
  }
  return '';
}

function formatRaiseMultiplier(multiplierRaw) {
  const multiplier = round2(multiplierRaw);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return '';
  const nearestInt = Math.round(multiplier);
  if (Math.abs(multiplier - nearestInt) <= 0.08) {
    return String(nearestInt);
  }
  const oneDecimal = round2(Math.round(multiplier * 10) / 10);
  const oneDecimalInt = Math.round(oneDecimal);
  if (Math.abs(oneDecimal - oneDecimalInt) <= 0.08) {
    return String(oneDecimalInt);
  }
  return formatNum(oneDecimal);
}

function previousAggressionSizeBb(events, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (!event) continue;
    if (event.type === 'bet' && Number.isFinite(event.amountBb)) {
      return event.amountBb;
    }
    if (event.type === 'raise') {
      if (Number.isFinite(event.toAmountBb)) return event.toAmountBb;
      if (Number.isFinite(event.amountBb)) return event.amountBb;
    }
  }
  return null;
}

function postflopRaiseByXToken(events, index, event) {
  if (!event || event.type !== 'raise') return '';
  const baseBb = previousAggressionSizeBb(events, index);
  const raiseToBb = Number.isFinite(event.toAmountBb) ? event.toAmountBb : event.amountBb;
  if (!Number.isFinite(baseBb) || baseBb <= 0 || !Number.isFinite(raiseToBb) || raiseToBb <= 0) {
    return '';
  }
  const multiplier = raiseToBb / baseBb;
  const formatted = formatRaiseMultiplier(multiplier);
  if (!formatted) return '';
  return `r${formatted}x`;
}

function lastPreflopAggressor(parsedHistory) {
  const preflop = parsedHistory?.events?.preflop || [];
  for (let i = preflop.length - 1; i >= 0; i -= 1) {
    const event = preflop[i];
    if (event.type === 'raise' || event.type === 'bet') {
      return event.player;
    }
  }
  return '';
}

function isCheckBehindEvent(events, index) {
  const event = events[index];
  if (!event || event.type !== 'check') return false;
  const hasAggression = events.some((item) => item.type === 'bet' || item.type === 'raise');
  if (hasAggression) return false;
  for (let i = index + 1; i < events.length; i += 1) {
    if (['check', 'call', 'bet', 'raise', 'fold'].includes(events[i].type)) {
      return false;
    }
  }
  return true;
}

function formatPlayerPrefix(player, parsedHistory) {
  const pos = String(parsedHistory?.positionsByPlayer?.[player] || '').toUpperCase();
  const playerId = String(player || '').trim();
  if (!pos) return playerId;
  if (!playerId) return pos;
  return `${pos}_${playerId}`;
}

function playerStreetHandToken(parsedHistory, player, street) {
  const cards = compactCards(parsedHistory?.showdown?.showCardsByPlayer?.[player]);
  if (!cards) return '';
  const cls = parsedHistory?.showdown?.streetClassByPlayer?.[player]?.[street] || '';
  const drawTokens = parsedHistory?.showdown?.streetDrawByPlayer?.[player]?.[street] || [];
  const classDetails = parsedHistory?.showdown?.streetClassByPlayer?.[player]?._details?.[street] || null;
  const boardCards = streetBoardCards(parsedHistory, street);
  const fragileTokens = deriveFragileStrongTokens(cls, boardCards, classDetails);
  const suffix = [cls, ...drawTokens, ...fragileTokens].filter(Boolean).join('_');
  return suffix ? `${cards}_${suffix}` : cards;
}

function buildOpponentFragmentsForStreet(parsedHistory, street) {
  const events = parsedHistory?.events?.[street] || [];
  const target = parsedHistory?.targetPlayer;
  if (!target || !events.length) return [];

  const positions = parsedHistory?.positionsByPlayer || {};
  let relevant = events;

  if (street === 'preflop') {
    let lastAggIndex = -1;
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      if (event.type === 'raise' || event.type === 'bet') {
        lastAggIndex = i;
      }
    }
    if (lastAggIndex >= 0) {
      const aggressor = events[lastAggIndex];
      relevant = aggressor?.player === target
        ? events.slice(lastAggIndex + 1)
        : events.slice(lastAggIndex);
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

    const withClass = playerStreetHandToken(parsedHistory, event.player, street);
    if (withClass) token = `${token} ${withClass}`;
    if (event.allIn) token = `${token} allin`;

    out.push(token.trim());
  }
  return out;
}

function buildPreflopSequenceNote(parsedHistory) {
  const events = (parsedHistory?.events?.preflop || [])
    .filter((event) => ['check', 'call', 'bet', 'raise'].includes(event.type));
  if (!events.length) return '';

  let startIndex = events.findIndex((event) => event.type === 'raise' || event.type === 'bet');
  if (startIndex < 0) {
    startIndex = 0;
  }
  const relevant = events.slice(startIndex);

  const target = parsedHistory?.targetPlayer;
  const targetHasStraddle = (parsedHistory?.events?.preflop || [])
    .some((event) => event.player === target && event.type === 'straddle');
  let targetStraddleUsed = false;

  const parts = [];
  for (const event of relevant) {
    const action = eventActionToken(event, 'preflop', false);
    if (!action) continue;

    const prefix = formatPlayerPrefix(event.player, parsedHistory);
    if (!prefix) continue;

    const tokenParts = [];
    if (
      event.player === target
      && targetHasStraddle
      && !targetStraddleUsed
    ) {
      if (Number.isFinite(parsedHistory?.gameCardCount)) {
        tokenParts.push(`${parsedHistory.gameCardCount}c`);
      }
      tokenParts.push('straddle');
      targetStraddleUsed = true;
    }

    tokenParts.push(`${prefix} ${action}`);

    const handToken = playerStreetHandToken(parsedHistory, event.player, 'preflop');
    if (handToken) tokenParts.push(handToken);
    if (event.allIn) tokenParts.push('allin');

    parts.push(tokenParts.join(' ').trim());
  }

  return parts.join(' / ').trim();
}

function buildTargetStreetPrefix(parsedHistory, street) {
  const target = parsedHistory?.targetPlayer || '';
  const targetPos = formatPlayerPrefix(target, parsedHistory);
  const targetCardsCompact = playerStreetHandToken(parsedHistory, target, street);
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
      parts.push(targetCardsCompact);
    }
  if (actionEvent.allIn) {
    parts.push('allin');
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

function streetTagLetter(street) {
  if (street === 'river') return 'r';
  if (street === 'turn') return 't';
  return 'f';
}

function streetOrderIndex(street) {
  const order = ['flop', 'turn', 'river'];
  return order.indexOf(street);
}

function inferTargetLineLightFoldTag(parsedHistory) {
  const target = parsedHistory?.targetPlayer || '';
  if (!target) return { tag: '', foldStreet: '', foldStreetIndex: -1 };
  const shownCards = parsedHistory?.showdown?.showCardsByPlayer?.[target] || [];
  if (Array.isArray(shownCards) && shownCards.length) {
    return { tag: '', foldStreet: '', foldStreetIndex: -1 };
  }

  const order = ['flop', 'turn', 'river'];
  for (const street of order) {
    const events = (parsedHistory?.events?.[street] || [])
      .filter((event) => event?.player === target && ['check', 'fold', 'call', 'bet', 'raise'].includes(event.type));
    if (events.some((event) => event.type === 'fold')) {
      return {
        tag: `L${streetTagLetter(street)}`,
        foldStreet: street,
        foldStreetIndex: streetOrderIndex(street)
      };
    }
  }

  return { tag: '', foldStreet: '', foldStreetIndex: -1 };
}

function hasPriorAggressionByPlayer(parsedHistory, player, street, indexInStreet) {
  const currentStreetEvents = parsedHistory?.events?.[street] || [];
  for (let i = 0; i < indexInStreet; i += 1) {
    const event = currentStreetEvents[i];
    if (event?.player === player && (event.type === 'bet' || event.type === 'raise')) {
      return true;
    }
  }

  const order = ['flop', 'turn', 'river'];
  const streetIndex = order.indexOf(street);
  const priorStreets = streetIndex > 0 ? order.slice(0, streetIndex) : [];
  for (const priorStreet of priorStreets) {
    const hasAggression = (parsedHistory?.events?.[priorStreet] || [])
      .some((event) => event?.player === player && (event.type === 'bet' || event.type === 'raise'));
    if (hasAggression) return true;
  }
  return false;
}

function inferPostflopInferenceTag(parsedHistory, street, events, index, event, hasShowdownHandToken) {
  if (!event || hasShowdownHandToken) return '';
  const letter = streetTagLetter(street);

  if (event.type === 'fold' && hasPriorAggressionByPlayer(parsedHistory, event.player, street, index)) {
    return `L${letter}`;
  }

  if (event.type === 'bet' || event.type === 'raise') {
    const later = (events || [])
      .slice(index + 1)
      .filter((item) => item && item.player !== event.player && ['check', 'fold', 'call', 'bet', 'raise'].includes(item.type));
    if (later.length && later.some((item) => item.type === 'fold') && later.every((item) => item.type === 'fold')) {
      return `S${letter}`;
    }
  }

  return '';
}

function buildPostflopSequenceNote(parsedHistory, street) {
  const events = (parsedHistory?.events?.[street] || [])
    .filter((event) => ['check', 'fold', 'call', 'bet', 'raise'].includes(event.type));
  if (!events.length) return '';

  const aggressor = lastPreflopAggressor(parsedHistory);
  const target = parsedHistory?.targetPlayer || '';
  const targetLineLightFold = inferTargetLineLightFoldTag(parsedHistory);
  const currentStreetIndex = streetOrderIndex(street);
  let boardAddedWithoutTarget = false;
  const parts = [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const isCheckBehind = isCheckBehindEvent(events, index);
    let action = eventActionToken(event, street, isCheckBehind);
    if (street !== 'preflop' && event.type === 'raise') {
      const raiseByX = postflopRaiseByXToken(events, index, event);
      if (raiseByX) action = raiseByX;
    }
    if (
      street === 'flop'
      && event.type === 'bet'
      && event.player === aggressor
      && /^b\d/.test(action)
    ) {
      action = action.replace(/^b/, 'cb');
    }

    const prefix = formatPlayerPrefix(event.player, parsedHistory);
    if (!prefix || !action) continue;

    const tokenParts = [`${prefix} ${action}`];
    const handToken = playerStreetHandToken(parsedHistory, event.player, street);
    if (handToken) {
      tokenParts.push(handToken);
    }
    const shouldPropagateTargetLx = Boolean(targetLineLightFold.tag)
      && event.player === target
      && !handToken
      && currentStreetIndex >= 0
      && targetLineLightFold.foldStreetIndex >= 0
      && currentStreetIndex <= targetLineLightFold.foldStreetIndex;
    if (shouldPropagateTargetLx) {
      tokenParts.push(targetLineLightFold.tag);
    }
    const inferredTag = inferPostflopInferenceTag(parsedHistory, street, events, index, event, Boolean(handToken));
    if (inferredTag && !tokenParts.includes(inferredTag)) {
      tokenParts.push(inferredTag);
    }
    if (target && event.player === target) {
      const board = boardToken(parsedHistory, street);
      if (board) tokenParts.push(board);
      const targetClass = parsedHistory?.showdown?.targetStreetClass?.[street] || '';
      const interpretation = deriveTargetInterpretation(parsedHistory, street, event, targetClass);
      if (interpretation) tokenParts.push(interpretation);
    } else if (!target && !boardAddedWithoutTarget) {
      const board = boardToken(parsedHistory, street);
      if (board) {
        tokenParts.push(board);
        boardAddedWithoutTarget = true;
      }
    }
    if (event.allIn) tokenParts.push('allin');
    parts.push(tokenParts.join(' ').trim());
  }

  const body = parts.join(' / ').trim();
  if (!body) return '';
  const pot = streetPotToken(parsedHistory, street);
  return pot ? `${pot} ${body}`.trim() : body;
}

function buildDeterministicStreetNote(parsedHistory, street) {
  if (street !== 'preflop') {
    return buildPostflopSequenceNote(parsedHistory, street);
  }
  return buildPreflopSequenceNote(parsedHistory);
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
    const hasStreetEvents = Array.isArray(parsedHistory?.events?.[street]);
    if (hasStreetEvents) {
      if (deterministic) {
        out[street] = sanitizeArtifacts(deterministic);
      } else {
        const keepVoluntaryShowToken = (
          street === 'river'
          && !showdown.mandatory
          && /\bshow(?:ed)?\b/i.test(out[street])
        );
        out[street] = keepVoluntaryShowToken
          ? sanitizeArtifacts(out[street])
          : '';
      }
    } else if (deterministic) {
      out[street] = sanitizeArtifacts(deterministic);
    }
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
