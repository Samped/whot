"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { whotAbi } from "@/abi/whot";
import { WHOT_ADDRESS } from "@/lib/addresses";
import { useGameAccount } from "@/hooks/useGameAccount";
import { publicRpc } from "@/lib/game-account";
import {
  forgetTable,
  loadRecentTables,
  saveRecentTables,
  type RecentTable,
} from "@/lib/recent-tables";
import { parseTable } from "@/lib/table-view";

export type RecentTableRow = RecentTable & {
  phase: number;
  alive: boolean;
  status: string;
};

const FINISHED_GRACE = 2 * 60 * 60 * 1000;

function statusFor(row: RecentTable, phase: number) {
  if (phase === 1) return row.solo ? "Waiting to deal" : "Waiting for friend";
  if (phase === 2) return "Dealing…";
  if (phase === 3) return row.solo ? "Live vs computer" : "Live vs friend";
  if (phase === 4) return "Finished";
  return "Unknown";
}

export function useRecentTables() {
  const { address } = useGameAccount();
  const [rows, setRows] = useState<RecentTableRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address || !WHOT_ADDRESS) {
      setRows([]);
      return;
    }

    const stored = loadRecentTables(address);
    if (!stored.length) {
      setRows([]);
      return;
    }

    setLoading(true);
    const rpc = publicRpc();
    const now = Date.now();
    const nextStored: RecentTable[] = [];
    const nextRows: RecentTableRow[] = [];

    for (const row of stored) {
      try {
        const raw = await rpc.readContract({
          address: WHOT_ADDRESS,
          abi: whotAbi,
          functionName: "table",
          args: [BigInt(row.id)],
        });
        const view = parseTable(raw);
        const phase = view?.phase_ ?? 0;
        if (!view || phase === 0) continue;

        const seen = now;
        const saved = { ...row, seen };
        nextStored.push(saved);

        if (phase === 4 && now - row.seen > FINISHED_GRACE) continue;

        nextRows.push({
          ...saved,
          phase,
          alive: phase >= 1 && phase <= 3,
          status: statusFor(row, phase),
        });
      } catch {
        /* table gone */
      }
    }

    saveRecentTables(address, nextStored);
    setRows(nextRows);
    setLoading(false);
  }, [address]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const dismiss = useCallback(
    (id: number) => {
      if (!address) return;
      forgetTable(address, id);
      setRows((prev) => prev.filter((row) => row.id !== id));
    },
    [address],
  );

  return { rows, loading, refresh, dismiss, address };
}
