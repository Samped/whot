import type { Address } from "viem";

const KEY = "whot.recentTables.v1";
const MAX = 6;
const TTL = 24 * 60 * 60 * 1000;

export type RecentTable = {
  id: number;
  solo: boolean;
  seat: number;
  opened: number;
  seen: number;
};

function storageKey(owner?: Address | string) {
  return `${KEY}.${(owner || "anon").toLowerCase()}`;
}

export function rememberTable(
  owner: Address | string | undefined,
  entry: Pick<RecentTable, "id" | "solo" | "seat"> & { opened?: number },
) {
  if (typeof window === "undefined" || !owner || entry.id <= 0) return;

  const now = Date.now();
  const next: RecentTable = {
    id: entry.id,
    solo: entry.solo,
    seat: entry.seat,
    opened: entry.opened ?? now,
    seen: now,
  };

  const list = loadRecentTables(owner).filter((row) => row.id !== next.id);
  list.unshift(next);
  window.localStorage.setItem(storageKey(owner), JSON.stringify(list.slice(0, MAX)));
}

export function loadRecentTables(owner?: Address | string): RecentTable[] {
  if (typeof window === "undefined" || !owner) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(owner));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentTable[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (row) =>
        row &&
        Number.isFinite(row.id) &&
        row.id > 0 &&
        Number.isFinite(row.seen) &&
        now - row.seen < TTL,
    );
  } catch {
    return [];
  }
}

export function forgetTable(owner: Address | string | undefined, id: number) {
  if (typeof window === "undefined" || !owner || id <= 0) return;
  const list = loadRecentTables(owner).filter((row) => row.id !== id);
  window.localStorage.setItem(storageKey(owner), JSON.stringify(list));
}

export function saveRecentTables(owner: Address | string | undefined, rows: RecentTable[]) {
  if (typeof window === "undefined" || !owner) return;
  window.localStorage.setItem(storageKey(owner), JSON.stringify(rows.slice(0, MAX)));
}
