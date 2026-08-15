import type { Address } from "viem";
import { socialAbi } from "@/abi/social";
import { whotAbi } from "@/abi/whot";
import { WHOT_ADDRESS } from "@/lib/addresses";
import {
  findTableAccountsForEmail,
  listAllTableAccounts,
  publicRpc,
  readEmailIdentity,
  writeEmailIdentity,
} from "@/lib/game-account";
import { parseProfile, SOCIAL_ADDRESS, type PlayerProfile } from "@/lib/social";

/**
 * Find a nickname for this email from:
 * 1) local identity cache
 * 2) profiles on local table seats
 * 3) any ranked seat whose on-chain profile.email matches
 */
export async function discoverProfileForEmail(email: string): Promise<PlayerProfile | null> {
  const want = email.trim().toLowerCase();
  if (!want || !SOCIAL_ADDRESS) return null;

  const cached = readEmailIdentity(want);
  if (cached?.nickname) {
    return {
      nickname: cached.nickname,
      avatar: Number(cached.avatar || 0),
      email: want,
      set: true,
    };
  }

  const candidates = new Set<string>();
  if (cached?.tableAddress) candidates.add(cached.tableAddress.toLowerCase());
  for (const a of cached?.linkedAddresses || []) candidates.add(a.toLowerCase());
  for (const rec of findTableAccountsForEmail(want)) candidates.add(rec.address.toLowerCase());
  for (const rec of listAllTableAccounts()) {
    if ((rec.email || "").trim().toLowerCase() === want) candidates.add(rec.address.toLowerCase());
  }

  // Ladder scan — nickname may live on an old seat we no longer hold keys for.
  if (WHOT_ADDRESS) {
    try {
      const len = Number(
        (await publicRpc().readContract({
          address: WHOT_ADDRESS,
          abi: whotAbi,
          functionName: "ladderLength",
        })) as bigint,
      );
      if (len > 0) {
        const [players] = (await publicRpc().readContract({
          address: WHOT_ADDRESS,
          abi: whotAbi,
          functionName: "getLadder",
          args: [0n, BigInt(Math.min(len, 500))],
        })) as readonly [readonly Address[], ...unknown[]];
        for (const p of players) candidates.add(p.toLowerCase());
      }
    } catch {
      /* ignore ladder errors */
    }
  }

  const addrs = [...candidates] as Address[];
  if (addrs.length === 0) return null;

  // Batch in chunks — profilesOf can get large.
  const chunk = 80;
  let best: PlayerProfile | null = null;
  for (let i = 0; i < addrs.length; i += chunk) {
    const slice = addrs.slice(i, i + chunk);
    try {
      const rows = (await publicRpc().readContract({
        address: SOCIAL_ADDRESS,
        abi: socialAbi,
        functionName: "profilesOf",
        args: [slice],
      })) as unknown[];
      for (let j = 0; j < slice.length; j++) {
        const p = parseProfile(rows[j]);
        if (!p.set || !p.nickname) continue;
        const mail = (p.email || "").trim().toLowerCase();
        if (mail === want) return { ...p, email: want };
        // Keep a weak fallback only for seats we already linked locally.
        if (!mail && !best && cached?.linkedAddresses?.some((a) => a.toLowerCase() === slice[j]!.toLowerCase())) {
          best = { ...p, email: want };
        }
      }
    } catch {
      /* try next chunk */
    }
  }
  return best;
}

export function rememberDiscoveredProfile(email: string, tableAddress: Address, profile: PlayerProfile) {
  writeEmailIdentity(email, {
    tableAddress,
    nickname: profile.nickname,
    avatar: profile.avatar,
  });
}
