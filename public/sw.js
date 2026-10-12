/* Anki-ji service worker: makes the app shell, static assets, fonts and downloaded media available offline.
 * - /_next/static/* (JS, CSS, fonts): cache-first (immutable, content-hashed)
 * - page navigations: network-first, fall back to the cached page (pages of downloaded decks are pre-cached)
 * - card media (images/audio, incl. Vercel Blob): cache-first once downloaded for offline
 * - /api/*: never cached (offline reviews go through the IndexedDB outbox instead)
 */
// Web Push handlers (feat/fsrs-remind) share this single root-scoped worker when deployed.
try { importScripts("/sw-push.js"); } catch { /* not deployed */ }

const VERSION = "v2";
const STATIC = `ak-static-${VERSION}`;
const PAGES = `ak-pages-${VERSION}`;
const MEDIA = `ak-media-${VERSION}`;
const KEEP = [STATIC, PAGES, MEDIA];
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];
const MEDIA_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|mp3|m4a|aac|ogg|oga|wav|flac|opus|mp4|webm|mov)(\?.*)?$/i;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await Promise.all(SHELL.map((u) => cachePage(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("ak-") && !KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

/** Fetch a page, store it, and pre-cache every static asset it references (chunks, css, fonts). */
async function cachePage(url) {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok || res.redirected || !(res.headers.get("content-type") || "").includes("text/html")) return;
  const cache = await caches.open(PAGES);
  await cache.put(new URL(url, self.location.origin).pathname, res.clone());
  await cacheAssetsFrom(await res.text());
}

/** Cache key for a static asset: decoded pathname (chunk urls may be requested as %5Bid%5D or [id]). */
function keyOf(pathname) {
  try { return decodeURI(pathname); } catch { return pathname; }
}

function assetUrls(text) {
  const out = new Set();
  for (const m of text.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s]+/g)) {
    let u = m[0].startsWith("/_next/") ? m[0] : `/_next/${m[0]}`;
    // route groups like (app) are part of chunk paths; trim a closing paren from css url(...) etc.
    while (/[),;]$/.test(u) && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length + (/[,;]$/.test(u) ? 1 : 0)) u = u.slice(0, -1);
    out.add(keyOf(u));
  }
  return [...out];
}

async function cacheAssetsFrom(text) {
  const cache = await caches.open(STATIC);
  const urls = assetUrls(text);
  await Promise.all(urls.map(async (u) => {
    if (await cache.match(u)) return;
    try {
      const r = await fetch(u);
      if (!r.ok) return;
      await cache.put(u, r.clone());
      if (u.endsWith(".css")) await cacheAssetsFrom(await r.text()); // fonts referenced by css
    } catch { /* offline */ }
  }));
}

async function cacheUrls(urls) {
  const cache = await caches.open(STATIC);
  await Promise.all(urls.map(async (u) => {
    try {
      const path = new URL(u, self.location.origin);
      if (path.origin !== self.location.origin) return;
      const key = keyOf(path.pathname);
      if (await cache.match(key)) return;
      const r = await fetch(path.pathname);
      if (r.ok) {
        await cache.put(key, r.clone());
        if (path.pathname.endsWith(".css")) await cacheAssetsFrom(await r.text());
      }
    } catch { /* ignore */ }
  }));
}

async function cacheMedia(urls) {
  const cache = await caches.open(MEDIA);
  await Promise.all(urls.map(async (u) => {
    try {
      if (await cache.match(u)) return;
      const sameOrigin = new URL(u, self.location.origin).origin === self.location.origin;
      const r = await fetch(u, sameOrigin ? { credentials: "same-origin" } : { mode: "no-cors" });
      if (r.ok || r.type === "opaque") await cache.put(u, r);
    } catch { /* ignore */ }
  }));
}

self.addEventListener("message", (event) => {
  const d = event.data || {};
  const urls = Array.isArray(d.urls) ? d.urls.filter((u) => typeof u === "string").slice(0, 2000) : [];
  if (d.type === "cache-urls") event.waitUntil(cacheUrls(urls));
  else if (d.type === "cache-pages") event.waitUntil(Promise.all(urls.map((u) => cachePage(u).catch(() => {}))));
  else if (d.type === "cache-media") event.waitUntil(cacheMedia(urls));
});

function offlinePage() {
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anki-ji · 离线</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:15px system-ui,sans-serif;background:#fafafa;color:#18181b}
@media (prefers-color-scheme:dark){body{background:#09090b;color:#fafafa}}main{max-width:22rem;padding:2rem;text-align:center}a{display:inline-flex;min-height:44px;align-items:center;padding:0 1.25rem;margin-top:1rem;border-radius:12px;background:#0f7f76;color:#fff;text-decoration:none;font-weight:600}</style></head>
<body><main><p style="font-size:20px;font-weight:600">离线 · Offline</p><p>此页面尚未缓存。This page isn't available offline yet.</p><a href="/">返回牌组 · Back to decks</a></main></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;

  if (same && url.pathname.startsWith("/api/")) return; // network only

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && !res.redirected && (res.headers.get("content-type") || "").includes("text/html")) {
          const copy = res.clone();
          event.waitUntil((async () => {
            const cache = await caches.open(PAGES);
            await cache.put(url.pathname, copy.clone());
            await cacheAssetsFrom(await copy.text());
          })());
        }
        return res;
      } catch {
        const cache = await caches.open(PAGES);
        return (await cache.match(url.pathname)) || offlinePage(); // never serve another route's HTML (its RSC payload carries that route's params)
      }
    })());
    return;
  }

  if (same && url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const key = keyOf(url.pathname);
      const hit = await cache.match(key);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) event.waitUntil(cache.put(key, res.clone()));
      return res;
    })());
    return;
  }

  // RSC payloads for client-side navigation: network only; on failure Next falls back to a full navigation (served above)
  if (same && (url.searchParams.has("_rsc") || req.headers.get("RSC") === "1")) return;

  if (same && (SHELL.includes(url.pathname) || url.pathname === "/sql-wasm.wasm")) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(url.pathname);
      const net = fetch(req).then((r) => { if (r.ok) cache.put(url.pathname, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }

  if (MEDIA_RE.test(url.pathname) || req.destination === "image" || req.destination === "audio" || req.destination === "video") {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      try { return await fetch(req); } catch { return Response.error(); }
    })());
  }
});
