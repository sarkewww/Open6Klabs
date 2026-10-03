/**
 * mock-server/src/realtime.ts
 * Minimal Pusher-protocol-compatible WebSocket server so the widget's realtime
 * client connects to a self-hosted endpoint instead of an external push service.
 * Broadcasts are channel-agnostic (local mock).
 */
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.REALTIME_PORT || 6001);
let wss: WebSocketServer | null = null;

function send(ws: WebSocket, obj: unknown) {
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}
function parse(s: unknown) {
  try {
    return JSON.parse(String(s));
  } catch {
    return null;
  }
}

export function startRealtime(): WebSocketServer {
  wss = new WebSocketServer({ port: PORT });
  wss.on("connection", (ws) => {
    const socketId = `${Math.random().toString(36).slice(2, 12)}.${Math.random().toString(36).slice(2, 12)}`;
    send(ws, { event: "pusher:connection_established", data: JSON.stringify({ socket_id: socketId, activity_timeout: 120 }) });
    ws.on("message", (raw) => {
      const msg = parse(raw);
      if (!msg) return;
      if (msg.event === "pusher:ping") return send(ws, { event: "pusher:pong", data: "{}" });
      if (msg.event === "pusher:subscribe") {
        const d = typeof msg.data === "string" ? parse(msg.data) : msg.data;
        return send(ws, { event: "pusher_internal:subscription_succeeded", channel: d?.channel, data: "{}" });
      }
    });
  });
  console.log(`[realtime] pusher-compatible ws on ws://localhost:${PORT}`);
  return wss;
}

export function broadcast(event: string, data: unknown, channel = "private-amuse") {
  const payload = JSON.stringify({ event, channel, data: JSON.stringify(data) });
  for (const ws of wss?.clients ?? []) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
}
