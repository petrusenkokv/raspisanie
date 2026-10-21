import { loadDevEnv } from "./load-dev-env";
import { createApp } from "./app";
import { ensureStorageReady } from "./storage-instance";
import { log } from "./vite";

loadDevEnv();

// Prevent process crash on idle pg pool errors
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

(async () => {
  const { server } = await createApp({
    serveClient: true,
    websocket: true,
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || "0.0.0.0";
  server.listen(port, host, () => {
    log(`serving on http://localhost:${port}`);
    if (host === "0.0.0.0") {
      log("also reachable on your LAN IP, e.g. http://192.168.x.x:" + port);
    }
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      log("push: VAPID keys not set — add VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY to .env.local for local push");
    }
  });

  // Инициализация БД (проверка соединения, миграции, сид) идёт в фоне:
  // onreza даёт на запуск 30 секунд и снимает деплой, если сервер не начал
  // слушать вовремя. Первый /api-запрос подождёт готовность сам.
  ensureStorageReady()
    .then(() => log("storage ready"))
    .catch((err) => console.error("[index] storage init failed:", err));
})();
