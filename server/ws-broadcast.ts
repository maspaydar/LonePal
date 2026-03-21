import { WebSocketServer, WebSocket } from "ws";

let _wss: WebSocketServer | null = null;

export function setWss(wss: WebSocketServer) {
  _wss = wss;
}

export function broadcastToClients(data: any) {
  if (!_wss) return;
  const payload = JSON.stringify(data);
  _wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}
