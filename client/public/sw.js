/* Web Push + precaching for offline access. */

// Precached assets (versioned by build hash)
const PRECACHE_CACHE = "app-precache-v1";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/icon-192.svg",
  "/icon-512.svg",
  "/manifest.json",
  "/sw.js",
];

// In-memory dedup for push notifications (resets on service worker restart)
const shownNotifications = new Map<string, number>();
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ── Precache app shell ──────────────────────────────────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PRECACHE_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Delete old precache versions
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== PRECACHE_CACHE).map((k) => caches.delete(k)),
      );
      // Claim clients immediately
      await self.clients.claim();
    })(),
  );
});

// ── Cache-first for assets, network-first for API ──────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls — network-first, fallback to cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          // Clone and cache successful GET responses
          if (
            request.method === "GET" &&
            networkResponse.ok &&
            networkResponse.headers.get("content-type")?.includes("application/json")
          ) {
            const cache = await caches.open("api-cache");
            await cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          // Fallback to cache
          const cached = await caches.match(request);
          if (cached) return cached;
          // Return 504 if nothing cached
          return new Response(
            JSON.stringify({ message: "Нет подключения к интернету" }),
            { status: 504, headers: { "Content-Type": "application/json" } },
          );
        }
      })(),
    );
    return;
  }

  // Static assets & HTML — cache-first
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch {
        // For HTML, return index.html for SPA routing
        if (request.headers.get("accept")?.includes("text/html")) {
          return caches.match("/index.html");
        }
        return new Response("Offline", { status: 503 });
      }
    })(),
  );
});

// ── Push notifications ─────────────────────────────────────────────
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

      // Deduplication: create a unique key from tag + title + body
      const dedupKey = `${data.tag || "gym"}:${data.title}:${data.body}`;
      const now = Date.now();
      
      // Check if similar notification was shown recently
      const lastShown = shownNotifications.get(dedupKey);
      if (lastShown && now - lastShown < DEDUP_WINDOW_MS) {
        console.log("[sw] Skipping duplicate notification:", dedupKey);
        return;
      }
      
      // Clean old entries
      if (shownNotifications.size > 100) {
        const entries = Array.from(shownNotifications.entries());
        entries.sort((a, b) => a[1] - b[1]);
        for (let i = 0; i < entries.length - 100; i++) {
          shownNotifications.delete(entries[i][0]);
        }
      }
      
      shownNotifications.set(dedupKey, now);

      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon || "/icon-192.svg",
        badge: "/icon-192.svg",
        tag: data.tag || "gym-notification",
        renotify: false, // Changed from true to false to prevent re-notify spam
        silent: false,
        data: { url: data.url || "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  
  // Remove from dedup cache so we can show it again later if needed
  const notificationTag = event.notification.tag;
  if (notificationTag) {
    for (const key of Array.from(shownNotifications.keys())) {
      if (key.startsWith(notificationTag + ":")) {
        shownNotifications.delete(key);
        break;
      }
    }
  }
  
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
