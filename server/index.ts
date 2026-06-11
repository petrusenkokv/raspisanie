import { loadDevEnv } from "./load-dev-env";
import { createApp } from "./app";
import { log } from "./vite";

loadDevEnv();

(async () => {
  const { server } = await createApp({
    serveClient: true,
    websocket: true,
    reminders: true,
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
})();
