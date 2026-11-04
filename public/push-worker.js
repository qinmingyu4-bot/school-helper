/* Push only: deliberately no fetch handler or offline cache. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data;
    try { data = event.data.json(); } catch { return; }
    if (!data || typeof data.title !== "string" || typeof data.body !== "string") return;
    const url = new URL(data.url || "/app?page=schedule", self.location.origin);
    const target = url.origin === self.location.origin && url.pathname === "/app" ? url.pathname + url.search : "/app?page=schedule";
    await self.registration.showNotification(data.title.slice(0, 100), { body: data.body.slice(0, 300), tag: String(data.tag || "studybridge-schedule").slice(0, 200), icon: "/brand/book-bridge-color.svg", data: { url: target, userId: data.userId } });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL(event.notification.data?.url || "/app?page=schedule", self.location.origin);
    if (url.origin !== self.location.origin || url.pathname !== "/app") return;
    let authorized = false;
    try {
      const response = await fetch("/api/me", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(5000) });
      const user = response.ok ? (await response.json()).user : null;
      authorized = Boolean(user?.id && user.id === event.notification.data?.userId);
    } catch {}
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = clients.find((client) => new URL(client.url).pathname === "/app");
    if (app) {
      if (authorized) app.postMessage({ type: "studybridge-schedule-push", url: url.href, userId: event.notification.data?.userId });
      await app.focus();
    } else await self.clients.openWindow(authorized ? url.href : new URL("/app", self.location.origin).href);
  })());
});
