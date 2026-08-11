import { NextResponse } from "next/server";

const PRIMARY =
  process.env.HOUSE_RPC_URL ||
  process.env.BASE_SEPOLIA_RPC_URL ||
  "";
const FALLBACKS = [
  "https://sepolia.base.org",
  "https://base-sepolia-rpc.publicnode.com",
];

function methodsOf(body: string): string[] {
  try {
    const parsed = JSON.parse(body) as { method?: string } | { method?: string }[];
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((item) => item.method || "unknown");
  } catch {
    return ["unknown"];
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

function shouldFailover(err: { code?: number; message?: string } | null) {
  if (!err) return false;
  const msg = err.message || "";
  if (/gas limit too high|intrinsic gas|nonce too low|insufficient funds/i.test(msg)) return false;
  return err.code === -32603 || /internal|timeout|429|rate.?limit/i.test(msg);
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
  const urls = [PRIMARY, ...FALLBACKS].filter((u, i, a) => u && a.indexOf(u) === i);

  let lastText = "";
  for (const url of urls) {
    try {
      const text = await forward(url, body, url === PRIMARY ? 15_000 : 12_000);
      const err = errorInfo(text);
      if (err && shouldFailover(err)) {
        lastText = text;
        continue;
      }
      return new NextResponse(text, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (err) {
      lastText = JSON.stringify({
        jsonrpc: "2.0",
        error: { message: err instanceof Error ? err.message : "rpc unavailable", code: -32603 },
      });
    }
  }

  console.warn("[rpc] failed", methods.join(","), errorInfo(lastText)?.message || lastText.slice(0, 120));
  return new NextResponse(lastText || JSON.stringify({ jsonrpc: "2.0", error: { message: "rpc unavailable" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
