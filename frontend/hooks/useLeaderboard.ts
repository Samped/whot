"use client";

import { useEffect, useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { whotAbi } from "@/abi/whot";
import { socialAbi } from "@/abi/social";
import { WHOT_ADDRESS } from "@/lib/addresses";
import { useGameAccount } from "@/hooks/useGameAccount";
import { publicRpc, readEmailIdentity } from "@/lib/game-account";
import { discoverProfileForEmail } from "@/lib/email-profile";
import { parseProfile, SOCIAL_ADDRESS, type PlayerProfile } from "@/lib/social";

export type LadderRow = {
  address: Address;
  wins: number;
  losses: number;
  played: number;
  rate: number;
  /** Stable identity for email seats (email) or the address itself. */
  identity: string;
  email?: string;
  nickname?: string;
};

function identityKey(profile: PlayerProfile | undefined, address: Address) {
  const email = profile?.email?.trim().toLowerCase();
  if (email) return `mail:${email}`;
  return address.toLowerCase();
}

export function useLeaderboard() {
  const { address, account, mode } = useGameAccount();
  const enabled = Boolean(WHOT_ADDRESS);
  const myEmail = (account?.email || "").trim().toLowerCase();
  const identity = readEmailIdentity(myEmail);
  const linked = useMemo(() => {
    const set = new Set<string>();
    if (address) set.add(address.toLowerCase());
    if (identity?.tableAddress) set.add(identity.tableAddress.toLowerCase());
    for (const a of identity?.linkedAddresses || []) set.add(a.toLowerCase());
    return set;
  }, [address, identity?.tableAddress, identity?.linkedAddresses]);

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

  const rawRows = useMemo<Omit<LadderRow, "identity" | "email" | "nickname">[]>(() => {
    const raw = ladderQuery.data as
      | readonly [readonly Address[], readonly number[], readonly number[], readonly number[]]
      | undefined;
    if (!raw) return [];
    const [players, wins, losses, played] = raw;
    return players.map((p, i) => {
      const w = Number(wins[i] ?? 0);
      const l = Number(losses[i] ?? 0);
      const n = Number(played[i] ?? 0);
      return { address: p, wins: w, losses: l, played: n, rate: n ? w / n : 0 };
    });
  }, [ladderQuery.data]);

  const [profiles, setProfiles] = useState<Record<string, PlayerProfile>>({});
  const [emailNick, setEmailNick] = useState<string>("");

  useEffect(() => {
    if (!SOCIAL_ADDRESS) return;
    const addrs = new Set<string>();
    for (const r of rawRows) addrs.add(r.address.toLowerCase());
    for (const a of linked) addrs.add(a);
    if (addrs.size === 0) return;
    let stop = false;
    void (async () => {
      try {
        const list = [...addrs] as Address[];
        const rows = (await publicRpc().readContract({
          address: SOCIAL_ADDRESS,
          abi: socialAbi,
          functionName: "profilesOf",
          args: [list],
        })) as unknown[];
        if (stop) return;
        const next: Record<string, PlayerProfile> = {};
        list.forEach((addr, i) => {
          next[addr.toLowerCase()] = parseProfile(rows[i]);
        });
        setProfiles(next);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      stop = true;
    };
  }, [rawRows, linked]);

  useEffect(() => {
    if (mode !== "email" || !myEmail) {
      setEmailNick("");
      return;
    }
    let stop = false;
    void discoverProfileForEmail(myEmail).then((p) => {
      if (!stop && p?.nickname) setEmailNick(p.nickname);
    });
    return () => {
      stop = true;
    };
  }, [mode, myEmail, rawRows.length]);

  const rows = useMemo<LadderRow[]>(() => {
    const groups = new Map<
      string,
      {
        address: Address;
        wins: number;
        losses: number;
        played: number;
        email?: string;
        nickname?: string;
        bestWins: number;
      }
    >();

    const nicknameForEmail = (mail: string) => {
      const want = mail.trim().toLowerCase();
      if (!want) return undefined;
      if (want === myEmail && emailNick) return emailNick;
      for (const [addr, p] of Object.entries(profiles)) {
        if (!p.set || !p.nickname) continue;
        if ((p.email || "").trim().toLowerCase() === want) return p.nickname;
        if (linked.has(addr) && want === myEmail) return p.nickname;
      }
      const cached = want === myEmail ? readEmailIdentity(want) : null;
      return cached?.nickname;
    };

    for (const row of rawRows) {
      const profile = profiles[row.address.toLowerCase()];
      let key = identityKey(profile, row.address);
      if (
        mode === "email" &&
        myEmail &&
        (linked.has(row.address.toLowerCase()) ||
          (address && row.address.toLowerCase() === address.toLowerCase()) ||
          profile?.email?.trim().toLowerCase() === myEmail)
      ) {
        key = `mail:${myEmail}`;
      }
      if (mode === "email" && myEmail && profile?.email?.trim().toLowerCase() === myEmail) {
        key = `mail:${myEmail}`;
      }

      const prev = groups.get(key);
      if (!prev) {
        const mail = key.startsWith("mail:") ? key.slice(5) : profile?.email;
        groups.set(key, {
          address: row.address,
          wins: row.wins,
          losses: row.losses,
          played: row.played,
          email: mail || undefined,
          nickname:
            (profile?.set && profile.nickname) ||
            (mail ? nicknameForEmail(mail) : undefined) ||
            undefined,
          bestWins: row.wins,
        });
        continue;
      }
      prev.wins += row.wins;
      prev.losses += row.losses;
      prev.played += row.played;
      if (row.wins > prev.bestWins) {
        prev.address = row.address;
        prev.bestWins = row.wins;
      }
      if (!prev.nickname && profile?.set && profile.nickname) prev.nickname = profile.nickname;
      if (!prev.nickname && prev.email) prev.nickname = nicknameForEmail(prev.email);
      if (!prev.email && profile?.email) prev.email = profile.email;
    }

    if (mode === "email" && myEmail) {
      const key = `mail:${myEmail}`;
      const g = groups.get(key);
      if (g && !g.nickname) g.nickname = nicknameForEmail(myEmail) || emailNick || undefined;
    }

    const list: LadderRow[] = [...groups.entries()].map(([id, g]) => ({
      address: g.address,
      wins: g.wins,
      losses: g.losses,
      played: g.played,
      rate: g.played ? g.wins / g.played : 0,
      identity: id,
      email: g.email,
      nickname: g.nickname,
    }));
    list.sort((a, b) => b.wins - a.wins || b.rate - a.rate || b.played - a.played);
    return list;
  }, [rawRows, profiles, mode, myEmail, linked, emailNick, address]);

  const mine = useMemo(() => {
    if (mode === "email" && myEmail) {
      const row = rows.find((r) => r.identity === `mail:${myEmail}`);
      if (row) return { wins: row.wins, losses: row.losses, played: row.played };
      // Fallback: sum linked seats even if not all are on the ladder page yet.
      let wins = 0;
      let losses = 0;
      let played = 0;
      for (const row of rawRows) {
        if (!linked.has(row.address.toLowerCase())) continue;
        wins += row.wins;
        losses += row.losses;
        played += row.played;
      }
      if (played > 0) return { wins, losses, played };
    }
    const row = address
      ? rows.find((r) => r.address.toLowerCase() === address.toLowerCase())
      : undefined;
    if (row) return { wins: row.wins, losses: row.losses, played: row.played };
    return { wins: 0, losses: 0, played: 0 };
  }, [mode, myEmail, rows, rawRows, linked, address]);

  const rank = useMemo(() => {
    if (mode === "email" && myEmail) {
      const i = rows.findIndex((r) => r.identity === `mail:${myEmail}`);
      return i >= 0 ? i + 1 : 0;
    }
    if (!address) return 0;
    const i = rows.findIndex((r) => r.address.toLowerCase() === address.toLowerCase());
    return i >= 0 ? i + 1 : 0;
  }, [mode, myEmail, rows, address]);

  return { rows, mine, rank, address, configured: enabled, total: ladderLen || rows.length };
}
