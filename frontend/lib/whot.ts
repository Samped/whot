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

export function isLegal(
  card: WhotCard,
  top: WhotCard | null,
  calledShape: number,
  pendingKind: number,
): boolean {
  if (pendingKind === 2) return card.rank === 2;
  if (pendingKind === 5) return card.rank === 5;
  if (card.rank === 20) return true;
  if (!top) return true;
  const need = calledShape || top.shape;
  return card.shape === need || card.rank === top.rank;
}
