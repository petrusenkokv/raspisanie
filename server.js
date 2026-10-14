import { createApp } from "./server/app.js";

await createApp({
  serveClient: true,
  websocket: true,
});
