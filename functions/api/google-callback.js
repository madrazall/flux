// Cloudflare Pages Function: GET /api/google-callback
// Exchanges the OAuth code for tokens and stores the refresh token in Supabase.
//
// Required env vars:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  const appUrl = "https://fluxapp.madrazallbuilt.com";

  if (error || !code) {
    return Response.redirect(`${appUrl}?gcal_error=access_denied`, 302);
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return Response.redirect(`${appUrl}?gcal_error=token_exchange_failed`, 302);
  }

  const { access_token, refresh_token } = await tokenRes.json();

  if (!refresh_token) {
    return Response.redirect(`${appUrl}?gcal_error=no_refresh_token`, 302);
  }

  // Get the user's Google email so we can identify them
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const { email: googleEmail } = await profileRes.json();

  // Look up the Supabase user by their Google email
  // We store tokens keyed by user_id — the frontend must pass the supabase user_id
  // via the state param. We'll use a signed state cookie approach instead:
  // read the state param that was set when /api/google-auth was called.
  const stateUserId = url.searchParams.get("state");

  if (!stateUserId) {
    return Response.redirect(`${appUrl}?gcal_error=missing_state`, 302);
  }

  // Store refresh token in Supabase google_tokens table
  const upsertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/google_tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      user_id: stateUserId,
      refresh_token,
      google_email: googleEmail,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!upsertRes.ok) {
    return Response.redirect(`${appUrl}?gcal_error=db_write_failed`, 302);
  }

  return Response.redirect(`${appUrl}?gcal_connected=1`, 302);
}
