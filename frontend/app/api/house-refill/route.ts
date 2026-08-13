import { NextResponse } from "next/server";
import { refillHouseIfLow } from "@/lib/house-refill";

export const runtime = "nodejs";
export const maxDuration = 60;

function allowed(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return true;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const result = await refillHouseIfLow({ force: true, drips: 15 });
  return NextResponse.json(result, { status: result.ok || result.drips > 0 ? 200 : 503 });
}

export async function POST(req: Request) {
  return GET(req);
}
