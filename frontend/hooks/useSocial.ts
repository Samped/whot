"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { toast } from "sonner";
import { socialAbi } from "@/abi/social";
import { useGameAccount } from "@/hooks/useGameAccount";
import { publicRpc, findTableAccountsForEmail, readEmailIdentity, walletFor, writeEmailIdentity } from "@/lib/game-account";
import { activeChain } from "@/lib/network";
import {
  displayName,
  emptyProfile,
  parseProfile,
  SOCIAL_ADDRESS,
  type PlayerProfile,
} from "@/lib/social";
import { tableCode, tableHref } from "@/lib/table-code";

export type OpenInvite = {
  index: number;
  from: Address;
  tableId: number;
  createdAt: number;
  fromName?: string;
};

const SEEN_KEY = "whot.inviteSeen.v1";

function seenKey(owner?: string) {
  return `${SEEN_KEY}.${(owner || "anon").toLowerCase()}`;
}

function readSeen(owner?: string): number {
  if (typeof window === "undefined" || !owner) return 0;
  return Number(window.localStorage.getItem(seenKey(owner)) || 0);
}

function writeSeen(owner: string | undefined, at: number) {
  if (typeof window === "undefined" || !owner) return;
  window.localStorage.setItem(seenKey(owner), String(at));
}

export function useSocial() {
  const game = useGameAccount();
  const { address, signedIn, account } = game;
  const enabled = Boolean(SOCIAL_ADDRESS) && SOCIAL_ADDRESS !== "0x0000000000000000000000000000000000000000";

  const profileQuery = useReadContract({
    address: SOCIAL_ADDRESS,
    abi: socialAbi,
    functionName: "profileOf",
    args: address ? [address] : undefined,
    query: { enabled: enabled && Boolean(address), refetchInterval: 8_000 },
  });

  const invitesQuery = useReadContract({
    address: SOCIAL_ADDRESS,
    abi: socialAbi,
    functionName: "invitesOf",
    args: address ? [address] : undefined,
    query: { enabled: enabled && signedIn && Boolean(address), refetchInterval: 3_500 },
  });

  const onChainProfile = useMemo(
    () => (profileQuery.data ? parseProfile(profileQuery.data) : emptyProfile()),
    [profileQuery.data],
  );
  const [borrowedProfile, setBorrowedProfile] = useState<PlayerProfile | null>(null);
  const restoredProfile = useRef(false);

  useEffect(() => {
    restoredProfile.current = false;
    setBorrowedProfile(null);
  }, [address, account?.email]);

  const profile = useMemo(() => {
    if (onChainProfile.set && onChainProfile.nickname) return onChainProfile;
    if (borrowedProfile?.nickname) {
      return {
        ...onChainProfile,
        nickname: borrowedProfile.nickname,
        avatar: borrowedProfile.avatar || onChainProfile.avatar,
        email: borrowedProfile.email || account?.email || onChainProfile.email,
        set: true,
      };
    }
    const cached = account?.email ? readEmailIdentity(account.email) : null;
    if (cached?.nickname) {
      return {
        ...onChainProfile,
        nickname: cached.nickname,
        avatar: Number(cached.avatar || 0),
        email: account?.email || onChainProfile.email,
        set: true,
      };
    }
    return onChainProfile;
  }, [onChainProfile, borrowedProfile, account?.email]);

  const invites = useMemo<OpenInvite[]>(() => {
    const raw = invitesQuery.data as
      | readonly { from: Address; tableId: bigint | number; createdAt: bigint | number; open: boolean }[]
      | undefined;
    if (!raw) return [];
    return raw
      .map((row, index) => ({
        index,
        from: row.from,
        tableId: Number(row.tableId),
        createdAt: Number(row.createdAt),
        open: row.open,
      }))
      .filter((row) => row.open && row.tableId > 0)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [invitesQuery.data]);

  const [names, setNames] = useState<Record<string, string>>({});
  const toasted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || invites.length === 0) return;
    const missing = invites.map((i) => i.from).filter((a) => !names[a.toLowerCase()]);
    if (missing.length === 0) return;
    let stop = false;
    void (async () => {
      try {
        const rows = (await publicRpc().readContract({
          address: SOCIAL_ADDRESS,
          abi: socialAbi,
          functionName: "profilesOf",
          args: [missing],
        })) as unknown[];
        if (stop) return;
        const next = { ...names };
        missing.forEach((addr, i) => {
          next[addr.toLowerCase()] = displayName(parseProfile(rows[i]), addr);
        });
        setNames(next);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      stop = true;
    };
  }, [enabled, invites, names]);

  const openInvites = useMemo(
    () =>
      invites.map((row) => ({
        ...row,
        fromName: names[row.from.toLowerCase()] || displayName(undefined, row.from),
      })),
    [invites, names],
  );

  useEffect(() => {
    if (!signedIn || !address || openInvites.length === 0) return;
    const seen = readSeen(address);
    for (const invite of openInvites) {
      const key = `${invite.from}-${invite.tableId}-${invite.index}`;
      if (invite.createdAt <= seen) continue;
      if (toasted.current.has(key)) continue;
      toasted.current.add(key);
      toast.message(`${invite.fromName} invited you`, {
        description: `Table ${tableCode(invite.tableId)} · tap to sit`,
        action: {
          label: "Open",
          onClick: () => {
            window.location.href = tableHref(invite.tableId);
          },
        },
        duration: 10_000,
      });
    }
    const newest = Math.max(...openInvites.map((i) => i.createdAt), seen);
    writeSeen(address, newest);
  }, [openInvites, signedIn, address]);

  const sendTx = useCallback(
    async (functionName: string, args: readonly unknown[]) => {
      if (!address || !account) throw new Error("Sign in first.");
      const rec = account;
      const wallet = walletFor(rec);
      const data = encodeFunctionData({
        abi: socialAbi,
        functionName: functionName as never,
        args: args as never,
      });
      const hash = await wallet.sendTransaction({
        to: SOCIAL_ADDRESS,
        data,
        account: wallet.account,
        chain: activeChain,
        gas: 450_000n,
        maxFeePerGas: 1_000_000_000n,
        maxPriorityFeePerGas: 10_000_000n,
      });
      await publicRpc().waitForTransactionReceipt({ hash, timeout: 90_000 });
      await Promise.all([profileQuery.refetch(), invitesQuery.refetch()]);
      return hash as Hex;
    },
    [address, account, profileQuery, invitesQuery],
  );

  // Copy nickname from any linked/old seat onto this address when missing.
  useEffect(() => {
    if (!signedIn || !address || !account?.email || !enabled) return;
    if (onChainProfile.set && onChainProfile.nickname) return;
    if (restoredProfile.current) return;
    if (profileQuery.isLoading) return;

    const email = account.email.trim().toLowerCase();
    restoredProfile.current = true;

    void (async () => {
      try {
        const cached = readEmailIdentity(email);
        const candidates = new Set<string>();
        candidates.add(address.toLowerCase());
        if (cached?.tableAddress) candidates.add(cached.tableAddress.toLowerCase());
        for (const a of cached?.linkedAddresses || []) candidates.add(a.toLowerCase());
        for (const rec of findTableAccountsForEmail(email)) {
          candidates.add(rec.address.toLowerCase());
        }

        const addrs = [...candidates] as Address[];
        let source: PlayerProfile | null = null;

        if (addrs.length > 0) {
          const rows = (await publicRpc().readContract({
            address: SOCIAL_ADDRESS,
            abi: socialAbi,
            functionName: "profilesOf",
            args: [addrs],
          })) as unknown[];
          for (let i = 0; i < addrs.length; i++) {
            const p = parseProfile(rows[i]);
            if (!p.set || !p.nickname) continue;
            const sameMail = (p.email || "").trim().toLowerCase() === email;
            if (sameMail || !source) source = p;
            if (sameMail) break;
          }
        }

        if (!source?.nickname && cached?.nickname) {
          source = {
            nickname: cached.nickname,
            avatar: Number(cached.avatar || 0),
            email,
            set: true,
          };
        }

        if (!source?.nickname) {
          restoredProfile.current = false;
          return;
        }

        setBorrowedProfile(source);
        writeEmailIdentity(email, {
          tableAddress: address,
          nickname: source.nickname,
          avatar: source.avatar,
          linkedAddresses: addrs,
        });

        // Persist onto the current seat so ranked + invites see the same name.
        await sendTx("setProfile", [
          source.nickname.slice(0, 20),
          Number(source.avatar || 0),
          email,
        ]);
      } catch {
        restoredProfile.current = false;
      }
    })();
  }, [
    signedIn,
    address,
    account?.email,
    enabled,
    onChainProfile.set,
    onChainProfile.nickname,
    profileQuery.isLoading,
    sendTx,
  ]);

  const saveProfile = useCallback(
    async (next: { nickname: string; avatar: number; email: string }) => {
      const nickname = next.nickname.trim().slice(0, 20);
      if (!nickname) throw new Error("Pick a nickname.");
      const email = next.email.trim().toLowerCase();
      await sendTx("setProfile", [nickname, next.avatar, email]);
      setBorrowedProfile({ nickname, avatar: next.avatar, email, set: true });
      if (address && email) {
        writeEmailIdentity(email, {
          tableAddress: address,
          nickname,
          avatar: next.avatar,
        });
      }
    },
    [sendTx, address],
  );

  const sendInvite = useCallback(
    async (to: Address, tableId: number, toEmail?: string, fromName?: string) => {
      await sendTx("invite", [to, BigInt(tableId)]);
      if (toEmail) {
        void fetch("/api/invite-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            toEmail,
            fromName: fromName || profile.nickname || "A WHOT player",
            tableCode: tableCode(tableId),
            link:
              typeof window !== "undefined"
                ? `${window.location.origin}${tableHref(tableId)}`
                : tableHref(tableId),
          }),
        }).catch(() => undefined);
      }
    },
    [sendTx, profile.nickname],
  );

  const dismissInvite = useCallback(
    async (index: number) => {
      await sendTx("closeInvite", [BigInt(index)]);
    },
    [sendTx],
  );

  const loadProfiles = useCallback(async (players: Address[]) => {
    if (!enabled || players.length === 0) return {} as Record<string, PlayerProfile>;
    const rows = (await publicRpc().readContract({
      address: SOCIAL_ADDRESS,
      abi: socialAbi,
      functionName: "profilesOf",
      args: [players],
    })) as unknown[];
    const map: Record<string, PlayerProfile> = {};
    players.forEach((addr, i) => {
      map[addr.toLowerCase()] = parseProfile(rows[i]);
    });
    return map;
  }, [enabled]);

  return {
    enabled,
    profile,
    openInvites,
    inviteCount: openInvites.length,
    saveProfile,
    sendInvite,
    dismissInvite,
    loadProfiles,
    refetch: async () => {
      await Promise.all([profileQuery.refetch(), invitesQuery.refetch()]);
    },
  };
}

export type SocialApi = ReturnType<typeof useSocial>;
