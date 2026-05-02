import { Resend } from "resend";

export async function sendCommuteEmail(options: {
  to: string;
  items: { label: string; url: string; at: string }[];
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not set");
  }
  const resend = new Resend(key);
  const from = process.env.RESEND_FROM ?? "Caught <onboarding@resend.dev>";

  const rows = options.items
    .map(
      (i) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee">${i.at}</td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(i.label)}</td><td style="padding:8px;border-bottom:1px solid #eee"><a href="${i.url}">open</a></td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#faf6ef;padding:24px;color:#1a1f2e">
  <h1 style="color:#0b3b8c">Your commute</h1>
  <p>${options.items.length} traffic-cam frames from Caught.</p>
  <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden">${rows}</table>
  <p style="margin-top:16px;font-size:12px;color:#5c6478">Links go to your published captures in the app.</p>
  </body></html>`;

  await resend.emails.send({
    from,
    to: options.to,
    subject: `Caught — commute (${options.items.length} photos)`,
    html,
  });
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
