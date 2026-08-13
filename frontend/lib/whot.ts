/** Same catalog as WhotCards.sol — keep them in lockstep. */

export const CIRCLE = 1;
export const TRIANGLE = 2;
export const CROSS = 3;
export const SQUARE = 4;
export const STAR = 5;
export const WHOT = 6;
export const PACK = 54;

export type WhotCard = { id: number; shape: number; rank: number };

export const SHAPE_NAME = ["", "circle", "triangle", "cross", "square", "star", "whot"] as const;
export const SHAPE_MARK = ["", "●", "▲", "✚", "■", "★", "W"] as const;

export function pack(shape: number, rank: number): number {
  return (shape << 8) | rank;
}

export function shapeOf(card: number): number {
  return card >> 8;
}

export function rankOf(card: number): number {
  return card & 0xff;
}

export function cardAt(index: number): number {
  if (index < 0 || index >= PACK) throw new Error("card");
  if (index < 12) return pack(CIRCLE, [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14][index]!);
  if (index < 24)
    return pack(TRIANGLE, [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14][index - 12]!);
  if (index < 33) return pack(CROSS, [1, 2, 3, 5, 7, 10, 11, 13, 14][index - 24]!);
  if (index < 42) return pack(SQUARE, [1, 2, 3, 5, 7, 10, 11, 13, 14][index - 33]!);
  if (index < 49) return pack(STAR, [1, 2, 3, 4, 5, 7, 8][index - 42]!);
  return pack(WHOT, 20);
}

export function decodeCard(id: number): WhotCard {
  return { id, shape: shapeOf(id), rank: rankOf(id) };
}

export function decodeIndex(index: bigint | number): WhotCard {
  return decodeCard(cardAt(Number(index)));
}

export function isWhot(card: WhotCard | number): boolean {
  return typeof card === "number" ? rankOf(card) === 20 : card.rank === 20;
}

export function specialCall(rank: number): string {
  if (rank === 1) return "Hold on!";
  if (rank === 2) return "Pick two!";
  if (rank === 5) return "Pick three!";
  if (rank === 8) return "Suspension!";
  if (rank === 14) return "General market!";
  if (rank === 20) return "WHOT!";
  return "";
}

/** Resolve pick-two / pick-three even if UI state is briefly behind the chain. */
export function resolvePickChallenge(input: {
  pendingKind?: number;
  pendingPick?: number;
  top?: WhotCard | null;
  lastCall?: string;
  lastPlayed?: { who?: string; card?: WhotCard | null; call?: string } | null;
}): { kind: number; pick: number } {
  const kind = Number(input.pendingKind || 0);
  const pick = Number(input.pendingPick || 0);

  // Prefer on-chain pending pick. Never invent one from a stale "Pick two!" call —
  // that sticks after you dump a 2 (opponent faces it) or after someone already paid.
  if (pick > 0) {
    if (kind === 2 || kind === 5) return { kind, pick };
    if (input.top?.rank === 2 || input.top?.rank === 5) {
      return { kind: input.top.rank, pick };
    }
    return { kind: kind === 2 || kind === 5 ? kind : 0, pick };
  }

  // Optimistic only: opponent just dumped a pick card and the table poll is one tick behind.
  // Skip once the last call shows the pick was already paid (market / picked N).
  const call = input.lastCall || input.lastPlayed?.call || "";
  if (/market|picked \d+/i.test(call)) return { kind: 0, pick: 0 };

  const played = input.lastPlayed?.who === "opp" ? input.lastPlayed.card : null;
  if (
    played &&
    (played.rank === 2 || played.rank === 5) &&
    input.top?.id === played.id
  ) {
    return { kind: played.rank, pick: played.rank === 2 ? 2 : 3 };
  }

  return { kind: 0, pick: 0 };
}

export function isLegal(
  card: WhotCard,
  top: WhotCard | null,
  calledShape: number,
  pendingKind: number,
): boolean {
  // Answering pick-two / pick-three: any matching rank stacks (any shape).
  if (pendingKind === 2) return card.rank === 2;
  if (pendingKind === 5) return card.rank === 5;
  if (card.rank === 20) return true;
  if (!top) return true;
  const need = calledShape || top.shape;
  return card.shape === need || card.rank === top.rank;
}
