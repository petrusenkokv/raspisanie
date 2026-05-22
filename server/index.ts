import { createApp } from "./app";
import { log } from "./vite";

(async () => {
  const { server } = await createApp({
    serveClient: true,
    websocket: true,
    reminders: true,
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  const onListen = () => log(`serving on port ${port}`);
  if (process.platform === "win32") {
    server.listen(port, onListen);
  } else {
    server.listen({ port, host: "0.0.0.0", reusePort: true }, onListen);
  }
})();
