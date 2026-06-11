/* Web Push + notifications when the app is closed (PWA). */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const parsePushPayload = (event) => {
  const fallback = { title: "Расписание", body: "", icon: "/icon-192.svg", tag: "gym", url: "/" };
  if (!event.data) return fallback;
  try {
    return { ...fallback, ...event.data.json() };
  } catch {
    return { ...fallback, body: event.data.text() };
  }
};

self.addEventListener("push", (event) => {
  const data = parsePushPayload(event);
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({ type: "schedule_update", payload: data });
      }
      const appVisible = clients.some((c) => c.visibilityState === "visible");
      if (appVisible) return;

      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon || "/icon-192.svg",
        badge: "/icon-192.svg",
        tag: data.tag || "gym-notification",
        renotify: true,
        silent: false,
        data: { url: data.url || "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
