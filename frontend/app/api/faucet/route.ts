import { NextResponse } from "next/server";
import { isAddress, parseEther, type Address } from "viem";
import { houseClients, houseSend } from "@/lib/house-send";
import { cdpFaucetConfigured, refillHouseIfLow } from "@/lib/house-refill";

const MIN_BALANCE = parseEther("0.0009");
const TOP_UP = parseEther("0.0012");
const HOUSE_GAS = parseEther("0.00025");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request) {
  const clients = houseClients();
  if (!clients) {
    return NextResponse.json({ error: "House faucet is not configured." }, { status: 503 });
  }

  let address: Address;
  try {
    const body = (await req.json()) as { address?: string };
    if (!body.address || !isAddress(body.address)) {
      return NextResponse.json({ error: "Need a table account address." }, { status: 400 });
    }
    address = body.address;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const { account, publicClient } = clients;

  // A prior top-up may still be confirming — wait before sending another.
  for (let i = 0; i < 6; i++) {
    const bal = await publicClient.getBalance({ address });
    if (bal >= MIN_BALANCE) {
      const houseBal = await publicClient.getBalance({ address: account.address });
      if (houseBal < TOP_UP + HOUSE_GAS && cdpFaucetConfigured()) {
        void refillHouseIfLow({ drips: 10 });
      }
      return NextResponse.json({ ok: true, funded: false, balance: bal.toString() });
    }
    if (i < 5) await sleep(1_200);
  }

  let houseBal = await publicClient.getBalance({ address: account.address });
  if (houseBal < TOP_UP + HOUSE_GAS) {
    const refill = await refillHouseIfLow({ force: true, drips: 10, min: TOP_UP + HOUSE_GAS });
    houseBal = refill.after ? BigInt(refill.after) : await publicClient.getBalance({ address: account.address });
    if (houseBal < TOP_UP + HOUSE_GAS) {
      const hint = cdpFaucetConfigured()
        ? "House is topping up from Coinbase. Wait a few seconds and try again."
        : `House bankroll is empty. Send Base Sepolia ETH to ${account.address}.`;
      return NextResponse.json(
        { error: hint, house: account.address, refill: refill.error || undefined },
        { status: 503 },
      );
    }
  }

  try {
    const hash = await houseSend(address, undefined, TOP_UP, 100_000n);
    await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    void refillHouseIfLow({ drips: 10 });
    const balance = await publicClient.getBalance({ address });
    return NextResponse.json({ ok: true, funded: true, hash, balance: balance.toString() });
  } catch (err) {
    // Previous fund tx may have landed even if this send looked like a nonce clash.
    for (let i = 0; i < 8; i++) {
      await sleep(1_500);
      const bal = await publicClient.getBalance({ address });
      if (bal >= MIN_BALANCE) {
        return NextResponse.json({ ok: true, funded: true, balance: bal.toString(), recovered: true });
      }
    }
    const msg = err instanceof Error ? err.message : "Could not fund table account.";
    return NextResponse.json(
      {
        error: /nonce|already known|replacement/i.test(msg)
          ? "Funding is still confirming. Wait a few seconds, then tap Play again."
          : "Could not fund table account. Try again in a moment.",
      },
      { status: 503 },
    );
  }
}
