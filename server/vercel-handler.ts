import type { IncomingMessage, ServerResponse } from "http";
import { createApp } from "./app";

const appPromise = createApp({
  serveClient: false,
  websocket: false,
  reminders: false,
}).then(({ app }) => app);

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const app = await appPromise;
  return app(req, res);
}
