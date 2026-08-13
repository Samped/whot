import { formatEther, parseEther } from "viem";
import { houseAccount, houseClients } from "@/lib/house-send";

/** Keep enough to top up a few table accounts. */
export const HOUSE_TARGET = parseEther("0.02");
export const HOUSE_LOW = parseEther("0.003");
const DRIP = parseEther("0.0001");

let inflight: Promise<RefillResult> | null = null;
let lastTry = 0;

export type RefillResult = {
  ok: boolean;
  configured: boolean;
  address?: string;
  before?: string;
  after?: string;
  drips: number;
  hashes: string[];
  error?: string;
};

export function cdpFaucetConfigured() {
  return Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ask Coinbase's Base Sepolia faucet for test ETH when the house wallet is low.
 * Each drip is 0.0001 ETH (CDP limit). Call this from the player faucet or a cron.
 */
export async function refillHouseIfLow(opts?: {
  force?: boolean;
  drips?: number;
  min?: bigint;
}): Promise<RefillResult> {
  if (inflight) return inflight;
  inflight = runRefill(opts).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function runRefill(opts?: {
  force?: boolean;
  drips?: number;
  min?: bigint;
}): Promise<RefillResult> {
  const account = houseAccount();
  const clients = houseClients();
  if (!account || !clients) {
    return { ok: false, configured: false, drips: 0, hashes: [], error: "House wallet is not configured." };
  }

  const min = opts?.min ?? HOUSE_LOW;
  const before = await clients.publicClient.getBalance({ address: account.address });
  const base: RefillResult = {
    ok: before >= min,
    configured: cdpFaucetConfigured(),
    address: account.address,
    before: before.toString(),
    after: before.toString(),
    drips: 0,
    hashes: [],
  };

  if (!opts?.force && before >= HOUSE_TARGET) return { ...base, ok: true };
  if (!opts?.force && before >= min && Date.now() - lastTry < 30_000) return { ...base, ok: true };
  if (!cdpFaucetConfigured()) {
    return {
      ...base,
      error: "Set CDP_API_KEY_ID and CDP_API_KEY_SECRET to auto-refill the house from Coinbase.",
    };
  }

  lastTry = Date.now();
  const need = HOUSE_TARGET > before ? HOUSE_TARGET - before : 0n;
  const maxDrips = Math.max(1, Math.min(opts?.drips ?? 12, 20));
  const want = need > 0n ? Math.min(maxDrips, Number(need / DRIP) + 1) : maxDrips;

  try {
    const { CdpClient } = await import("@coinbase/cdp-sdk");
    const cdp = new CdpClient({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
      walletSecret: process.env.CDP_WALLET_SECRET,
    });

    const hashes: string[] = [];
    for (let i = 0; i < want; i++) {
      try {
        const res = await cdp.evm.requestFaucet({
          address: account.address,
          network: "base-sepolia",
          token: "eth",
        });
        if (res.transactionHash) hashes.push(res.transactionHash);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (hashes.length === 0) {
          return { ...base, drips: 0, hashes, error: msg };
        }
        break;
      }
      if (i + 1 < want) await sleep(900);
    }

    let after = before;
    for (let i = 0; i < 8; i++) {
      await sleep(1_200);
      after = await clients.publicClient.getBalance({ address: account.address });
      if (after > before || after >= min) break;
    }

    return {
      ok: after >= min,
      configured: true,
      address: account.address,
      before: before.toString(),
      after: after.toString(),
      drips: hashes.length,
      hashes,
      error: after >= min ? undefined : `House still low (${formatEther(after)} ETH) after ${hashes.length} faucet drip(s).`,
    };
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : "Coinbase faucet failed.",
    };
  }
}
