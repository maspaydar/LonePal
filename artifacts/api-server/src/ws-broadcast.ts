import { WebSocketServer, WebSocket } from "ws";

let _wss: WebSocketServer | null = null;

export function setWss(wss: WebSocketServer) {
  _wss = wss;
}

/**
 * Binds a connected dashboard socket to the facility (entityId) it authenticated
 * as. Entity-scoped broadcasts are then delivered ONLY to sockets carrying the
 * matching entityId — the real, server-side multi-tenant isolation boundary.
 */
export function tagClientEntity(ws: WebSocket, entityId: number) {
  (ws as WebSocket & { __entityId?: number }).__entityId = entityId;
}

/**
 * Broadcasts an event to connected dashboard clients.
 * - If `data.entityId` is a number, the event is TENANT-SCOPED: it is sent only
 *   to sockets bound to that same entityId. This keeps sensitive payloads (e.g.
 *   critical safety alerts with resident details) from ever reaching another
 *   facility's staff over the wire.
 * - If `data.entityId` is absent, the event is global (backwards-compatible).
 */
export function broadcastToClients(data: any) {
  if (!_wss) return;
  const payload = JSON.stringify(data);
  const targetEntityId = typeof data?.entityId === "number" ? data.entityId : null;

  _wss.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;
    if (targetEntityId !== null) {
      const clientEntityId = (client as WebSocket & { __entityId?: number }).__entityId;
      if (clientEntityId !== targetEntityId) return;
    }
    client.send(payload);
  });
}
