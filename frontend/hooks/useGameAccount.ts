"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAccount, useDisconnect } from "wagmi";
import type { Address } from "viem";
import {
  accountBalance,
  clearMailSession,
  clearTableAccount,
  createTableAccount,
  loadTableAccount,
  mailOwnerKey,
  readMailSession,
  saveMailSession,
  saveTableAccount,
  walletFor,
  type TableAccount,
} from "@/lib/game-account";
import { clearIncoSession } from "@/lib/inco-attestation";

export type PlayMode = "wallet" | "agent" | null;

export type PlaySession = {
  address: Address;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any;
  mode: Exclude<PlayMode, null>;
};

type GameAccountValue = {
  account: TableAccount | null;
  address: Address | undefined;
  walletAddress: Address | undefined;
  isConnected: boolean;
  signedIn: boolean;
  mode: PlayMode;
  ready: boolean;
  funding: boolean;
  loginOpen: boolean;
  requestLogin: () => void;
  closeLogin: () => void;
  create: () => TableAccount;
  signInWithEmail: (email: string, ownerAddress?: string) => TableAccount;
  signOut: () => void;
  ensureReady: (minBalance?: bigint) => Promise<PlaySession>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any;
};

const GameAccountContext = createContext<GameAccountValue | null>(null);

async function requestFaucet(address: Address) {
  const res = await fetch("/api/faucet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error || "Could not fund table account.");
}

export function GameAccountProvider({ children }: { children: ReactNode }) {
  const { address: walletAddress, isConnected: walletOn } = useAccount();
  const { disconnect } = useDisconnect();

  const [agent, setAgent] = useState<TableAccount | null>(null);
  const [ready, setReady] = useState(false);
  const [funding, setFunding] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    if (walletOn && walletAddress) {
      const pending =
        typeof window !== "undefined" ? window.sessionStorage.getItem("whot.pendingEmail") : null;
      const rec = loadTableAccount(walletAddress) ?? createTableAccount(walletAddress, pending || undefined);
      if (pending) {
        rec.email = pending;
        saveTableAccount(rec);
        saveMailSession(walletAddress, pending);
        window.sessionStorage.removeItem("whot.pendingEmail");
      }
      setAgent((prev) => {
        if (prev?.address.toLowerCase() === rec.address.toLowerCase()) {
          if (pending && prev.email !== pending) return { ...prev, email: pending };
          return prev;
        }
        clearIncoSession();
        return rec;
      });
      setLoginOpen(false);
    } else {
      const mail = readMailSession();
      if (mail?.email) {
        const rec = loadTableAccount(mail.owner);
        if (rec) {
          rec.email = rec.email || mail.email;
          setAgent(rec);
        } else {
          setAgent(null);
        }
      } else {
        setAgent(null);
      }
    }
    setReady(true);
  }, [walletOn, walletAddress]);

  const signedIn = Boolean((walletOn && walletAddress) || agent?.email);
  const mode: PlayMode = walletOn && walletAddress ? "wallet" : agent?.email ? "agent" : null;

  const requestLogin = useCallback(() => setLoginOpen(true), []);
  const closeLogin = useCallback(() => setLoginOpen(false), []);

  const create = useCallback(() => {
    if (!walletAddress) {
      throw new Error("Sign in with email or a wallet first.");
    }
    const next = createTableAccount(walletAddress);
    clearIncoSession();
    setAgent(next);
    return next;
  }, [walletAddress]);

  const signInWithEmail = useCallback((email: string, ownerAddress?: string) => {
    const trimmed = email.trim().toLowerCase();
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("whot.pendingEmail", trimmed);
    }
    const owner = ownerAddress || mailOwnerKey(trimmed);
    const existing = loadTableAccount(owner);
    const next = existing ?? createTableAccount(owner, trimmed);
    next.email = trimmed;
    saveTableAccount(next);
    saveMailSession(owner, trimmed);
    clearIncoSession();
    setAgent(next);
    setLoginOpen(false);
    return next;
  }, []);

  const signOut = useCallback(() => {
    if (walletOn) disconnect();
    void import("@coinbase/cdp-core")
      .then(({ signOut: cdpSignOut }) => cdpSignOut())
      .catch(() => undefined);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("whot.pendingEmail");
    }
    const mail = readMailSession();
    clearTableAccount(walletAddress);
    if (mail) clearTableAccount(mail.owner);
    clearMailSession();
    clearIncoSession();
    setAgent(null);
    setLoginOpen(false);
  }, [walletOn, walletAddress, disconnect]);

  const ensureReady = useCallback(
    async (minBalance = 4_000_000_000_000_000n): Promise<PlaySession> => {
      const walletSigned = Boolean(walletOn && walletAddress);
      const mailSigned = Boolean(agent?.email);
      if (!walletSigned && !mailSigned) {
        setLoginOpen(true);
        throw new Error("Sign in with email or a wallet first.");
      }
      const rec = agent;
      if (!rec) {
        setLoginOpen(true);
        throw new Error("Sign in with email or a wallet first.");
      }
      const bal = await accountBalance(rec.address);
      if (bal < minBalance) {
        setFunding(true);
        try {
          await requestFaucet(rec.address);
          for (let i = 0; i < 12; i++) {
            const next = await accountBalance(rec.address);
            if (next >= minBalance) break;
            await new Promise((r) => setTimeout(r, 800));
          }
          const funded = await accountBalance(rec.address);
          if (funded < minBalance) {
            throw new Error("Table account is still unfunded. Try again in a moment.");
          }
        } finally {
          setFunding(false);
        }
      }
      return {
        address: rec.address,
        wallet: walletFor(rec),
        mode: walletOn && walletAddress ? "wallet" : "agent",
      };
    },
    [agent, walletOn, walletAddress],
  );

  const address = agent?.address;
  const wallet = useMemo(() => (agent ? walletFor(agent) : null), [agent]);

  const value = useMemo<GameAccountValue>(
    () => ({
      account: agent,
      address,
      walletAddress,
      isConnected: Boolean(address),
      signedIn,
      mode,
      ready,
      funding,
      loginOpen,
      requestLogin,
      closeLogin,
      create,
      signInWithEmail,
      signOut,
      ensureReady,
      wallet,
    }),
    [
      agent,
      address,
      walletAddress,
      signedIn,
      mode,
      ready,
      funding,
      loginOpen,
      requestLogin,
      closeLogin,
      create,
      signInWithEmail,
      signOut,
      ensureReady,
      wallet,
    ],
  );

  return createElement(GameAccountContext.Provider, { value }, children);
}

export function useGameAccount() {
  const ctx = useContext(GameAccountContext);
  if (!ctx) throw new Error("useGameAccount must be used inside GameAccountProvider");
  return ctx;
}
