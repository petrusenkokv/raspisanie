import type { IncomingMessage, ServerResponse } from "http";

console.log("[handler] Vercel handler loaded");

const appPromise = (async () => {
  console.log("[handler] Starting createApp...");
  try {
    const { createApp } = await import("./app");
    console.log("[handler] createApp imported");
    const { app } = await createApp({
      serveClient: true,
      websocket: false,
    });
    console.log("[handler] createApp completed successfully");
    return app;
  } catch (err: any) {
    console.error("[handler] createApp failed:", err?.message || err);
    throw err;
  }
})();

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  try {
    const app = await appPromise;
    return app(req, res);
  } catch (err: any) {
    console.error("[handler] Failed to get app:", err?.message || err);
    res.status(500).json({ message: "Server initialization failed" });
  }
}
