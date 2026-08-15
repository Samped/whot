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
  resolveEmailTableAccount,
  saveMailSession,
  saveTableAccount,
  walletFor,
  type TableAccount,
} from "@/lib/game-account";
import { clearIncoSession } from "@/lib/inco-attestation";

export type PlayMode = "wallet" | "email" | null;

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
  signInWithEmail: (email: string, cdpAddress?: string) => Promise<TableAccount>;
  signOut: () => void;
  ensureReady: (minBalance?: bigint) => Promise<PlaySession>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any;
};

const GameAccountContext = createContext<GameAccountValue | null>(null);
const EMAIL_ACTIVE = "whot.emailActive.v1";

async function requestFaucet(address: Address) {
  let last = "Could not fund table account.";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("/api/faucet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
    if (res.ok) return;
    last = body.error || last;
    // Funding race / confirming top-up — brief wait then retry.
    if (/confirming|topping up|try again/i.test(last) || res.status === 503) {
      await new Promise((r) => setTimeout(r, 2_000 + attempt * 1_000));
      continue;
    }
    break;
  }
  throw new Error(last);
}

function markEmailActive() {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(EMAIL_ACTIVE, "1");
  }
}

function clearEmailActive() {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(EMAIL_ACTIVE);
  }
}

function emailSessionLive() {
  return typeof window !== "undefined" && window.sessionStorage.getItem(EMAIL_ACTIVE) === "1";
}

export function GameAccountProvider({ children }: { children: ReactNode }) {
  const { address: walletAddress, isConnected: walletOn } = useAccount();
  const { disconnect } = useDisconnect();

  const [agent, setAgent] = useState<TableAccount | null>(null);
  const [ready, setReady] = useState(false);
  const [funding, setFunding] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (walletOn && walletAddress) {
      clearEmailActive();
      const rec = loadTableAccount(walletAddress);
      setAgent(rec);
      setLoginOpen(false);
      setReady(true);
      return;
    }

    if (emailSessionLive()) {
      const mail = readMailSession();
      if (mail?.email) {
        setReady(false);
        void (async () => {
          try {
            const rec = await resolveEmailTableAccount(
              mail.email,
              mail.owner.startsWith("mail:") ? undefined : mail.owner,
            );
            if (cancelled) return;
            saveMailSession(mailOwnerKey(mail.email), mail.email);
            setAgent(rec);
          } finally {
            if (!cancelled) setReady(true);
          }
        })();
        return () => {
          cancelled = true;
        };
      }
    }

    clearEmailActive();
    setAgent(null);
    setReady(true);
    return () => {
      cancelled = true;
    };
  }, [walletOn, walletAddress]);

  const signedIn = Boolean((walletOn && walletAddress) || (agent?.email && emailSessionLive()));
  const mode: PlayMode = walletOn && walletAddress ? "wallet" : agent?.email && emailSessionLive() ? "email" : null;

  const requestLogin = useCallback(() => setLoginOpen(true), []);
  const closeLogin = useCallback(() => setLoginOpen(false), []);

  const signInWithEmail = useCallback(async (email: string, cdpAddress?: string) => {
    const trimmed = email.trim().toLowerCase();
    // CDP addresses rotate — pick the local seat with the most on-chain history for this email.
    const next = await resolveEmailTableAccount(trimmed, cdpAddress);
    saveMailSession(mailOwnerKey(trimmed), trimmed);
    markEmailActive();
    clearIncoSession();
    setAgent(next);
    setLoginOpen(false);
    return next;
  }, []);

  const signOut = useCallback(() => {
    if (walletOn) disconnect();
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("whot.pendingEmail");
    }
    const mail = readMailSession();
    clearTableAccount(walletAddress);
    if (mail?.email) clearTableAccount(mailOwnerKey(mail.email));
    if (mail?.owner) clearTableAccount(mail.owner);
    clearMailSession();
    clearEmailActive();
    clearIncoSession();
    setAgent(null);
    setLoginOpen(false);
  }, [walletOn, walletAddress, disconnect]);

  const ensureReady = useCallback(
    async (minBalance = 900_000_000_000_000n): Promise<PlaySession> => {
      const walletSigned = Boolean(walletOn && walletAddress);
      const mailSigned = Boolean(agent?.email && emailSessionLive());
      if (!walletSigned && !mailSigned) {
        setLoginOpen(true);
        throw new Error("Sign in with email or a wallet first.");
      }

      let rec = agent;
      if (!rec) {
        if (walletSigned && walletAddress) {
          rec = loadTableAccount(walletAddress) ?? createTableAccount(walletAddress);
          saveTableAccount(rec);
          setAgent(rec);
        } else if (mailSigned) {
          const mail = readMailSession();
          if (!mail?.email) {
            setLoginOpen(true);
            throw new Error("Sign in with email or a wallet first.");
          }
          rec = await resolveEmailTableAccount(
            mail.email,
            mail.owner.startsWith("mail:") ? undefined : mail.owner,
          );
          saveMailSession(mailOwnerKey(mail.email), mail.email);
          setAgent(rec);
        }
      }

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
        mode: walletOn && walletAddress ? "wallet" : "email",
      };
    },
    [agent, walletOn, walletAddress],
  );

  const address = signedIn ? agent?.address : undefined;
  const wallet = useMemo(() => (agent && signedIn ? walletFor(agent) : null), [agent, signedIn]);

  const value = useMemo<GameAccountValue>(
    () => ({
      account: signedIn ? agent : null,
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
