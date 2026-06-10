/**
 * Cloudflare Pages Function: POST /api/send-feedback
 * Receives a feedback message from the in-app widget and emails it via Resend.
 *
 * Required env vars (Cloudflare Pages → Settings → Environment Variables):
 *   RESEND_API_KEY   — re_... from resend.com
 *   APP_URL          — https://madrazallbuilt.com/dailyflux
 */

const TYPE_LABELS = {
  bug:     "Bug Report",
  feature: "Feature Request",
  account: "Account / Billing",
  other:   "General",
};

export async function onRequestPost(context) {
  const { request, env } = context;

  const appUrl = env.APP_URL || "https://madrazallbuilt.com/dailyflux";
  const corsHeaders = {
    "Access-Control-Allow-Origin": appUrl,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const { type, message, userEmail } = await request.json();

    if (!message || !message.trim()) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!env.RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const typeLabel = TYPE_LABELS[type] || "General";
    const subject = `[Flux ${typeLabel}] from ${userEmail || "unknown user"}`;

    const html = `
      <div style="background:#0a0a0b;padding:32px;font-family:Courier New,monospace;color:#f0f0f2;">
        <div style="max-width:560px;margin:0 auto;">
          <div style="font-size:11px;letter-spacing:3px;color:#e8365d;text-transform:uppercase;margin-bottom:8px;">
            Flux In-App Feedback
          </div>
          <h2 style="font-family:Georgia,serif;font-size:22px;color:#f0f0f2;margin:0 0 24px 0;font-weight:700;">
            ${typeLabel}
          </h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tr>
              <td style="font-size:11px;color:#50505a;padding:6px 0;width:100px;vertical-align:top;">From</td>
              <td style="font-size:12px;color:#f0f0f2;padding:6px 0;">${userEmail || "not provided"}</td>
            </tr>
            <tr>
              <td style="font-size:11px;color:#50505a;padding:6px 0;vertical-align:top;">Type</td>
              <td style="font-size:12px;color:#f0f0f2;padding:6px 0;">${typeLabel}</td>
            </tr>
            <tr>
              <td style="font-size:11px;color:#50505a;padding:6px 0;vertical-align:top;">Time</td>
              <td style="font-size:12px;color:#f0f0f2;padding:6px 0;">${new Date().toUTCString()}</td>
            </tr>
          </table>
          <div style="background:#161619;border:1px solid #1e1e22;border-left:2px solid #e8365d;padding:16px 18px;border-radius:4px;">
            <div style="font-size:10px;letter-spacing:2px;color:#44444e;text-transform:uppercase;margin-bottom:10px;">Message</div>
            <div style="font-size:13px;color:#f0f0f2;line-height:1.8;white-space:pre-wrap;">${message.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          </div>
        </div>
      </div>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Flux Feedback <welcome@madrazallbuilt.com>",
        to: ["welcome@madrazallbuilt.com"],
        reply_to: userEmail || "welcome@madrazallbuilt.com",
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.json().catch(() => ({}));
      console.error("Resend error:", err);
      return new Response(JSON.stringify({ error: "Failed to send" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (err) {
    console.error("send-feedback error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}

export async function onRequestOptions(context) {
  const { env } = context;
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": env.APP_URL || "https://madrazallbuilt.com/dailyflux",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
