import { NextResponse } from "next/server";
import { isAddress, parseEther, type Address } from "viem";
import { houseClients, houseSend } from "@/lib/house-send";
import { cdpFaucetConfigured, refillHouseIfLow } from "@/lib/house-refill";

const MIN_BALANCE = parseEther("0.0009");
const TOP_UP = parseEther("0.0012");
const HOUSE_GAS = parseEther("0.00025");

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
  const [playerBal, houseBal] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.getBalance({ address: account.address }),
  ]);

  if (playerBal >= MIN_BALANCE) {
    if (houseBal < TOP_UP + HOUSE_GAS && cdpFaucetConfigured()) {
      void refillHouseIfLow({ drips: 10 });
    }
    return NextResponse.json({ ok: true, funded: false, balance: playerBal.toString() });
  }

  let spendable = houseBal;
  if (spendable < TOP_UP + HOUSE_GAS) {
    const refill = await refillHouseIfLow({ force: true, drips: 8, min: TOP_UP + HOUSE_GAS });
    spendable = refill.after ? BigInt(refill.after) : await publicClient.getBalance({ address: account.address });
    if (spendable < TOP_UP + HOUSE_GAS) {
      const hint = cdpFaucetConfigured()
        ? "House is topping up from Coinbase. Wait a few seconds and try again."
        : `House bankroll is empty. Send Base Sepolia ETH to ${account.address}, or set CDP_API_KEY_ID + CDP_API_KEY_SECRET to auto-refill.`;
      return NextResponse.json(
        { error: hint, house: account.address, refill: refill.error || undefined },
        { status: 503 },
      );
    }
  }

  const hash = await houseSend(address, undefined, TOP_UP, 100_000n);
  await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  void refillHouseIfLow({ drips: 10 });

  return NextResponse.json({ ok: true, funded: true, hash, balance: (playerBal + TOP_UP).toString() });
}
