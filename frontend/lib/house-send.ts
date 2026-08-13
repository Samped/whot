import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const FEE_FLOOR = {
  maxFeePerGas: 100_000_000n,
  maxPriorityFeePerGas: 10_000_000n,
};

let chain: Promise<unknown> = Promise.resolve();

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function feeCaps(publicClient: ReturnType<typeof createPublicClient>) {
  try {
    const fees = await publicClient.estimateFeesPerGas();
    const tip = fees.maxPriorityFeePerGas ?? FEE_FLOOR.maxPriorityFeePerGas;
    const max = fees.maxFeePerGas ?? FEE_FLOOR.maxFeePerGas;
    return {
      maxPriorityFeePerGas: tip > FEE_FLOOR.maxPriorityFeePerGas ? tip : FEE_FLOOR.maxPriorityFeePerGas,
      maxFeePerGas: max > FEE_FLOOR.maxFeePerGas ? max : FEE_FLOOR.maxFeePerGas,
    };
  } catch {
    return FEE_FLOOR;
  }
}

export async function houseSend(to: Hex, data?: Hex, value?: bigint, gas?: bigint): Promise<Hex> {
  const clients = houseClients();
  if (!clients) throw new Error("House wallet is not configured.");
  const { account, publicClient, wallet } = clients;

  return enqueue(async () => {
    const fees = await feeCaps(publicClient);
    const sendOnce = async (nonce: number) =>
      wallet.sendTransaction({
        to,
        data,
        value,
        gas,
        nonce,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });

    let nonce = Number(
      await publicClient.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      }),
    );

    try {
      return await sendOnce(nonce);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already known|replacement|nonce too low/i.test(msg)) {
        await sleep(2_000);
        nonce = Number(
          await publicClient.getTransactionCount({
            address: account.address,
            blockTag: "pending",
          }),
        );
        return await sendOnce(nonce);
      }
      throw err;
    }
  });
}
