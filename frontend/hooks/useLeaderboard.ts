"use client";

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { whotAbi } from "@/abi/whot";
import { WHOT_ADDRESS } from "@/lib/addresses";
import { useGameAccount } from "@/hooks/useGameAccount";

export type LadderRow = {
  address: Address;
  wins: number;
  losses: number;
  played: number;
  rate: number;
};

export function useLeaderboard() {
  const { address } = useGameAccount();
  const enabled = Boolean(WHOT_ADDRESS);

  const lengthQuery = useReadContract({
    address: WHOT_ADDRESS,
    abi: whotAbi,
    functionName: "ladderLength",
    query: { enabled, refetchInterval: 12_000 },
  });

  const ladderLen = Number(lengthQuery.data ?? 0n);
  const limit = ladderLen > 0 ? BigInt(Math.min(ladderLen, 500)) : 80n;

  const ladderQuery = useReadContract({
    address: WHOT_ADDRESS,
    abi: whotAbi,
    functionName: "getLadder",
    args: [0n, limit],
    query: { enabled, refetchInterval: 12_000 },
  });

  const mineQuery = useReadContract({
    address: WHOT_ADDRESS,
    abi: whotAbi,
    functionName: "stats",
    args: address ? [address] : undefined,
    query: { enabled: enabled && Boolean(address), refetchInterval: 12_000 },
  });

  const rows = useMemo<LadderRow[]>(() => {
    const raw = ladderQuery.data as
      | readonly [readonly Address[], readonly number[], readonly number[], readonly number[]]
      | undefined;
    if (!raw) return [];
    const [players, wins, losses, played] = raw;
    const list: LadderRow[] = players.map((p, i) => {
      const w = Number(wins[i] ?? 0);
      const l = Number(losses[i] ?? 0);
      const n = Number(played[i] ?? 0);
      return { address: p, wins: w, losses: l, played: n, rate: n ? w / n : 0 };
    });
    list.sort((a, b) => b.wins - a.wins || b.rate - a.rate || b.played - a.played);
    return list;
  }, [ladderQuery.data]);

  const mine = useMemo(() => {
    const raw = mineQuery.data as readonly [number, number, number] | undefined;
    if (!raw) return { wins: 0, losses: 0, played: 0 };
    return { wins: Number(raw[0]), losses: Number(raw[1]), played: Number(raw[2]) };
  }, [mineQuery.data]);

  const rank = address
    ? rows.findIndex((r) => r.address.toLowerCase() === address.toLowerCase()) + 1
    : 0;

  return { rows, mine, rank, address, configured: enabled, total: ladderLen || rows.length };
}
