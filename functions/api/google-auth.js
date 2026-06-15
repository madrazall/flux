// Cloudflare Pages Function: GET /api/google-auth?user_id=...
// Redirects the user to Google's OAuth consent screen.
//
// Required env vars (Cloudflare Pages → Settings → Environment variables):
//   GOOGLE_CLIENT_ID
//   GOOGLE_REDIRECT_URI  — https://fluxapp.madrazallbuilt.com/api/google-callback

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const userId = url.searchParams.get("user_id");

  if (!userId) {
    return new Response("Missing user_id", { status: 400 });
  }

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline",
    prompt: "consent",
    state: userId,
  });

  return Response.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    302
  );
}
