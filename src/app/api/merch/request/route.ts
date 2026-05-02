import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      size?: string;
      notes?: string;
    };
    const email = body.email?.trim().toLowerCase() ?? "";
    const size = body.size?.trim() || "M";
    const notes = body.notes?.trim() ?? "";

    if (!isEmail(email)) {
      return NextResponse.json({ error: "valid email required" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const notifyTo = process.env.MERCH_NOTIFY_EMAIL;

    if (apiKey && notifyTo) {
      const resend = new Resend(apiKey);
      const from = process.env.RESEND_FROM ?? "Traffic Slop <onboarding@resend.dev>";
      await resend.emails.send({
        from,
        to: notifyTo,
        subject: "Traffic Slop tee request",
        html: `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif">
          <h1>Traffic Slop tee request</h1>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Size:</strong> ${escapeHtml(size)}</p>
          <p><strong>Notes:</strong> ${escapeHtml(notes || "None")}</p>
          <p>Tell them to Venmo PeterMignacca with text "SLOP" to order.</p>
        </body></html>`,
      });
    }

    return NextResponse.json({
      ok: true,
      instructions: 'Venmo PeterMignacca with text "SLOP" to order.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "request failed" },
      { status: 500 },
    );
  }
}
