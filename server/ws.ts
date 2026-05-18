import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";

const clients = new Set<WebSocket>();
let realtimeEnabled = true;

export function setRealtimeEnabled(enabled: boolean) {
  realtimeEnabled = enabled;
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });
}

export function broadcast(msg: object) {
  if (!realtimeEnabled) return;
  const data = JSON.stringify(msg);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
