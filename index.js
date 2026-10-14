import { createApp } from "./server/app.js";

const { server } = await createApp({
  serveClient: true,
  websocket: true,
});

const port = parseInt(process.env.PORT || "5000", 10);
const host = process.env.HOST || "0.0.0.0";
server.listen(port, host, () => {
  console.log(`serving on http://localhost:${port}`);
  if (host === "0.0.0.0") {
    console.log("also reachable on your LAN IP, e.g. http://192.168.x.x:" + port);
  }
});
