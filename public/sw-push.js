/* Anki-ji Web Push handlers. Importable from any service worker: importScripts("/sw-push.js").
 * Also works as a standalone service worker when no other worker is registered. */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Anki-ji";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    tag: data.tag || "anki-ji",
    renotify: false,
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin && "focus" in c) {
        await c.focus();
        if ("navigate" in c) { try { await c.navigate(url); } catch { /* cross-origin or not controlled */ } }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
