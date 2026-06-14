/**
 * Cloudflare Worker — flux-proxy
 *
 * Routes traffic on madrazallbuilt.com:
 *   /flux             → redirect to /flux/ (ensures relative paths resolve correctly)
 *   /flux/*           → proxy to flux-6xu.pages.dev (strip /flux prefix)
 *   /api/*            → proxy to flux-6xu.pages.dev/api/* (API calls made by the app)
 *   everything else   → pass through to the origin (rest of madrazallbuilt.com)
 *
 * Deploy this worker in Cloudflare Dashboard:
 *   Workers & Pages → Create Worker → paste this code → Save & Deploy
 *
 * Then add these Worker Routes (Cloudflare Dashboard → Workers & Pages → your worker → Triggers):
 *   madrazallbuilt.com/flux*
 *   madrazallbuilt.com/api/*
 */

const PAGES_ORIGIN = "https://flux-6xu.pages.dev";
const APP_PATH = "/flux";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Redirect /flux → /flux/ so relative asset paths resolve correctly
    if (path === APP_PATH) {
      return Response.redirect(url.origin + APP_PATH + "/" + url.search, 301);
    }

    // Proxy /flux/* → Pages root (strip the /flux prefix)
    if (path.startsWith(APP_PATH + "/")) {
      const newPath = path.slice(APP_PATH.length) || "/";
      const proxyUrl = PAGES_ORIGIN + newPath + url.search;
      return proxyRequest(request, proxyUrl);
    }

    // Proxy /api/* → Pages functions (API calls from the app)
    if (path.startsWith("/api/")) {
      const proxyUrl = PAGES_ORIGIN + path + url.search;
      return proxyRequest(request, proxyUrl);
    }

    // Everything else: pass through to the existing madrazallbuilt.com origin
    return fetch(request);
  },
};

async function proxyRequest(originalRequest, targetUrl) {
  const init = {
    method: originalRequest.method,
    headers: originalRequest.headers,
  };
  if (originalRequest.method !== "GET" && originalRequest.method !== "HEAD") {
    init.body = originalRequest.body;
    init.duplex = "half";
  }
  const response = await fetch(targetUrl, init);
  // Return a mutable copy so we can adjust headers if needed
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
