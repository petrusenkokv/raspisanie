import { createApp } from "./server/app";

(async () => {
  const { server } = await createApp({
    serveClient: true,
    websocket: true,
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || "0.0.0.0";
  server.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}`);
  });
})();
