// Cloudflare Pages Function: GET /api/google-calendar?user_id=...&date=YYYY-MM-DD
// Fetches today's events from Google Calendar for a given user.
//
// Required env vars:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id");
  const date = url.searchParams.get("date"); // YYYY-MM-DD

  if (!userId || !date) {
    return json({ error: "Missing user_id or date" }, 400);
  }

  // Fetch stored refresh token from Supabase
  const tokenRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/google_tokens?user_id=eq.${userId}&select=refresh_token`,
    {
      headers: {
        "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  const tokenRows = await tokenRes.json();
  if (!tokenRows.length || !tokenRows[0].refresh_token) {
    return json({ error: "not_connected" }, 404);
  }

  const refreshToken = tokenRows[0].refresh_token;

  // Exchange refresh token for a fresh access token
  const accessRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!accessRes.ok) {
    return json({ error: "token_refresh_failed" }, 502);
  }

  const { access_token } = await accessRes.json();

  // Build time range for the requested date (local midnight → next midnight)
  const timeMin = `${date}T00:00:00Z`;
  const timeMax = `${date}T23:59:59Z`;

  const calRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "50" }),
    { headers: { Authorization: `Bearer ${access_token}` } }
  );

  if (!calRes.ok) {
    return json({ error: "calendar_fetch_failed" }, 502);
  }

  const calData = await calRes.json();

  const events = (calData.items || [])
    .filter(e => e.start?.dateTime) // skip all-day events
    .map(e => ({
      id: e.id,
      title: e.summary || "Event",
      start: e.start.dateTime,
      end: e.end.dateTime,
      color: e.colorId || null,
    }));

  return json({ events });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
