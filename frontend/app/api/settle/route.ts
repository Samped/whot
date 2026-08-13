import { NextResponse } from "next/server";
import { encodeFunctionData, pad, toHex, type Hex } from "viem";
import { Lightning } from "@inco/lightning-js/lite";
import { whotAbi } from "@/abi/whot";
import { WHOT_ADDRESS } from "@/lib/addresses";
import { houseClients, houseRpcUrl, houseSend } from "@/lib/house-send";
import { parseTable } from "@/lib/table-view";
import { decodeIndex } from "@/lib/whot";

export const runtime = "nodejs";
export const maxDuration = 60;

const WHOT = WHOT_ADDRESS as Hex;
const busy = new Set<number>();

function packValue(raw: unknown): Hex {
  let n = 0n;
  if (typeof raw === "bigint") n = raw;
  else if (typeof raw === "number") n = BigInt(raw);
  else if (typeof raw === "string" && raw !== "") n = BigInt(raw);
  return pad(toHex(n), { size: 32 });
}

function toSigs(sigs: readonly (Hex | Uint8Array)[]): Hex[] {
  return sigs.map((sig) => (typeof sig === "string" ? sig : toHex(sig)));
}

type RevealRow = {
  handle: Hex;
  plaintext: { value: unknown };
  covalidatorSignatures: readonly (Hex | Uint8Array)[];
};

async function revealHand(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zap: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any,
  id: number,
  player: Hex,
  preferDecrypt: boolean,
) {
  const handles = (await publicClient.readContract({
    address: WHOT,
    abi: whotAbi,
    functionName: "getHandHandles",
    args: [BigInt(id), player],
  })) as Hex[];

  if (handles.length === 0) {
    return { atts: [] as { handle: Hex; value: Hex }[], sigs: [] as Hex[][], sum: 0 };
  }

  let revealed: RevealRow[];
  try {
    if (preferDecrypt) {
      revealed = (await zap.attestedDecrypt(wallet, handles, {
        backoffConfig: { maxRetries: 8, baseDelayInMs: 100, backoffFactor: 1.15 },
      })) as RevealRow[];
    } else {
      revealed = (await zap.attestedReveal(handles, {
        backoffConfig: { maxRetries: 12, baseDelayInMs: 120, backoffFactor: 1.15 },
      })) as RevealRow[];
    }
  } catch {
    // Fall back the other way — public reveal after market count, or house decrypt for the bot.
    revealed = preferDecrypt
      ? ((await zap.attestedReveal(handles, {
          backoffConfig: { maxRetries: 12, baseDelayInMs: 120, backoffFactor: 1.15 },
        })) as RevealRow[])
      : ((await zap.attestedDecrypt(wallet, handles, {
          backoffConfig: { maxRetries: 8, baseDelayInMs: 100, backoffFactor: 1.15 },
        })) as RevealRow[]);
  }

  let sum = 0;
  const atts: { handle: Hex; value: Hex }[] = [];
  const sigs: Hex[][] = [];
  for (let i = 0; i < handles.length; i++) {
    const row = revealed[i]!;
    const idx = Number(
      typeof row.plaintext.value === "bigint" ? row.plaintext.value : row.plaintext.value,
    );
    sum += decodeIndex(idx).rank;
    atts.push({ handle: handles[i]!, value: packValue(row.plaintext.value) });
    sigs.push(toSigs(row.covalidatorSignatures));
  }
  return { atts, sigs, sum };
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
  const clients = houseClients()!;
  const { publicClient, wallet } = clients;

  try {
    const raw = await publicClient.readContract({
      address: WHOT,
      abi: whotAbi,
      functionName: "table",
      args: [BigInt(id)],
    });
    const table = parseTable(raw);
    if (!table) {
      return NextResponse.json({ error: "No table." }, { status: 404 });
    }
    if (table.phase_ === 4) {
      return NextResponse.json({
        ok: true,
        done: true,
        score0: table.score0_,
        score1: table.score1_,
      });
    }
    if (table.phase_ !== 3 || !table.marketEnd_) {
      return NextResponse.json({ ok: true, pending: true });
    }

    const zap = await Lightning.baseSepoliaTestnet({ hostChainRpcUrls: [houseRpcUrl()] });
    // Solo bot hand is allowed to the house; player hand was public-revealed at market end.
    const botSeat = table.solo;
    const [hand0, hand1] = await Promise.all([
      revealHand(zap, publicClient, wallet, id, table.p0 as Hex, false),
      revealHand(zap, publicClient, wallet, id, table.p1 as Hex, botSeat),
    ]);

    const data = encodeFunctionData({
      abi: whotAbi,
      functionName: "settleMarket",
      args: [BigInt(id), hand0.atts, hand0.sigs, hand1.atts, hand1.sigs],
    });
    const gas = BigInt(1_200_000 + (hand0.atts.length + hand1.atts.length) * 250_000);
    const hash = await houseSend(WHOT, data, undefined, gas);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 45_000,
      pollingInterval: 400,
    });
    if (receipt.status === "reverted") {
      return NextResponse.json({ error: "Market settle reverted." }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      done: true,
      score0: hand0.sum,
      score1: hand1.sum,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Settle failed.";
    console.error("[settle]", id, message);
    if (/already known|nonce|WrongPhase|already/i.test(message)) {
      // May already be settling / settled — client should poll table phase.
      return NextResponse.json({ ok: true, pending: true });
    }
    return NextResponse.json({ error: message.slice(0, 180) }, { status: 500 });
  } finally {
    busy.delete(id);
  }
}
