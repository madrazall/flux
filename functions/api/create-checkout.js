// Cloudflare Pages Function: POST /api/create-checkout
// Creates a Stripe Checkout session for a subscription.
//
// Required env vars (set in Cloudflare Pages → Settings → Environment Variables):
//   STRIPE_SECRET_KEY        — sk_live_... or sk_test_...
//   STRIPE_PRICE_MONTHLY     — price_... (monthly price ID from Stripe dashboard)
//   STRIPE_PRICE_YEARLY      — price_... (yearly price ID from Stripe dashboard)
//   APP_URL                  — https://fluxdaily.app

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": env.APP_URL || "https://fluxdaily.app",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const { userId, interval } = await request.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const priceId = interval === "year"
      ? env.STRIPE_PRICE_YEARLY
      : env.STRIPE_PRICE_MONTHLY;

    if (!priceId) {
      return new Response(JSON.stringify({ error: "Price not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const appUrl = env.APP_URL || "https://flux-6xu.pages.dev";

    const params = new URLSearchParams({
      "mode": "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "subscription_data[trial_period_days]": "7",
      "subscription_data[metadata][userId]": userId,
      "metadata[userId]": userId,
      "allow_promotion_codes": "true",
      "success_url": `${appUrl}/?checkout=success`,
      "cancel_url": `${appUrl}/?checkout=cancel`,
    });

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error("Stripe error:", session);
      return new Response(JSON.stringify({ error: session.error?.message || "Stripe error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("create-checkout error:", err);
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
      "Access-Control-Allow-Origin": env.APP_URL || "https://fluxdaily.app",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
