import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  toEmail?: string;
  fromName?: string;
  tableCode?: string;
  link?: string;
};

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY || "";
  const from = process.env.INVITE_FROM_EMAIL || "WHOT <onboarding@resend.dev>";

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const toEmail = String(body.toEmail || "")
    .trim()
    .toLowerCase();
  const fromName = String(body.fromName || "A WHOT player").slice(0, 40);
  const code = String(body.tableCode || "").slice(0, 12);
  const link = String(body.link || "").slice(0, 300);

  if (!toEmail.includes("@") || !code || !link) {
    return NextResponse.json({ error: "Need email, code, and link." }, { status: 400 });
  }

  if (!key) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      message: "Email delivery is not configured.",
    });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [toEmail],
      subject: `${fromName} invited you to a WHOT table`,
      html: `<p><strong>${fromName}</strong> wants you at table <code>${code}</code>.</p>
<p><a href="${link}">Sit at the table</a></p>
<p>Or open WHOT and enter code <strong>${code}</strong>.</p>`,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err.slice(0, 180) || "Could not send email." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
