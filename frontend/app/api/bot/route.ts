import { NextResponse } from "next/server";
import { decodeEventLog, encodeFunctionData, pad, toHex, type Hex } from "viem";
import { Lightning } from "@inco/lightning-js/lite";
import { whotAbi } from "@/abi/whot";
import { WHOT_ADDRESS } from "@/lib/addresses";
import { houseClients, houseRpcUrl, houseSend } from "@/lib/house-send";
import { computerToPlay, isOpen, parseTable, type TableView } from "@/lib/table-view";
import { heuristicMove, type PickView } from "@/lib/pick";
import { decodeCard, decodeIndex, isLegal, SHAPE_NAME, specialCall, type WhotCard } from "@/lib/whot";

export const runtime = "nodejs";
export const maxDuration = 60;

const WHOT = WHOT_ADDRESS as Hex;
const ZERO = `0x${"0".repeat(64)}` as Hex;
const busy = new Set<number>();

type CachedCard = {
  index: number;
  card: WhotCard;
  handle: Hex;
  att: { handle: Hex; plaintext: { value: unknown }; covalidatorSignatures: readonly (Hex | Uint8Array)[] };
};

type HandCache = { key: string; cards: CachedCard[]; at: number };
type Decision = {
  top: number;
  shape: number;
  pickKind: number;
  move: { type: "play"; index: number; nextShape: number } | { type: "market" };
  card: number;
  call: string;
  at: number;
};

const handCache = new Map<number, HandCache>();
const loading = new Map<number, Promise<HandCache | null>>();
const decisions = new Map<number, Decision>();
let zapPromise: Promise<Awaited<ReturnType<typeof Lightning.baseSepoliaTestnet>>> | null = null;

function zap() {
  if (!zapPromise) {
    zapPromise = Lightning.baseSepoliaTestnet({ hostChainRpcUrls: [houseRpcUrl()] });
  }
  return zapPromise;
}

function packValue(raw: unknown): Hex {
  let n = 0n;
  if (typeof raw === "bigint") n = raw;
  else if (typeof raw === "number") n = BigInt(raw);
  else if (typeof raw === "string" && raw !== "") n = BigInt(raw);
  return pad(toHex(n), { size: 32 });
}

function callFor(card: WhotCard, nextShape: number) {
  if (card.rank === 20) return `WHOT! · ${SHAPE_NAME[nextShape] || "shape"}`;
  return specialCall(card.rank) || "Computer";
}

function playedFromReceipt(logs: { data: Hex; topics: Hex[] }[]) {
  let card = 0;
  let call = "Computer";
  for (const log of logs) {
    try {
      const parsed = decodeEventLog({
        abi: whotAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (parsed.eventName === "CardPlayed") {
        card = Number((parsed.args as { card?: bigint | number }).card || 0);
        call = String((parsed.args as { call?: string }).call || "Computer");
      }
      if (parsed.eventName === "Market") call = "Computer went market";
    } catch {
      /* skip */
    }
  }
  return { card, call };
}

function pickMove(
  cards: CachedCard[],
  top: WhotCard | null,
  shape: number,
  pickKind: number,
  pick: number,
  marketLeft: number,
  oppCount: number,
): Decision {
  const view: PickView = {
    top: top ? { shape: SHAPE_NAME[top.shape] || "any", rank: top.rank } : null,
    calledShape: SHAPE_NAME[shape] || "any",
    pendingKind: pickKind,
    pendingPick: pick,
    marketLeft,
    myCount: cards.length,
    oppCount,
    hand: cards.map((c) => ({
      index: c.index,
      shape: SHAPE_NAME[c.card.shape] || "whot",
      rank: c.card.rank,
      legal: isLegal(c.card, top, shape, pickKind),
    })),
  };
  const move = heuristicMove(view);
  if (move.type === "market") {
    return { top: top?.id ?? 0, shape, pickKind, move, card: 0, call: "Computer went market", at: Date.now() };
  }
  const picked = cards[move.index];
  const card = picked?.card;
  return {
    top: top?.id ?? 0,
    shape,
    pickKind,
    move,
    card: card?.id ?? 0,
    call: card ? callFor(card, move.nextShape) : "Computer",
    at: Date.now(),
  };
}

async function loadHand(id: number, force = false): Promise<HandCache | null> {
  const inflight = loading.get(id);
  if (inflight && !force) return inflight;

  const work = (async () => {
    const clients = houseClients();
    if (!clients) return null;
    let handles: Hex[] = [];
    try {
      handles = (await clients.publicClient.readContract({
        address: WHOT,
        abi: whotAbi,
        functionName: "getHandHandles",
        args: [BigInt(id), WHOT],
      })) as Hex[];
    } catch {
      return handCache.get(id) ?? null;
    }
    const key = handles.join(",").toLowerCase();
    const hit = handCache.get(id);
    if (!force && hit && hit.key === key && Date.now() - hit.at < 12 * 60_000) return hit;
    if (handles.length === 0) {
      const empty = { key, cards: [], at: Date.now() };
      handCache.set(id, empty);
      return empty;
    }

    const lightning = await zap();
    const revealed = (await lightning.attestedDecrypt(clients.wallet as never, handles, {
      backoffConfig: { maxRetries: 6, baseDelayInMs: 80, backoffFactor: 1.15 },
    })) as CachedCard["att"][];

    const cards: CachedCard[] = revealed.map((att, index) => {
      const raw = att.plaintext.value;
      const idx = typeof raw === "bigint" ? Number(raw) : Number(raw);
      return { index, card: decodeIndex(idx), handle: handles[index]!, att };
    });
    const next = { key, cards, at: Date.now() };
    handCache.set(id, next);
    return next;
  })();

  loading.set(id, work);
  try {
    return await work;
  } finally {
    if (loading.get(id) === work) loading.delete(id);
  }
}

async function waitForTurn(id: number, tries = 40) {
  const clients = houseClients()!;
  for (let i = 0; i < tries; i++) {
    const raw = await clients.publicClient.readContract({
      address: WHOT,
      abi: whotAbi,
      functionName: "table",
      args: [BigInt(id)],
    });
    const table = parseTable(raw);
    if (!table) return null;
    if (table.phase_ === 4 || !isOpen(table.winner_)) return table;
    if (computerToPlay(table) || table.botPending_) return table;
    await new Promise((r) => setTimeout(r, 120));
  }
  return parseTable(
    await clients.publicClient.readContract({
      address: WHOT,
      abi: whotAbi,
      functionName: "table",
      args: [BigInt(id)],
    }),
  );
}

async function dumpDecision(id: number, table: TableView, decision: Decision) {
  const clients = houseClients()!;
  if (decision.move.type === "market") {
    const data = encodeFunctionData({ abi: whotAbi, functionName: "botMarket", args: [BigInt(id)] });
    const hash = await houseSend(WHOT, data, undefined, 2_500_000n);
    const receipt = await clients.publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
    if (receipt.status === "reverted") throw new Error("Computer market reverted.");
    handCache.delete(id);
    decisions.delete(id);
    return { card: 0, call: "Computer went market" };
  }

  const cached = await loadHand(id);
  const picked = cached?.cards[decision.move.index];
  if (!picked?.card || !isLegal(picked.card, table.top ? decodeCard(table.top) : null, table.shape, table.pickKind)) {
    throw new Error("Computer card is stale.");
  }
  const sigs = picked.att.covalidatorSignatures.map((sig) => (typeof sig === "string" ? sig : toHex(sig)));
  const data = encodeFunctionData({
    abi: whotAbi,
    functionName: "botDump",
    args: [
      BigInt(id),
      decision.move.index,
      { handle: picked.handle, value: packValue(picked.att.plaintext.value) },
      sigs,
      decision.move.nextShape,
    ],
  });
  const hash = await houseSend(WHOT, data, undefined, 3_000_000n);
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status === "reverted") throw new Error("Computer dump reverted.");
  handCache.delete(id);
  decisions.delete(id);
  const played = playedFromReceipt(receipt.logs);
  return { card: played.card || decision.card, call: played.call || decision.call };
}

export async function POST(req: Request) {
  if (!houseClients()) {
    return NextResponse.json({ error: "House bot is not configured." }, { status: 503 });
  }

  let body: {
    id?: number;
    action?: string;
    expectTop?: number;
    expectShape?: number;
    expectPickKind?: number;
    expectPick?: number;
    oppCount?: number;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Need a table." }, { status: 400 });
  }

  const action = body.action || "play";
  const clients = houseClients()!;

  try {
    if (action === "prefetch") {
      await loadHand(id);
      return NextResponse.json({ ok: true, ready: true });
    }

    const raw = await clients.publicClient.readContract({
      address: WHOT,
      abi: whotAbi,
      functionName: "table",
      args: [BigInt(id)],
    });
    const table = parseTable(raw);
    if (!table) return NextResponse.json({ error: "Table is missing." }, { status: 404 });
    if (!table.solo) return NextResponse.json({ ok: true, done: true });

    if (action === "decide") {
      const cached = await loadHand(id);
      if (!cached) return NextResponse.json({ error: "Computer hand is sealed." }, { status: 503 });
      const expect = {
        top: body.expectTop,
        shape: body.expectShape,
        pickKind: body.expectPickKind,
        pick: body.expectPick,
        oppCount: body.oppCount,
      };
      const topId = expect.top || table.top;
      const top = topId ? decodeCard(topId) : null;
      const decision = pickMove(
        cached.cards,
        top,
        expect.shape ?? 0,
        expect.pickKind ?? 0,
        expect.pick ?? 0,
        table.marketLeft,
        expect.oppCount ?? table.hand0,
      );
      decisions.set(id, decision);
      return NextResponse.json({ ok: true, card: decision.card, call: decision.call, preview: true });
    }

    if (busy.has(id)) {
      const pending = decisions.get(id);
      if (pending) return NextResponse.json({ ok: true, card: pending.card, call: pending.call, pending: true });
      return NextResponse.json({ ok: true, pending: true });
    }
    busy.add(id);

    try {
      // Browser RPC can lead house RPC by a block right after deal — wait instead of early "done".
      let live =
        table.phase_ === 3 && table.ready
          ? computerToPlay(table) || table.botPending_
            ? table
            : await waitForTurn(id)
          : await waitForTurn(id, 50);
      if (!live || live.phase_ === 4 || !isOpen(live.winner_)) {
        return NextResponse.json({ ok: true, done: true });
      }
      if (live.phase_ !== 3 || !live.ready) {
        return NextResponse.json({ ok: true, pending: true });
      }
      if (!computerToPlay(live) && !live.botPending_) {
        return NextResponse.json({ ok: true, done: true });
      }

      if (live.botPending_) {
        return NextResponse.json(await lockPending(id));
      }

      let decision = decisions.get(id);
      if (!decision || (decision.top && live.top && decision.top !== live.top)) {
        const cached = await loadHand(id);
        if (!cached) throw new Error("Computer hand is sealed.");
        const top = live.top ? decodeCard(live.top) : null;
        decision = pickMove(cached.cards, top, live.shape, live.pickKind, live.pick, live.marketLeft, live.hand0);
        decisions.set(id, decision);
      }

      try {
        const dumped = await dumpDecision(id, live, decision);
        return NextResponse.json({ ok: true, ...dumped });
      } catch {
        handCache.delete(id);
        const cached = await loadHand(id, true);
        if (!cached) throw new Error("Computer hand is sealed.");
        const top = live.top ? decodeCard(live.top) : null;
        const fresh = pickMove(cached.cards, top, live.shape, live.pickKind, live.pick, live.marketLeft, live.hand0);
        decisions.set(id, fresh);
        const dumped = await dumpDecision(id, live, fresh);
        return NextResponse.json({ ok: true, ...dumped });
      }
    } finally {
      busy.delete(id);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Computer could not dump.";
    console.error("[bot]", id, message);
    if (/already known|nonce/i.test(message)) {
      const pending = decisions.get(id);
      return NextResponse.json({ ok: true, pending: true, card: pending?.card, call: pending?.call });
    }
    return NextResponse.json({ error: message.slice(0, 180) }, { status: 500 });
  }
}

async function lockPending(id: number) {
  const clients = houseClients()!;
  let handle = ZERO;
  for (let i = 0; i < 8; i++) {
    handle = (await clients.publicClient.readContract({
      address: WHOT,
      abi: whotAbi,
      functionName: "botPackedOf",
      args: [BigInt(id)],
    })) as Hex;
    if (handle && handle !== ZERO) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!handle || handle === ZERO) {
    return { error: "Computer card is not ready yet." };
  }
  const lightning = await zap();
  const [revealed] = (await lightning.attestedReveal([handle], {
    backoffConfig: { maxRetries: 8, baseDelayInMs: 80, backoffFactor: 1.15 },
  })) as { plaintext: { value: unknown }; covalidatorSignatures: readonly (Hex | Uint8Array)[] }[];
  const sigs = revealed.covalidatorSignatures.map((sig) => (typeof sig === "string" ? sig : toHex(sig)));
  const lockData = encodeFunctionData({
    abi: whotAbi,
    functionName: "lockBot",
    args: [BigInt(id), { handle, value: packValue(revealed.plaintext.value) }, sigs],
  });
  const lockHash = await houseSend(WHOT, lockData, undefined, 3_000_000n);
  const lockReceipt = await clients.publicClient.waitForTransactionReceipt({ hash: lockHash, timeout: 90_000 });
  if (lockReceipt.status === "reverted") throw new Error("Computer dump reverted.");
  handCache.delete(id);
  decisions.delete(id);
  return { ok: true, ...playedFromReceipt(lockReceipt.logs) };
}
