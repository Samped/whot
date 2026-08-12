import { NextResponse } from "next/server";
import { CDP_PROJECT_ID } from "@/lib/cdp";

const CDP_BASE = "https://api.cdp.coinbase.com/platform";

type SendBody = { action: "send"; email: string };
type VerifyBody = { action: "verify"; flowId: string; otp: string; verifyUrl?: string };
type Body = SendBody | VerifyBody;

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

async function cdpJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, data };
}

export async function POST(req: Request) {
  if (!CDP_PROJECT_ID) {
    return bad("Email sign-in is not configured on this deployment.", 503);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Bad request.");
  }

  if (body.action === "send") {
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    if (!email.includes("@") || email.length > 254) {
      return bad("Enter a valid email address.");
    }

    const { res, data } = await cdpJson(
      `${CDP_BASE}/v2/embedded-wallet-api/projects/${CDP_PROJECT_ID}/auth/init`,
      { type: "email", email },
    );

    if (!res.ok) {
      const msg =
        (typeof data.message === "string" && data.message) ||
        (typeof data.error === "string" && data.error) ||
        "Base would not send a code right now.";
      return bad(msg, res.status >= 500 ? 502 : res.status);
    }

    const flowId = String(data.flowId || "");
    if (!flowId) return bad("Base did not start the code. Try again.", 502);

    const next = data.nextStep as { url?: string } | undefined;
    return NextResponse.json({
      ok: true,
      flowId,
      verifyUrl: typeof next?.url === "string" ? next.url : undefined,
      message: typeof data.message === "string" ? data.message : "Check your inbox.",
    });
  }

  if (body.action === "verify") {
    const flowId = String(body.flowId || "").trim();
    const otp = String(body.otp || "")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!flowId) return bad("Ask for a new code.");
    if (otp.length !== 6) return bad("Enter the six digits from the letter.");

    const payload = { flowId, otp };
    const candidates = [
      body.verifyUrl,
      `${CDP_BASE}/v2/embedded-wallet-api/verify/email`,
      `${CDP_BASE}/v2/embedded-wallet-api/projects/${CDP_PROJECT_ID}/auth/verify/email`,
    ].filter((u): u is string => Boolean(u));

    let lastError = "That code did not work.";
    for (const url of candidates) {
      const { res, data } = await cdpJson(url, payload);
      if (res.ok) {
        const endUser = data.endUser as
          | {
              evmAccounts?: string[];
              evmAccountObjects?: { address?: string }[];
            }
          | undefined;
        const evm =
          endUser?.evmAccountObjects?.[0]?.address ||
          endUser?.evmAccounts?.[0] ||
          undefined;
        return NextResponse.json({
          ok: true,
          email: typeof data.email === "string" ? data.email : undefined,
          evmAddress: evm,
        });
      }
      lastError =
        (typeof data.message === "string" && data.message) ||
        (typeof data.error === "string" && data.error) ||
        lastError;
      if (res.status !== 401 && res.status !== 404) break;
    }

    return bad(lastError, 401);
  }

  return bad("Unknown action.");
}
