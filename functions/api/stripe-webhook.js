// Cloudflare Pages Function: POST /api/stripe-webhook
// Verifies Stripe webhook signature and updates subscription status in Supabase.
//
// Required env vars:
//   STRIPE_WEBHOOK_SECRET    — whsec_... (from Stripe dashboard → Webhooks)
//   SUPABASE_URL             — https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — service_role key (NOT the anon key)
//
// Stripe events handled:
//   checkout.session.completed        — new subscription started
//   customer.subscription.updated     — renewal, plan change, trial end
//   customer.subscription.deleted     — cancellation

export async function onRequestPost(context) {
  const { request, env } = context;

  const signature = request.headers.get("stripe-signature");
  const body = await request.text();

  // Verify Stripe webhook signature
  const isValid = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId || session.subscription_data?.metadata?.userId;
        if (!userId) break;

        // Fetch full subscription from Stripe to get period end
        const sub = await fetchStripeSubscription(session.subscription, env.STRIPE_SECRET_KEY);

        await upsertSubscription(env, {
          userId,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          status: sub?.status || "active",
          priceId: sub?.items?.data?.[0]?.price?.id || null,
          currentPeriodEnd: sub?.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) break;

        await upsertSubscription(env, {
          userId,
          stripeCustomerId: sub.customer,
          stripeSubscriptionId: sub.id,
          status: sub.status,
          priceId: sub.items?.data?.[0]?.price?.id || null,
          currentPeriodEnd: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) break;

        await upsertSubscription(env, {
          userId,
          stripeCustomerId: sub.customer,
          stripeSubscriptionId: sub.id,
          status: "canceled",
          priceId: null,
          currentPeriodEnd: null,
        });
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Stripe webhook signature verification ────────────────────────────────────
// Implements Stripe's HMAC-SHA256 signature check using Web Crypto API.
async function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;

  try {
    const parts = sigHeader.split(",").reduce((acc, part) => {
      const [k, v] = part.split("=");
      acc[k] = v;
      return acc;
    }, {});

    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !signature) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
    const computed = Array.from(new Uint8Array(mac))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    return computed === signature;
  } catch {
    return false;
  }
}

// ── Stripe API helper ─────────────────────────────────────────────────────────
async function fetchStripeSubscription(subscriptionId, secretKey) {
  if (!subscriptionId) return null;
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: { "Authorization": `Bearer ${secretKey}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Supabase upsert via REST API ──────────────────────────────────────────────
async function upsertSubscription(env, { userId, stripeCustomerId, stripeSubscriptionId, status, priceId, currentPeriodEnd }) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      user_id: userId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      status,
      price_id: priceId,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert failed: ${err}`);
  }
}
