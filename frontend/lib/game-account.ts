import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { whotAbi } from "@/abi/whot";
import { WHOT_ADDRESS } from "@/lib/addresses";
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
  /** Every table seat ever linked to this email (for merged rank). */
  linkedAddresses?: Address[];
  nickname?: string;
  avatar?: number;
  updatedAt: number;
};

export type SeatStats = { wins: number; losses: number; played: number };

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
  const prev = map[key];
  const linked = new Set<string>();
  for (const a of prev?.linkedAddresses || []) linked.add(a.toLowerCase());
  for (const a of patch.linkedAddresses || []) linked.add(a.toLowerCase());
  linked.add(patch.tableAddress.toLowerCase());
  if (prev?.tableAddress) linked.add(prev.tableAddress.toLowerCase());

  map[key] = {
    ...prev,
    ...patch,
    tableAddress: patch.tableAddress,
    linkedAddresses: [...linked] as Address[],
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

/** Every locally stored table seat (any owner key). */
export function listAllTableAccounts(): TableAccount[] {
  if (typeof window === "undefined") return [];
  const out: TableAccount[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_KEY)) continue;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "") as TableAccount;
      if (!parsed?.address || !parsed?.privateKey) continue;
      const id = parsed.address.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(parsed);
    } catch {
      /* skip */
    }
  }
  return out;
}

export function findTableAccountsForEmail(email: string): TableAccount[] {
  const want = email.trim().toLowerCase();
  if (!want) return [];
  const identity = readEmailIdentity(want);
  const linked = new Set((identity?.linkedAddresses || []).map((a) => a.toLowerCase()));
  if (identity?.tableAddress) linked.add(identity.tableAddress.toLowerCase());

  return listAllTableAccounts().filter((rec) => {
    const mail = (rec.email || "").trim().toLowerCase();
    if (mail === want) return true;
    if (linked.has(rec.address.toLowerCase())) return true;
    return false;
  });
}

async function readSeatStats(address: Address): Promise<SeatStats> {
  if (!WHOT_ADDRESS) return { wins: 0, losses: 0, played: 0 };
  try {
    const raw = (await publicRpc().readContract({
      address: WHOT_ADDRESS,
      abi: whotAbi,
      functionName: "stats",
      args: [address],
    })) as readonly [number | bigint, number | bigint, number | bigint];
    return {
      wins: Number(raw[0] || 0),
      losses: Number(raw[1] || 0),
      played: Number(raw[2] || 0),
    };
  } catch {
    return { wins: 0, losses: 0, played: 0 };
  }
}

function scoreStats(s: SeatStats) {
  return s.played * 1_000_000 + s.wins * 1_000 + s.losses;
}

/**
 * Pick the local private key whose on-chain seat has the most history.
 * Never invent a new seat when an older email seat still has wins.
 */
export async function resolveEmailTableAccount(
  email: string,
  cdpAddress?: string,
): Promise<TableAccount> {
  const trimmed = email.trim().toLowerCase();
  const owner = mailOwnerKey(trimmed);
  const cdp = cdpAddress?.toLowerCase() as Address | undefined;

  const byKey = new Map<string, TableAccount>();
  const add = (rec: TableAccount | null | undefined) => {
    if (!rec?.address || !rec.privateKey) return;
    byKey.set(rec.address.toLowerCase(), rec);
  };

  add(loadTableAccount(owner));
  if (cdp) add(loadTableAccount(cdp));
  for (const rec of findTableAccountsForEmail(trimmed)) add(rec);

  const candidates = [...byKey.values()];
  if (candidates.length === 0) {
    return finish(createTableAccount(owner, trimmed), trimmed, owner, cdp, []);
  }

  const ranked = await Promise.all(
    candidates.map(async (rec) => ({
      rec,
      stats: await readSeatStats(rec.address),
    })),
  );

  ranked.sort((a, b) => {
    const diff = scoreStats(b.stats) - scoreStats(a.stats);
    if (diff) return diff;
    return (a.rec.createdAt || 0) - (b.rec.createdAt || 0);
  });

  const withHistory = ranked.filter((r) => scoreStats(r.stats) > 0);
  const keyed = ranked.find((r) => (r.rec.owner || "").toLowerCase() === owner.toLowerCase());
  const best = (withHistory[0] || keyed || ranked[0]!).rec;

  const linked = ranked.map((r) => r.rec.address);
  const clearOwners = candidates
    .map((c) => c.owner)
    .filter((o): o is string => typeof o === "string" && o.length > 0 && o.toLowerCase() !== owner.toLowerCase());

  return finish(best, trimmed, owner, cdp, linked, clearOwners);
}

function finish(
  rec: TableAccount,
  email: string,
  owner: string,
  cdp: Address | undefined,
  linked: Address[],
  clearOwners: string[] = [],
) {
  const next: TableAccount = {
    ...rec,
    owner,
    email,
    cdpAddress: cdp || rec.cdpAddress,
  };
  saveTableAccount(next);
  writeEmailIdentity(email, {
    tableAddress: next.address,
    linkedAddresses: linked.length ? linked : [next.address],
  });
  for (const o of clearOwners) clearTableAccount(o);
  return next;
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
