import type { Address } from "viem";

export const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as Address;

export type TableView = {
  phase_: number;
  p0: Address;
  p1: Address;
  turn_: number;
  toPlay: Address;
  top: number;
  shape: number;
  pick: number;
  pickKind: number;
  ready: boolean;
  winner_: Address;
  hand0: number;
  hand1: number;
  marketLeft: number;
  solo: boolean;
  botPending_: boolean;
};

export function isOpen(addr?: string) {
  return !addr || addr.toLowerCase() === ZERO_ADDR;
}

export function parseTable(raw: unknown): TableView | undefined {
  if (!raw) return undefined;
  const row = Array.isArray(raw) ? raw : (raw as Record<string, unknown>);
  const get = (i: number, key: string) => (Array.isArray(row) ? row[i] : row[key]);
  return {
    phase_: Number(get(0, "phase_")),
    p0: get(1, "p0") as Address,
    p1: get(2, "p1") as Address,
    turn_: Number(get(3, "turn_")),
    toPlay: get(4, "toPlay") as Address,
    top: Number(get(5, "top")),
    shape: Number(get(6, "shape")),
    pick: Number(get(7, "pick")),
    pickKind: Number(get(8, "pickKind")),
    ready: Boolean(get(9, "ready")),
    winner_: get(10, "winner_") as Address,
    hand0: Number(get(11, "hand0")),
    hand1: Number(get(12, "hand1")),
    marketLeft: Number(get(13, "marketLeft")),
    solo: Boolean(get(14, "solo")),
    botPending_: Boolean(get(15, "botPending_")),
  };
}

export function computerToPlay(table?: TableView | null) {
  return Boolean(
    table?.solo && table.phase_ === 3 && table.ready && table.turn_ === 1 && isOpen(table.winner_),
  );
}
