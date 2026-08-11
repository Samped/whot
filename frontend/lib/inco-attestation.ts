import type { Hex } from "viem";
import { pad, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getIncoLightning } from "@/lib/network";

export const REVEAL_BACKOFF = {
  maxRetries: 36,
  baseDelayInMs: 280,
  backoffFactor: 1.18,
};

type LightningClient = Awaited<ReturnType<typeof getIncoLightning>>;

let zapInstance: LightningClient | null = null;

export async function getZap(): Promise<LightningClient> {
  if (zapInstance) return zapInstance;
  zapInstance = await getIncoLightning();
  return zapInstance;
}

export type AttestationResult = {
  handle: Hex;
  plaintext: { value: unknown };
  covalidatorSignatures: readonly Uint8Array[] | readonly Hex[];
};

export function isCursed(result: AttestationResult): boolean {
  const v = result.plaintext.value;
  return v === true || v === 1n || v === 1 || v === "1";
}

function signaturesOf(result: AttestationResult): Hex[] {
  return result.covalidatorSignatures.map((sig) =>
    typeof sig === "string" ? sig : toHex(sig),
  );
}

export function packAttestation(result: AttestationResult): {
  attestation: { handle: Hex; value: Hex };
  signatures: Hex[];
} {
  const raw = result.plaintext.value;
  const bit =
    raw === true || raw === 1n || raw === 1 || raw === "1" ? 1n : 0n;
  return {
    attestation: {
      handle: result.handle,
      value: pad(toHex(bit), { size: 32 }),
    },
    signatures: signaturesOf(result),
  };
}

/** Pack a decrypted uint (catalog index, card id, …) as bytes32. */
export function packUintAttestation(result: AttestationResult): {
  attestation: { handle: Hex; value: Hex };
  signatures: Hex[];
} {
  const raw = result.plaintext.value;
  let n = 0n;
  if (typeof raw === "bigint") n = raw;
  else if (typeof raw === "number") n = BigInt(raw);
  else if (typeof raw === "string" && raw !== "") n = BigInt(raw);
  else if (typeof raw === "boolean") n = raw ? 1n : 0n;
  return {
    attestation: {
      handle: result.handle,
      value: pad(toHex(n), { size: 32 }),
    },
    signatures: signaturesOf(result),
  };
}

export async function retryReveal(handles: Hex[]): Promise<AttestationResult[]> {
  const zap = await getZap();
  return zap.attestedReveal(handles, { backoffConfig: REVEAL_BACKOFF }) as Promise<
    AttestationResult[]
  >;
}

// lightning-js bundles its own viem types; local accounts are structurally compatible.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DecryptWallet = any;

const SESSION_VERIFIER = {
  testnet: "0xc34569efc25901bdd6b652164a2c8a7228b23005",
  mainnet: "0x68a5b59b4caf23416885859c1662746619a471f3",
} as const;

type StoredVoucher = {
  sharer: Hex;
  voucher: {
    sessionNonce: Hex;
    verifyingContract: Hex;
    callFunction: Hex;
    sharerArgData: Hex;
    warning: string;
  };
  voucherSignature: Hex;
};

type StoredSession = {
  owner: Hex;
  ephemeralKey: Hex;
  voucher: StoredVoucher;
  expiresAt: number;
};

type IncoSession = {
  owner: Hex;
  ephemeral: import("viem/accounts").PrivateKeyAccount;
  voucher: StoredVoucher;
  expiresAt: number;
};

const SESSION_KEY = "whot.incoSession.v1";
let incoSession: IncoSession | null = null;

function readStored(owner: Hex): IncoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${SESSION_KEY}.${owner.toLowerCase()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.ephemeralKey || parsed.expiresAt <= Date.now() + 30_000) return null;
    if (parsed.owner.toLowerCase() !== owner.toLowerCase()) return null;
    return {
      owner,
      ephemeral: privateKeyToAccount(parsed.ephemeralKey),
      voucher: parsed.voucher,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function writeStored(session: IncoSession, ephemeralKey: Hex) {
  if (typeof window === "undefined") return;
  const payload: StoredSession = {
    owner: session.owner,
    ephemeralKey,
    voucher: session.voucher,
    expiresAt: session.expiresAt,
  };
  window.localStorage.setItem(`${SESSION_KEY}.${session.owner.toLowerCase()}`, JSON.stringify(payload));
}

export function clearIncoSession() {
  incoSession = null;
}

/** Table EOA signs the grant locally. Later decrypts use the voucher — no wallet popup. */
export async function ensureIncoSession(walletClient: DecryptWallet): Promise<IncoSession> {
  const owner = walletClient.account?.address as Hex | undefined;
  if (!owner) throw new Error("Table account is not ready.");
  if (incoSession && incoSession.owner.toLowerCase() === owner.toLowerCase() && incoSession.expiresAt > Date.now() + 30_000) {
    return incoSession;
  }
  const stored = readStored(owner);
  if (stored) {
    incoSession = stored;
    return stored;
  }

  const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
  const ephemeralKey = generatePrivateKey();
  const ephemeral = privateKeyToAccount(ephemeralKey);
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const zap = await getZap();
  const { NETWORK } = await import("@/lib/network");
  const voucher = (await zap.grantSessionKeyAllowanceVoucher(
    walletClient as never,
    ephemeral.address,
    expiresAt,
    SESSION_VERIFIER[NETWORK],
  )) as StoredVoucher;
  incoSession = { owner, ephemeral, voucher, expiresAt: expiresAt.getTime() };
  writeStored(incoSession, ephemeralKey);
  return incoSession;
}

export async function retryDecrypt(
  walletClient: DecryptWallet,
  handles: Hex[],
  _address?: Hex,
): Promise<AttestationResult[]> {
  const zap = await getZap();
  try {
    const session = await ensureIncoSession(walletClient);
    return (await zap.attestedDecryptWithVoucher(session.ephemeral as never, session.voucher, handles, {
      backoffConfig: REVEAL_BACKOFF,
    })) as AttestationResult[];
  } catch (err) {
    console.warn("[inco] voucher decrypt failed, using table EOA", err);
    try {
      return (await zap.attestedDecrypt(walletClient, handles, {
        backoffConfig: REVEAL_BACKOFF,
      })) as AttestationResult[];
    } catch (inner) {
      console.error("[inco] attestedDecrypt failed", inner, inner instanceof Error ? inner.cause : undefined);
      throw inner;
    }
  }
}
