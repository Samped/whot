import { NextResponse } from "next/server";
import { encodeFunctionData, pad, toHex, type Hex } from "viem";
import { Lightning } from "@inco/lightning-js/lite";
import { whotAbi } from "@/abi/whot";
import { WHOT_ADDRESS } from "@/lib/addresses";
import { houseClients, houseRpcUrl, houseSend } from "@/lib/house-send";
import { parseTable } from "@/lib/table-view";

export const runtime = "nodejs";
export const maxDuration = 60;

const WHOT = WHOT_ADDRESS as Hex;
const ZERO = `0x${"0".repeat(64)}` as Hex;
const busy = new Set<number>();

function packValue(raw: unknown): Hex {
  let n = 0n;
  if (typeof raw === "bigint") n = raw;
  else if (typeof raw === "number") n = BigInt(raw);
  else if (typeof raw === "string" && raw !== "") n = BigInt(raw);
  return pad(toHex(n), { size: 32 });
}

export async function POST(req: Request) {
  if (!houseClients()) {
    return NextResponse.json({ error: "House is not configured." }, { status: 503 });
  }

  let id = 0;
  try {
    const body = (await req.json()) as { id?: number };
    id = Number(body.id);
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Need a table." }, { status: 400 });
  }
  if (busy.has(id)) {
    return NextResponse.json({ ok: true, pending: true });
  }

  busy.add(id);
  const { publicClient } = houseClients()!;

  try {
    const raw = await publicClient.readContract({
      address: WHOT,
      abi: whotAbi,
      functionName: "table",
      args: [BigInt(id)],
    });
    const table = parseTable(raw);
    if (!table || table.phase_ !== 2 || table.ready) {
      return NextResponse.json({ ok: true, done: true });
    }

    let handle = ZERO;
    for (let i = 0; i < 16; i++) {
      handle = (await publicClient.readContract({
        address: WHOT,
        abi: whotAbi,
        functionName: "openerOf",
        args: [BigInt(id)],
      })) as Hex;
      if (handle && handle !== ZERO) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!handle || handle === ZERO) {
      return NextResponse.json({ error: "Opener is not ready yet." }, { status: 503 });
    }

    const zap = await Lightning.baseSepoliaTestnet({ hostChainRpcUrls: [houseRpcUrl()] });
    const [revealed] = (await zap.attestedReveal([handle], {
      backoffConfig: { maxRetries: 36, baseDelayInMs: 280, backoffFactor: 1.18 },
    })) as { plaintext: { value: unknown }; covalidatorSignatures: readonly (Hex | Uint8Array)[] }[];

    const sigs = revealed.covalidatorSignatures.map((sig) =>
      typeof sig === "string" ? sig : toHex(sig),
    );
    const data = encodeFunctionData({
      abi: whotAbi,
      functionName: "lockOpener",
      args: [BigInt(id), { handle, value: packValue(revealed.plaintext.value) }, sigs],
    });
    const hash = await houseSend(WHOT, data, undefined, 1_800_000n);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
    if (receipt.status === "reverted") {
      return NextResponse.json({ error: "Opener lock reverted." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, card: Number(packValue(revealed.plaintext.value)) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Opener failed.";
    console.error("[opener]", id, message);
    if (/already known|nonce|WrongPhase|already/i.test(message)) {
      return NextResponse.json({ ok: true, pending: true });
    }
    return NextResponse.json({ error: message.slice(0, 180) }, { status: 500 });
  } finally {
    busy.delete(id);
  }
}
