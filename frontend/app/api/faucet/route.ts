import { NextResponse } from "next/server";
import { isAddress, parseEther, type Address } from "viem";
import { houseClients, houseSend } from "@/lib/house-send";

const MIN_BALANCE = parseEther("0.004");
const TOP_UP = parseEther("0.01");

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
    return NextResponse.json({ ok: true, funded: false, balance: playerBal.toString() });
  }
  if (houseBal < TOP_UP + parseEther("0.001")) {
    return NextResponse.json({ error: "House bankroll is empty." }, { status: 503 });
  }

  const hash = await houseSend(address, undefined, TOP_UP, 100_000n);
  await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });

  return NextResponse.json({ ok: true, funded: true, hash, balance: (playerBal + TOP_UP).toString() });
}
