"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePublicClient, useReadContract } from "wagmi";
import { decodeEventLog, encodeFunctionData, type Address, type Hex } from "viem";
import { whotAbi } from "@/abi/whot";
import { WHOT_ADDRESS } from "@/lib/addresses";
import { ensureIncoSession, packUintAttestation, retryDecrypt } from "@/lib/inco-attestation";
import { decodeCard, decodeIndex, type WhotCard } from "@/lib/whot";
import { specialCall, rankOf } from "@/lib/whot";
import { friendlyError } from "@/lib/errors";
import { activeChain } from "@/lib/network";
import { useGameAccount } from "@/hooks/useGameAccount";
import { publicRpc } from "@/lib/game-account";
import { computerToPlay, isOpen, parseTable, type TableView } from "@/lib/table-view";
import { parseTableCode, tableCode, tableHref } from "@/lib/table-code";

type BotBody = {
  error?: string;
  card?: number;
  call?: string;
  pending?: boolean;
  done?: boolean;
  preview?: boolean;
};

async function botRequest(payload: Record<string, unknown>, ms = 20_000): Promise<BotBody & { ok: boolean }> {
  const res = await fetch("/api/bot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(ms),
  });
  const body = (await res.json().catch(() => ({}))) as BotBody;
  return { ok: res.ok, ...body };
}

function keepsTurn(rank: number) {
  return rank === 1 || rank === 8 || rank === 14;
}

function specialCallFromTop(topId: number) {
  return specialCall(rankOf(topId)) || "Computer";
}

export { WHOT_ADDRESS };
export type { TableView };

const FALLBACK_DEAL_FEE = 150_000_000_000_000n;
const SHUFFLE_GAS = 3_000_000n;
const BOT_GAS = 4_000_000n;
const MOVE_GAS = 2_500_000n;
const GAS_CAP = 6_000_000n;
const FEE_FLOOR = {
  maxFeePerGas: 100_000_000n, // 0.1 gwei
  maxPriorityFeePerGas: 10_000_000n,
};

export type LastPlay = {
  key: number;
  who: "me" | "opp";
  card: WhotCard | null;
  call: string;
};

let writeChain: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function feeCaps() {
  try {
    const fees = await publicRpc().estimateFeesPerGas();
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

async function freshNonce(address: Address): Promise<number> {
  const n = await publicRpc().getTransactionCount({ address, blockTag: "pending" });
  return Number(n);
}

type PackedAtt = ReturnType<typeof packUintAttestation>;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export { tableCode, parseTableCode, tableHref };

export function useWhot(tableId: number) {
  const gameAccount = useGameAccount();
  const { address, isConnected, wallet, funding } = gameAccount;
  const publicClient = usePublicClient();
  const walletClient = wallet;

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [myCards, setMyCards] = useState<(WhotCard & { handle: Hex })[]>([]);
  const [peeking, setPeeking] = useState(false);
  const [lastCall, setLastCall] = useState("");
  const [lastPlayed, setLastPlayed] = useState<LastPlay | null>(null);
  const botLock = useRef(false);
  const botKickKey = useRef("");
  const openerLock = useRef(false);
  const openerKickKey = useRef("");
  const settleKickKey = useRef("");
  const peekLock = useRef(false);
  const peekDirty = useRef(false);
  const peekedKey = useRef("");
  const myCardsRef = useRef<(WhotCard & { handle: Hex })[]>([]);
  const [pendingDraw, setPendingDraw] = useState(0);
  const attCache = useRef(new Map<string, PackedAtt>());
  const fundedRef = useRef(false);
  const seenTop = useRef(0);

  const enabled = Boolean(WHOT_ADDRESS) && tableId > 0;
  const id = BigInt(tableId || 0);

  const tableQuery = useReadContract({
    address: WHOT_ADDRESS,
    abi: whotAbi,
    functionName: "table",
    args: [id],
    query: {
      enabled,
      refetchInterval: (q) => {
        const t = parseTable(q.state.data);
        if (t?.phase_ === 2 && !t.ready) return 1_200;
        if (t?.marketEnd_ && t.phase_ === 3) return 1_200;
        if (t?.solo && t.phase_ === 3 && t.turn_ === 1 && !t.marketEnd_ && isOpen(t.winner_)) return 700;
        return 3_500;
      },
    },
  });

  const feeQuery = useReadContract({
    address: WHOT_ADDRESS,
    abi: whotAbi,
    functionName: "dealFee",
    query: { enabled: Boolean(WHOT_ADDRESS) },
  });

  const openerQuery = useReadContract({
    address: WHOT_ADDRESS,
    abi: whotAbi,
    functionName: "openerOf",
    args: [id],
    query: { enabled, refetchInterval: 2_000 },
  });

  const botPackedQuery = useReadContract({
    address: WHOT_ADDRESS,
    abi: whotAbi,
    functionName: "botPackedOf",
    args: [id],
    query: { enabled },
  });

  const table = useMemo(() => parseTable(tableQuery.data), [tableQuery.data]);
  myCardsRef.current = myCards;
  const dealFee = (feeQuery.data as bigint | undefined) ?? 0n;
  const botPackedHandle = botPackedQuery.data as Hex | undefined;

  const seat = useMemo(() => {
    if (!address || !table) return -1;
    if (address.toLowerCase() === table.p0?.toLowerCase()) return 0;
    if (address.toLowerCase() === table.p1?.toLowerCase()) return 1;
    return -1;
  }, [address, table]);

  const myTurn = Boolean(
    address && table?.toPlay && table.toPlay.toLowerCase() === address.toLowerCase(),
  );

  const refetch = useCallback(async () => {
    await Promise.all([tableQuery.refetch(), openerQuery.refetch(), botPackedQuery.refetch()]);
  }, [tableQuery, openerQuery, botPackedQuery]);

  const prepare = useCallback(async (needSession = false) => {
    if (walletClient?.account && fundedRef.current) {
      if (needSession) await ensureIncoSession(walletClient);
      return walletClient;
    }
    setStatus("Opening the table…");
    const session = await gameAccount.ensureReady(dealFee + 600_000_000_000_000n);
    fundedRef.current = true;
    if (needSession) {
      setStatus("Opening sealed hand…");
      await ensureIncoSession(session.wallet);
    }
    return session.wallet;
  }, [gameAccount, dealFee, walletClient]);

  const writeWhot = useCallback(
    async (functionName: string, args?: readonly unknown[], value?: bigint) => {
      return enqueueWrite(async () => {
        const client = await prepare(false);
        const shuffle = functionName === "openSolo" || functionName === "joinAndDeal";
        const bot = functionName === "botThink";
        if (shuffle) setStatus("Shuffling the pack on-chain…");
        else if (bot) setStatus("Computer picking a card…");
        const from = (client.account?.address || address) as Address | undefined;
        if (!from) throw new Error("Table account is not ready.");

        const data = encodeFunctionData({
          abi: whotAbi,
          functionName: functionName as never,
          ...(args ? { args: args as never } : {}),
        });
        let gas = shuffle ? SHUFFLE_GAS : bot ? BOT_GAS : MOVE_GAS;
        try {
          const est = await withTimeout(
            publicRpc().estimateGas({ account: from, to: WHOT_ADDRESS, data, value }),
            8_000,
            "gas",
          );
          const padded = (est * 130n) / 100n;
          gas = padded < 1_500_000n ? 1_500_000n : padded > GAS_CAP ? GAS_CAP : padded;
        } catch {
          /* keep the function default */
        }

        const fees = await feeCaps();
        const payload = {
          to: WHOT_ADDRESS,
          data,
          value,
          chain: activeChain,
          account: client.account,
          gas,
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        };

        const sendOnce = async (nonce: number) =>
          (await withTimeout(
            client.sendTransaction({ ...payload, nonce }),
            25_000,
            "The table transaction is taking too long. Tap again.",
          )) as Hex;

        let nonce = await withTimeout(freshNonce(from), 8_000, "Could not read nonce.");
        try {
          return await sendOnce(nonce);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/already known|replacement|nonce too low/i.test(msg)) {
            // A prior tap likely already broadcast. Wait for it to clear, then
            // either reuse the cleared lane or continue with the next nonce.
            await sleep(2_500);
            const pending = await freshNonce(from);
            if (pending > nonce) {
              throw new Error("Previous move is confirming. Wait a moment, then tap again.");
            }
            return await sendOnce(pending);
          }
          if (!/internal|timeout|dropped|rpc/i.test(msg)) throw err;
          await sleep(800);
          nonce = await freshNonce(from);
          return await sendOnce(nonce);
        }
      });
    },
    [prepare, address],
  );

  const waitTx = useCallback(async (hash: Hex, timeout = 75_000) => {
    const receipt = await publicRpc().waitForTransactionReceipt({
      hash,
      timeout,
      pollingInterval: 600,
    });
    if (receipt.status === "reverted") {
      throw new Error("That move reverted on-chain. Try again.");
    }
    return receipt;
  }, []);

  const peekHand = useCallback(async (force = false): Promise<boolean> => {
    if (!address || !WHOT_ADDRESS || !publicClient || tableId <= 0) return false;
    if (peekLock.current) {
      peekDirty.current = true;
      return false;
    }
    peekLock.current = true;
    setPeeking(true);
    let opened = false;
    try {
      const client = walletClient ?? (await prepare(true));
      if (!client) return false;

      for (let attempt = 0; attempt < 8 && !opened; attempt++) {
        if (attempt > 0) await sleep(320 + attempt * 180);
        try {
          const handles = (await publicClient.readContract({
            address: WHOT_ADDRESS,
            abi: whotAbi,
            functionName: "getHandHandles",
            args: [BigInt(tableId), address],
          })) as Hex[];
          if (handles.length === 0) {
            setMyCards([]);
            peekedKey.current = "";
            setPendingDraw(0);
            setError(null);
            opened = true;
            break;
          }
          const key = handles.join(",").toLowerCase();
          const known = new Map(myCardsRef.current.map((c) => [c.handle.toLowerCase(), c]));
          if (!force && key === peekedKey.current && myCardsRef.current.length === handles.length) {
            setPendingDraw(0);
            opened = true;
            break;
          }

          const missing = handles.filter((h) => !known.has(h.toLowerCase()));
          if (missing.length > 0) {
            const results = await retryDecrypt(client, missing, address);
            results.forEach((r, i) => {
              const raw = r.plaintext.value;
              const idx = typeof raw === "bigint" ? Number(raw) : Number(raw);
              const handle = missing[i]!;
              attCache.current.set(handle.toLowerCase(), packUintAttestation(r));
              known.set(handle.toLowerCase(), { ...decodeIndex(idx), handle });
            });
          }

          const next = handles
            .map((h) => known.get(h.toLowerCase()))
            .filter(Boolean) as (WhotCard & { handle: Hex })[];
          if (next.length !== handles.length) continue;
          peekedKey.current = key;
          setMyCards(next);
          setPendingDraw(0);
          setError(null);
          opened = true;
        } catch (err) {
          if (attempt === 7) setError(friendlyError(err));
        }
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      peekLock.current = false;
      setPeeking(false);
    }
    if (peekDirty.current) {
      peekDirty.current = false;
      return peekHand(force);
    }
    return opened;
  }, [address, walletClient, publicClient, tableId, prepare]);

  const myHandCount = seat === 0 ? (table?.hand0 ?? 0) : seat === 1 ? (table?.hand1 ?? 0) : 0;
  const sealedPending = Math.max(0, pendingDraw, myHandCount - myCards.length);

  useEffect(() => {
    if (seat < 0 || !table || table.phase_ < 2 || !walletClient) return;
    const want = seat === 0 ? table.hand0 : table.hand1;
    if (want <= 0) return;
    if (myCards.length >= want && peekedKey.current) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      await peekHand(true);
      if (stop) return;
      if (myCardsRef.current.length < want) timer = setTimeout(() => void tick(), 700);
    };
    timer = setTimeout(() => void tick(), 200);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [seat, table?.phase_, table?.hand0, table?.hand1, table?.marketLeft, myCards.length, peekHand, walletClient]);

  const findActiveSolo = useCallback(async (player: Address) => {
    const rpc = publicRpc();
    const latest = Number(
      (await rpc.readContract({
        address: WHOT_ADDRESS,
        abi: whotAbi,
        functionName: "nextTableId",
      })) as bigint,
    );
    for (let n = latest; n >= 1 && n >= latest - 8; n--) {
      try {
        const raw = await rpc.readContract({
          address: WHOT_ADDRESS,
          abi: whotAbi,
          functionName: "table",
          args: [BigInt(n)],
        });
        const view = parseTable(raw);
        if (
          view?.solo &&
          view.p0.toLowerCase() === player.toLowerCase() &&
          view.phase_ >= 2 &&
          view.phase_ < 4 &&
          isOpen(view.winner_)
        ) {
          return n;
        }
      } catch {
        /* empty / missing table */
      }
    }
    return 0;
  }, []);

  const lockOpener = useCallback(async (forceId?: number) => {
    const target = forceId && forceId > 0 ? forceId : tableId;
    if (!WHOT_ADDRESS || target <= 0) return;
    if (openerLock.current) return;
    openerLock.current = true;
    setError(null);
    setStatus("Turning the opener face-up…");
    try {
      const res = await fetch("/api/opener", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: target }),
        signal: AbortSignal.timeout(55_000),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; pending?: boolean; done?: boolean };
      if (body.pending) {
        setStatus("Waiting on the opener…");
        return;
      }
      if (!res.ok && !body.done) throw new Error(body.error || "Could not turn the opener.");
      await refetch();
    } catch (err) {
      await refetch();
      const msg = friendlyError(err);
      if (!/wrongphase|already/i.test(msg)) setError(msg);
    } finally {
      openerLock.current = false;
      setStatus("");
    }
  }, [refetch, tableId]);

  const settleMarket = useCallback(async () => {
    if (!WHOT_ADDRESS || tableId <= 0) return;
    if (openerLock.current) return;
    openerLock.current = true;
    setError(null);
    setStatus("Counting the ranks in each hand…");
    try {
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: tableId }),
        signal: AbortSignal.timeout(90_000),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        pending?: boolean;
        done?: boolean;
      };
      if (body.pending) {
        setStatus("Still counting hands…");
        return;
      }
      if (!res.ok && !body.done) throw new Error(body.error || "Could not count the hands.");
      await refetch();
    } catch (err) {
      await refetch();
      const msg = friendlyError(err);
      if (!/wrongphase|already|settling/i.test(msg)) setError(msg);
    } finally {
      openerLock.current = false;
      setStatus("");
    }
  }, [refetch, tableId]);

  useEffect(() => {
    if (table?.phase_ !== 2 || table.ready) {
      openerKickKey.current = "";
      return;
    }
    const key = `${tableId}:opener`;
    if (openerKickKey.current === key) return;
    openerKickKey.current = key;
    const t = setTimeout(() => void lockOpener(), 200);
    return () => clearTimeout(t);
  }, [table?.phase_, table?.ready, tableId, lockOpener]);

  useEffect(() => {
    if (!table?.marketEnd_ || table.phase_ !== 3) {
      if (table?.phase_ === 4) settleKickKey.current = "";
      return;
    }
    const key = `${tableId}:settle`;
    if (settleKickKey.current === key) return;
    settleKickKey.current = key;
    const t = setTimeout(() => void settleMarket(), 250);
    return () => clearTimeout(t);
  }, [table?.marketEnd_, table?.phase_, tableId, settleMarket]);

  const openSolo = useCallback(async () => {
    if (!WHOT_ADDRESS) return 0;
    if (!gameAccount.signedIn) {
      gameAccount.requestLogin();
      setError("Sign in with email or a wallet before you sit.");
      return 0;
    }
    if (busy) return 0;
    setBusy(true);
    setError(null);
    setStatus("Setting the table…");
    try {
      if (address) {
        setStatus("Looking for your open table…");
        const existing = await withTimeout(findActiveSolo(address), 8_000, "table lookup timed out").catch(() => 0);
        if (existing > 0) {
          await lockOpener(existing);
          return existing;
        }
      }

      let fee = dealFee;
      if (fee === 0n) {
        setStatus("Reading the shuffle fee…");
        try {
          fee = (await withTimeout(
            publicRpc().readContract({
              address: WHOT_ADDRESS,
              abi: whotAbi,
              functionName: "dealFee",
            }),
            6_000,
            "fee lookup timed out",
          )) as bigint;
        } catch {
          fee = FALLBACK_DEAL_FEE;
        }
      }
      const hash = await writeWhot("openSolo", undefined, fee);
      setStatus("Waiting for the deal to land…");
      const receipt = await publicRpc().waitForTransactionReceipt({
        hash,
        timeout: 90_000,
        pollingInterval: 2_000,
      });
      if (receipt.status === "reverted") {
        throw new Error("The deal reverted on-chain. Try play again.");
      }
      for (const log of receipt.logs) {
        try {
          const parsed = decodeEventLog({ abi: whotAbi, data: log.data, topics: log.topics });
          if (parsed.eventName === "SoloOpened" || parsed.eventName === "Dealt") {
            const created = Number((parsed.args as { id: bigint }).id);
            await lockOpener(created);
            return created;
          }
        } catch {
          /* skip */
        }
      }
      const latest = await publicRpc().readContract({
        address: WHOT_ADDRESS,
        abi: whotAbi,
        functionName: "nextTableId",
      });
      const created = Number(latest);
      await lockOpener(created);
      return created;
    } catch (err) {
      setError(friendlyError(err));
      return 0;
    } finally {
      setBusy(false);
      setStatus("");
    }
  }, [writeWhot, dealFee, address, findActiveSolo, lockOpener, gameAccount.signedIn, gameAccount.requestLogin, busy]);

  const openTable = useCallback(async () => {
    if (!WHOT_ADDRESS || !publicClient) return 0;
    if (!gameAccount.signedIn) {
      gameAccount.requestLogin();
      setError("Sign in with email or a wallet before you sit.");
      return 0;
    }
    setBusy(true);
    setError(null);
    try {
      const hash = await writeWhot("openTable");
      const receipt = await publicRpc().waitForTransactionReceipt({ hash, timeout: 90_000, pollingInterval: 2_000 });
      for (const log of receipt.logs) {
        try {
          const parsed = decodeEventLog({ abi: whotAbi, data: log.data, topics: log.topics });
          if (parsed.eventName === "TableOpened") {
            return Number((parsed.args as { id: bigint }).id);
          }
        } catch {
          /* skip */
        }
      }
      const latest = await publicClient.readContract({
        address: WHOT_ADDRESS,
        abi: whotAbi,
        functionName: "nextTableId",
      });
      return Number(latest);
    } catch (err) {
      setError(friendlyError(err));
      return 0;
    } finally {
      setBusy(false);
      setStatus("");
    }
  }, [writeWhot, publicClient, gameAccount.signedIn, gameAccount.requestLogin]);

  const cancelTable = useCallback(async () => {
    if (!WHOT_ADDRESS || tableId <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await writeWhot("cancelTable", [id]);
      await publicClient?.waitForTransactionReceipt({ hash, timeout: 90_000 });
      await refetch();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }, [writeWhot, publicClient, refetch, tableId, id]);

  const joinAndDeal = useCallback(async () => {
    if (!WHOT_ADDRESS || tableId <= 0) return;
    if (!gameAccount.signedIn) {
      gameAccount.requestLogin();
      setError("Sign in with email or a wallet before you sit.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const hash = await writeWhot("joinAndDeal", [id], dealFee);
      await publicClient?.waitForTransactionReceipt({ hash, timeout: 120_000 });
      await refetch();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }, [writeWhot, publicClient, refetch, dealFee, tableId, id, gameAccount.signedIn, gameAccount.requestLogin]);

  useEffect(() => {
    seenTop.current = 0;
    setLastPlayed(null);
    setLastCall("");
  }, [tableId]);

  useEffect(() => {
    if (!table?.top) return;
    if (seenTop.current === 0) {
      seenTop.current = table.top;
      return;
    }
    if (table.top === seenTop.current) return;
    setLastPlayed((prev) => {
      if (prev?.who === "me" && prev.card) {
        seenTop.current = table.top;
        return prev;
      }
      if (prev?.card?.id === table.top) {
        seenTop.current = table.top;
        return prev;
      }
      // Prefer the settled on-chain card over an optimistic computer preview.
      seenTop.current = table.top;
      const call =
        prev?.who === "opp" && prev.call && prev.call !== "Computer"
          ? prev.call
          : specialCallFromTop(table.top);
      return { key: Date.now(), who: "opp", card: decodeCard(table.top), call };
    });
  }, [table?.top]);

  useEffect(() => {
    if (seat < 0 || !table?.solo || table.phase_ < 2 || !isOpen(table.winner_)) return;
    void botRequest({ id: tableId, action: "prefetch" }, 45_000).catch(() => undefined);
  }, [seat, tableId, table?.solo, table?.phase_, table?.ready, table?.winner_, table?.hand1, table?.turn_]);

  const runBot = useCallback(
    async (force = false) => {
      if (!WHOT_ADDRESS || tableId <= 0) return;
      if (!force && !computerToPlay(table)) return;
      if (botLock.current) return;
      botLock.current = true;
      setError(null);
      setStatus("Computer…");
      try {
        for (let attempt = 0; attempt < 6; attempt++) {
          const body = await botRequest({ id: tableId, action: "play" }, 55_000);
          if (body.pending) {
            setStatus("Computer…");
            await sleep(280);
            continue;
          }
          if (!body.ok) throw new Error(body.error || "Computer failed to move.");
          if (body.done) {
            await refetch();
            return;
          }
          if (body.card) {
            const played: LastPlay = {
              key: Date.now(),
              who: "opp",
              card: decodeCard(body.card),
              call: body.call || "Computer",
            };
            setLastCall(played.call);
            setLastPlayed(played);
            seenTop.current = body.card;
          } else if (body.call) {
            setLastCall(body.call);
            setLastPlayed({ key: Date.now(), who: "opp", card: null, call: body.call });
          }
          await refetch();
          void peekHand();
          return;
        }
      } catch (err) {
        await refetch();
        setError(friendlyError(err));
      } finally {
        botLock.current = false;
        setStatus("");
      }
    },
    [table, tableId, refetch, peekHand],
  );

  useEffect(() => {
    if (seat < 0 || !computerToPlay(table)) {
      if (!computerToPlay(table)) botKickKey.current = "";
      return;
    }
    const key = `${tableId}:${table?.turn_}:${table?.hand1}:${table?.botPending_ ? 1 : 0}`;
    if (botKickKey.current === key) return;
    botKickKey.current = key;
    void runBot(true);
  }, [seat, tableId, table, runBot]);

  const decideComputer = useCallback(
    async (expectTop: number, expectShape: number, expectPickKind: number, expectPick: number, oppCount: number) => {
      // Warm the house decision cache only — UI waits for the confirmed play.
      await botRequest(
        {
          id: tableId,
          action: "decide",
          expectTop,
          expectShape,
          expectPickKind,
          expectPick,
          oppCount,
        },
        8_000,
      );
    },
    [tableId],
  );

  const playCardOnChain = useCallback(
    async (index: number, nextShape: number) => {
      if (!WHOT_ADDRESS || !myCards[index] || tableId <= 0) return;
      if (pendingDraw > 0 || myCards.length < myHandCount) return;
      const card = myCards[index]!;
      const kept = myCards.filter((_, i) => i !== index);
      setMyCards(kept);
      setLastPlayed({ key: Date.now(), who: "me", card, call: "" });
      setBusy(true);
      setError(null);
      setStatus("");
      const pass = table?.solo && !keepsTurn(card.rank);
      const decideP = pass
        ? decideComputer(
            card.id,
            card.rank === 20 ? nextShape : 0,
            card.rank === 2 ? 2 : card.rank === 5 ? 5 : 0,
            card.rank === 2 ? 2 : card.rank === 5 ? 3 : 0,
            kept.length,
          ).catch(() => undefined)
        : null;
      try {
        let packed = attCache.current.get(card.handle.toLowerCase());
        if (!packed) {
          const client = walletClient ?? (await prepare(true));
          const [dec] = await retryDecrypt(client, [card.handle], address);
          packed = packUintAttestation(dec);
          attCache.current.set(card.handle.toLowerCase(), packed);
        }
        const hash = await writeWhot("play", [id, index, packed.attestation, packed.signatures, nextShape]);
        const receipt = await waitTx(hash);
        if (pass) void runBot(true);
        for (const log of receipt.logs) {
          try {
            const parsed = decodeEventLog({ abi: whotAbi, data: log.data, topics: log.topics });
            if (parsed.eventName === "CardPlayed") {
              setLastCall(String((parsed.args as { call?: string }).call || ""));
            }
          } catch {
            /* skip */
          }
        }
        peekedKey.current = "";
        await refetch();
        void peekHand();
        setBusy(false);
        void decideP;
      } catch (err) {
        setMyCards((prev) => {
          const next = prev.slice();
          next.splice(index, 0, card);
          return next;
        });
        seenTop.current = table?.top || 0;
        setLastPlayed(null);
        setError(friendlyError(err));
        setBusy(false);
      }
    },
    [
      walletClient,
      myCards,
      address,
      writeWhot,
      prepare,
      waitTx,
      refetch,
      peekHand,
      tableId,
      id,
      runBot,
      table?.solo,
      table?.top,
      decideComputer,
      pendingDraw,
      myHandCount,
    ],
  );

  const goMarket = useCallback(async () => {
    if (!WHOT_ADDRESS || tableId <= 0) return;
    const draw = Math.max(1, table?.pick || 1);
    const before = myCardsRef.current.length;
    setBusy(true);
    setError(null);
    setPendingDraw(draw);
    setStatus(draw > 1 ? `Taking ${draw} from the market…` : "Going market…");
    try {
      const decideP = table?.solo
        ? decideComputer(table.top, table.shape, 0, 0, before + draw).catch(() => undefined)
        : null;
      const hash = await writeWhot("goMarket", [id]);
      await waitTx(hash);
      setLastCall(draw > 1 ? `Picked ${draw}` : "Market");
      await refetch();
      await peekHand(true);
      for (let i = 0; i < 8 && myCardsRef.current.length < before + draw; i++) {
        await sleep(400);
        await peekHand(true);
      }
      setPendingDraw((n) => (myCardsRef.current.length >= before + draw ? 0 : n));
      setStatus("");
      setBusy(false);
      void runBot(true);
      void decideP;
    } catch (err) {
      setPendingDraw(0);
      setError(friendlyError(err));
      setBusy(false);
      setStatus("");
    }
  }, [writeWhot, waitTx, refetch, peekHand, tableId, id, runBot, table?.solo, table?.top, table?.shape, table?.pick, decideComputer]);

  return {
    address,
    isConnected,
    configured: Boolean(WHOT_ADDRESS),
    table,
    dealFee,
    seat,
    myTurn,
    myCards,
    peeking,
    sealedPending,
    status,
    busy: busy || funding,
    error,
    lastCall,
    lastPlayed,
    openSolo,
    openTable,
    cancelTable,
    joinAndDeal,
    playCard: playCardOnChain,
    nudgeComputer: () => runBot(true),
    goMarket,
    peekHand,
    opponentCount: seat === 0 ? (table?.hand1 ?? 0) : seat === 1 ? (table?.hand0 ?? 0) : 0,
    missing: enabled && tableQuery.isError,
    loading: enabled && tableQuery.isPending,
  };
}
