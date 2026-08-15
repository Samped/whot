import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { activeChain, hostRpcUrl } from "@/lib/network";

const STORAGE_KEY = "whot.tableAccount.v1";
const MAIL_SESSION = "whot.mailSession.v1";
const EMAIL_IDENTITY = "whot.emailIdentity.v1";

export type TableAccount = {
  address: Address;
  privateKey: Hex;
  createdAt: number;
  /** Storage owner — always `mail:<email>` for email seats. */
  owner?: string;
  email?: string;
  /** Latest CDP embedded-wallet address (auth only; may rotate). */
  cdpAddress?: string;
};

export type EmailIdentity = {
  tableAddress: Address;
  nickname?: string;
  avatar?: number;
  updatedAt: number;
};

export function mailOwnerKey(email: string) {
  return `mail:${email.trim().toLowerCase()}`;
}

function storageKey(owner?: string) {
  return owner ? `${STORAGE_KEY}.${owner.toLowerCase()}` : STORAGE_KEY;
}

export function saveMailSession(owner: string, email: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MAIL_SESSION, JSON.stringify({ owner, email }));
}

export function clearMailSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MAIL_SESSION);
}

export function readMailSession(): { owner: string; email: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MAIL_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { owner?: string; email?: string };
    if (!parsed?.owner) return null;
    return { owner: parsed.owner, email: parsed.email || "" };
  } catch {
    return null;
  }
}

function readIdentityMap(): Record<string, EmailIdentity> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EMAIL_IDENTITY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, EmailIdentity>;
  } catch {
    return {};
  }
}

export function readEmailIdentity(email: string): EmailIdentity | null {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  return readIdentityMap()[key] || null;
}

export function writeEmailIdentity(
  email: string,
  patch: Partial<EmailIdentity> & { tableAddress: Address },
) {
  if (typeof window === "undefined") return;
  const key = email.trim().toLowerCase();
  if (!key) return;
  const map = readIdentityMap();
  map[key] = {
    ...map[key],
    ...patch,
    tableAddress: patch.tableAddress,
    updatedAt: Date.now(),
  };
  window.localStorage.setItem(EMAIL_IDENTITY, JSON.stringify(map));
}

export function loadTableAccount(owner?: string): TableAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(owner));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TableAccount;
    if (!parsed?.address || !parsed?.privateKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Find any locally stored table seat that already belongs to this email. */
export function findTableAccountByEmail(email: string): TableAccount | null {
  if (typeof window === "undefined") return null;
  const want = email.trim().toLowerCase();
  if (!want) return null;

  let best: TableAccount | null = null;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_KEY)) continue;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "") as TableAccount;
      if (!parsed?.address || !parsed?.privateKey) continue;
      if ((parsed.email || "").trim().toLowerCase() !== want) continue;
      if (!best || (parsed.createdAt || 0) < (best.createdAt || 0)) best = parsed;
    } catch {
      /* skip */
    }
  }
  return best;
}

/**
 * Email seats must stay on one table EOA for life of that email.
 * CDP embedded addresses can rotate — never use them as the storage key.
 */
export function resolveEmailTableAccount(email: string, cdpAddress?: string): TableAccount {
  const trimmed = email.trim().toLowerCase();
  const owner = mailOwnerKey(trimmed);
  const cdp = cdpAddress?.toLowerCase() as Address | undefined;

  const finish = (rec: TableAccount, clearOwner?: string) => {
    const next: TableAccount = {
      ...rec,
      owner,
      email: trimmed,
      cdpAddress: cdp || rec.cdpAddress,
    };
    saveTableAccount(next);
    writeEmailIdentity(trimmed, { tableAddress: next.address });
    if (clearOwner && clearOwner.toLowerCase() !== owner.toLowerCase()) {
      clearTableAccount(clearOwner);
    }
    return next;
  };

  const byEmail = loadTableAccount(owner);
  if (byEmail) return finish(byEmail);

  if (cdp) {
    const byCdp = loadTableAccount(cdp);
    if (byCdp) return finish(byCdp, cdp);
  }

  const scanned = findTableAccountByEmail(trimmed);
  if (scanned) {
    const prevOwner = scanned.owner;
    return finish(scanned, prevOwner && prevOwner !== owner ? prevOwner : undefined);
  }

  return finish(createTableAccount(owner, trimmed));
}

export function createTableAccount(owner?: string, email?: string): TableAccount {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const record: TableAccount = {
    address: account.address,
    privateKey,
    createdAt: Date.now(),
    owner,
    email,
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey(owner), JSON.stringify(record));
  }
  return record;
}

export function saveTableAccount(record: TableAccount) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(record.owner), JSON.stringify(record));
}

export function clearTableAccount(owner?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(owner));
  if (owner) window.localStorage.removeItem(STORAGE_KEY);
}

const transport = () => http(hostRpcUrl(), { timeout: 20_000, retryCount: 1 });

export function publicRpc() {
  return createPublicClient({
    chain: activeChain,
    transport: transport(),
  });
}

export function walletFor(record: TableAccount) {
  const account = privateKeyToAccount(record.privateKey);
  return createWalletClient({
    account,
    chain: activeChain,
    transport: transport(),
  });
}

export async function accountBalance(address: Address): Promise<bigint> {
  return publicRpc().getBalance({ address });
}
