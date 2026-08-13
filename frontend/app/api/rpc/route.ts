import { NextResponse } from "next/server";
import { keccak256, type Hex } from "viem";

const PRIMARY =
  process.env.HOUSE_RPC_URL ||
  process.env.BASE_SEPOLIA_RPC_URL ||
  "";
const FALLBACKS = [
  "https://sepolia.base.org",
  "https://base-sepolia-rpc.publicnode.com",
];

type RpcReq = { jsonrpc?: string; id?: unknown; method?: string; params?: unknown[] };

function parseBody(body: string): RpcReq | RpcReq[] | null {
  try {
    return JSON.parse(body) as RpcReq | RpcReq[];
  } catch {
    return null;
  }
}

function methodsOf(body: string): string[] {
  const parsed = parseBody(body);
  if (!parsed) return ["unknown"];
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map((item) => item.method || "unknown");
}

function isSendRaw(body: string) {
  return methodsOf(body).some((m) => m === "eth_sendRawTransaction");
}

function requestId(body: string): unknown {
  const parsed = parseBody(body);
  if (!parsed) return 1;
  const req = Array.isArray(parsed) ? parsed[0] : parsed;
  return req?.id ?? 1;
}

/** eth_sendRawTransaction params[0] → tx hash. Used when RPC says "already known". */
function rawTxHash(body: string): Hex | null {
  const parsed = parseBody(body);
  if (!parsed) return null;
  const req = Array.isArray(parsed) ? parsed[0] : parsed;
  if (req?.method !== "eth_sendRawTransaction") return null;
  const raw = req.params?.[0];
  if (typeof raw !== "string" || !raw.startsWith("0x")) return null;
  try {
    return keccak256(raw as Hex);
  } catch {
    return null;
  }
}

function errorInfo(text: string): { code?: number; message?: string } | null {
  try {
    const parsed = JSON.parse(text) as { error?: { code?: number; message?: string } } | unknown[];
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      const err = (item as { error?: { code?: number; message?: string } }).error;
      if (err) return err;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function alreadyKnown(err: { code?: number; message?: string } | null) {
  const msg = err?.message || "";
  return /already known|known transaction|nonce too low/i.test(msg);
}

function shouldFailover(err: { code?: number; message?: string } | null) {
  if (!err) return false;
  const msg = err.message || "";
  if (/gas limit too high|intrinsic gas|nonce too low|insufficient funds|already known|known transaction/i.test(msg)) {
    return false;
  }
  return err.code === -32603 || /internal|timeout|429|rate.?limit/i.test(msg);
}

function okHash(body: string, hash: Hex) {
  return JSON.stringify({ jsonrpc: "2.0", id: requestId(body), result: hash });
}

async function forward(url: string, body: string, ms: number) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal: AbortSignal.timeout(ms),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  return text;
}

export async function POST(req: Request) {
  const body = await req.text();
  const methods = methodsOf(body);
  const sendRaw = isSendRaw(body);
  const urls = [PRIMARY, ...FALLBACKS].filter((u, i, a) => u && a.indexOf(u) === i);

  let lastText = "";
  let timedOutAfterSubmit = false;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    try {
      const text = await forward(url, body, url === PRIMARY ? 15_000 : 12_000);
      const err = errorInfo(text);

      // Same raw tx already in the mempool (often from a timed-out first hop).
      if (err && sendRaw && alreadyKnown(err)) {
        const hash = rawTxHash(body);
        if (hash) {
          return new NextResponse(okHash(body, hash), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      }

      if (err && shouldFailover(err)) {
        lastText = text;
        // Never re-broadcast a signed tx to another RPC — it causes "already known".
        if (sendRaw) break;
        continue;
      }

      return new NextResponse(text, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (err) {
      timedOutAfterSubmit = sendRaw;
      lastText = JSON.stringify({
        jsonrpc: "2.0",
        id: requestId(body),
        error: { message: err instanceof Error ? err.message : "rpc unavailable", code: -32603 },
      });
      // Timed out after possibly accepting eth_sendRawTransaction — do not resubmit.
      if (sendRaw) break;
    }
  }

  if (sendRaw && (timedOutAfterSubmit || alreadyKnown(errorInfo(lastText)))) {
    const hash = rawTxHash(body);
    if (hash) {
      return new NextResponse(okHash(body, hash), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
  }

  console.warn("[rpc] failed", methods.join(","), errorInfo(lastText)?.message || lastText.slice(0, 120));
  return new NextResponse(lastText || JSON.stringify({ jsonrpc: "2.0", error: { message: "rpc unavailable" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
