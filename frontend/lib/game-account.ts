import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { activeChain, hostRpcUrl } from "@/lib/network";

const STORAGE_KEY = "whot.tableAccount.v1";
const MAIL_SESSION = "whot.mailSession.v1";

export type TableAccount = {
  address: Address;
  privateKey: Hex;
  createdAt: number;
  owner?: string;
  email?: string;
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
