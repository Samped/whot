import { isLegal, SHAPE_NAME, type WhotCard } from "@/lib/whot";

export type PickCard = {
  index: number;
  shape: string;
  rank: number;
  legal: boolean;
};

export type PickView = {
  top: { shape: string; rank: number } | null;
  calledShape: string;
  pendingKind: number;
  pendingPick: number;
  marketLeft: number;
  myCount: number;
  oppCount: number;
  hand: PickCard[];
};

export type HouseMove =
  | { type: "play"; index: number; nextShape: number }
  | { type: "market" };

export function viewFromHand(
  hand: WhotCard[],
  top: WhotCard | null,
  calledShape: number,
  pendingKind: number,
  pendingPick: number,
  marketLeft: number,
  oppCount: number,
): PickView {
  return {
    top: top ? { shape: SHAPE_NAME[top.shape] || "any", rank: top.rank } : null,
    calledShape: SHAPE_NAME[calledShape] || "any",
    pendingKind,
    pendingPick,
    marketLeft,
    myCount: hand.length,
    oppCount,
    hand: hand.map((card, index) => ({
      index,
      shape: SHAPE_NAME[card.shape] || "whot",
      rank: card.rank,
      legal: isLegal(card, top, calledShape, pendingKind),
    })),
  };
}

function shapeNum(name: string) {
  const i = SHAPE_NAME.indexOf(name as (typeof SHAPE_NAME)[number]);
  return i > 0 ? i : 1;
}

export function heuristicMove(view: PickView): HouseMove {
  const legal = view.hand.filter((c) => c.legal);
  if (legal.length === 0) return { type: "market" };

  const counts = [0, 0, 0, 0, 0, 0];
  for (const c of view.hand) {
    if (c.rank !== 20) counts[shapeNum(c.shape)] += 1;
  }
  const bestShape = (() => {
    let s = 1;
    for (let i = 2; i <= 5; i++) if (counts[i]! > counts[s]!) s = i;
    return s;
  })();

  const score = (c: PickCard) => {
    if (view.myCount === 1) return 10_000;
    if (view.pendingKind) return 900;
    if (c.rank === 1 || c.rank === 8) return view.oppCount <= 2 ? 800 : 120;
    if (c.rank === 2 || c.rank === 5) return view.oppCount <= 3 ? 700 : 200;
    if (c.rank === 14) return view.oppCount <= 2 ? 650 : 180;
    if (c.rank === 20) return view.myCount <= 2 ? 500 : 40;
    return 80 + c.rank;
  };

  legal.sort((a, b) => score(b) - score(a));
  const pick = legal[0]!;
  return {
    type: "play",
    index: pick.index,
    nextShape: pick.rank === 20 ? bestShape : 0,
  };
}
