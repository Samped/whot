import {
  PACK,
  decodeIndex,
  isLegal,
  specialCall,
  type WhotCard,
} from "@/lib/whot";

export type LiveCard = WhotCard & { idx: number };

export type EngineState = {
  market: number[];
  hands: [LiveCard[], LiveCard[]];
  top: LiveCard | null;
  calledShape: number;
  pendingPick: number;
  pendingKind: number;
  turn: 0 | 1;
  winner: 0 | 1 | null;
  lastCall: string;
};

const PRACTICE_KEY = "whot-practice";

export function loadPractice(): { wins: number; losses: number } {
  if (typeof window === "undefined") return { wins: 0, losses: 0 };
  try {
    const raw = localStorage.getItem(PRACTICE_KEY);
    if (!raw) return { wins: 0, losses: 0 };
    const p = JSON.parse(raw) as { wins?: number; losses?: number };
    return { wins: p.wins ?? 0, losses: p.losses ?? 0 };
  } catch {
    return { wins: 0, losses: 0 };
  }
}

export function savePractice(wins: number, losses: number) {
  localStorage.setItem(PRACTICE_KEY, JSON.stringify({ wins, losses }));
}

function shuffle(): number[] {
  const a = Array.from({ length: PACK }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function draw(market: number[]): { card: LiveCard; market: number[] } | null {
  if (market.length === 0) return null;
  const next = market.slice();
  const idx = next.pop()!;
  return { card: { ...decodeIndex(idx), idx }, market: next };
}

function dealN(market: number[], n: number): { cards: LiveCard[]; market: number[] } {
  const cards: LiveCard[] = [];
  let m = market;
  for (let i = 0; i < n; i++) {
    const hit = draw(m);
    if (!hit) break;
    cards.push(hit.card);
    m = hit.market;
  }
  return { cards, market: m };
}

export function newGame(): EngineState {
  let market = shuffle();
  const p0 = dealN(market, 5);
  market = p0.market;
  const p1 = dealN(market, 5);
  market = p1.market;
  const open = draw(market);
  market = open?.market ?? market;
  const top = open?.card ?? null;
  return {
    market,
    hands: [p0.cards, p1.cards],
    top,
    calledShape: top && top.rank === 20 ? 1 : 0,
    pendingPick: 0,
    pendingKind: 0,
    turn: 0,
    winner: null,
    lastCall: "",
  };
}

function clone(s: EngineState): EngineState {
  return {
    ...s,
    market: s.market.slice(),
    hands: [s.hands[0].slice(), s.hands[1].slice()],
    top: s.top,
  };
}

function applySpecials(s: EngineState, seat: 0 | 1, card: LiveCard) {
  const foe = (1 - seat) as 0 | 1;
  const rank = card.rank;
  if (rank === 2) {
    s.pendingPick += 2;
    s.pendingKind = 2;
    s.turn = foe;
    s.lastCall = "Pick two!";
    return;
  }
  if (rank === 5) {
    s.pendingPick += 3;
    s.pendingKind = 5;
    s.turn = foe;
    s.lastCall = "Pick three!";
    return;
  }
  if (rank === 1) {
    s.pendingPick = 0;
    s.pendingKind = 0;
    s.lastCall = "Hold on!";
    return;
  }
  if (rank === 8) {
    s.pendingPick = 0;
    s.pendingKind = 0;
    s.lastCall = "Suspension!";
    return;
  }
  if (rank === 14) {
    s.pendingPick = 0;
    s.pendingKind = 0;
    const hit = dealN(s.market, 1);
    s.market = hit.market;
    s.hands[foe] = s.hands[foe].concat(hit.cards);
    s.lastCall = "General market!";
    return;
  }
  if (rank === 20) {
    s.pendingPick = 0;
    s.pendingKind = 0;
    s.turn = foe;
    s.lastCall = "WHOT!";
    return;
  }
  s.pendingPick = 0;
  s.pendingKind = 0;
  s.turn = foe;
  s.lastCall = specialCall(rank);
}

export function playCard(
  state: EngineState,
  seat: 0 | 1,
  index: number,
  nextShape: number,
): EngineState {
  const s = clone(state);
  if (s.winner !== null || s.turn !== seat) return state;
  const card = s.hands[seat][index];
  if (!card) return state;
  if (!isLegal(card, s.top, s.calledShape || s.top?.shape || 0, s.pendingKind)) return state;
  if (card.rank === 20) {
    if (nextShape < 1 || nextShape > 5) return state;
    s.calledShape = nextShape;
  } else {
    s.calledShape = 0;
  }
  s.hands[seat] = s.hands[seat].filter((_, i) => i !== index);
  s.top = card;
  applySpecials(s, seat, card);
  if (s.hands[seat].length === 0) {
    s.winner = seat;
    s.lastCall = "Check up!";
  }
  return s;
}

export function goMarket(state: EngineState, seat: 0 | 1): EngineState {
  const s = clone(state);
  if (s.winner !== null || s.turn !== seat) return state;
  const n = s.pendingPick === 0 ? 1 : s.pendingPick;
  const hit = dealN(s.market, n);
  s.market = hit.market;
  s.hands[seat] = s.hands[seat].concat(hit.cards);
  s.pendingPick = 0;
  s.pendingKind = 0;
  s.turn = (1 - seat) as 0 | 1;
  s.lastCall = n > 1 ? `Market ×${n}` : "Market";
  return s;
}

function neededShape(s: EngineState): number {
  return s.calledShape || s.top?.shape || 0;
}

export function aiChoose(
  state: EngineState,
): { type: "play"; index: number; nextShape: number } | { type: "market" } {
  const hand = state.hands[1];
  const need = neededShape(state);
  const legal = hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => isLegal(card, state.top, need, state.pendingKind));

  if (legal.length === 0) return { type: "market" };

  const score = (card: LiveCard) => {
    if (state.pendingKind) return 100;
    if (card.rank === 1 || card.rank === 8) return 90 + card.rank;
    if (card.rank === 14) return 80;
    if (card.rank === 2 || card.rank === 5) return 70 + card.rank;
    if (card.rank === 20) return 10;
    return 20 + card.rank;
  };

  legal.sort((a, b) => score(b.card) - score(a.card));
  const pick = legal[0]!;
  let nextShape = 0;
  if (pick.card.rank === 20) {
    const counts = [0, 0, 0, 0, 0, 0];
    for (const c of hand) {
      if (c.rank !== 20 && c.shape >= 1 && c.shape <= 5) counts[c.shape]! += 1;
    }
    nextShape = 1;
    for (let i = 2; i <= 5; i++) {
      if ((counts[i] ?? 0) > (counts[nextShape] ?? 0)) nextShape = i;
    }
  }
  return { type: "play", index: pick.index, nextShape };
}

export function applyAi(state: EngineState): EngineState {
  const move = aiChoose(state);
  if (move.type === "market") return goMarket(state, 1);
  return playCard(state, 1, move.index, move.nextShape);
}
