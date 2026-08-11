import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const FEE = {
  maxFeePerGas: 1_000_000_000n,
  maxPriorityFeePerGas: 10_000_000n,
};

let chain: Promise<unknown> = Promise.resolve();
let cachedNonce: { next: number; at: number } | null = null;

export function houseAccount(): Account | null {
  const raw = process.env.HOUSE_PRIVATE_KEY || process.env.PRIVATE_KEY_BASE_SEPOLIA || "";
  if (!raw) return null;
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  return privateKeyToAccount(key);
}

export function houseRpcUrl() {
  return process.env.HOUSE_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
}

export function houseClients() {
  const account = houseAccount();
  if (!account) return null;
  const rpc = houseRpcUrl();
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpc, { timeout: 30_000 }),
  });
  const wallet = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpc, { timeout: 30_000 }),
  });
  return { account, publicClient, wallet };
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function houseSend(to: Hex, data?: Hex, value?: bigint, gas?: bigint): Promise<Hex> {
  const clients = houseClients();
  if (!clients) throw new Error("House wallet is not configured.");
  const { account, publicClient, wallet } = clients;

  return enqueue(async () => {
    const fresh = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    });
    const next =
      cachedNonce && Date.now() - cachedNonce.at < 20_000
        ? Math.max(cachedNonce.next, Number(fresh))
        : Number(fresh);
    cachedNonce = { next: next + 1, at: Date.now() };
    try {
      return await wallet.sendTransaction({
        to,
        data,
        value,
        gas,
        nonce: next,
        maxFeePerGas: FEE.maxFeePerGas,
        maxPriorityFeePerGas: FEE.maxPriorityFeePerGas,
      });
    } catch (err) {
      cachedNonce = null;
      const msg = err instanceof Error ? err.message : String(err);
      if (/already known|nonce/i.test(msg)) {
        const retry = await publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending",
        });
        return await wallet.sendTransaction({
          to,
          data,
          value,
          gas,
          nonce: Number(retry),
          maxFeePerGas: FEE.maxFeePerGas,
          maxPriorityFeePerGas: FEE.maxPriorityFeePerGas,
        });
      }
      throw err;
    }
  });
}
