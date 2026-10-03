import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { startRealtime } from "./realtime";

const app = createApp();
const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[mock-server] listening on http://localhost:${info.port}`);
});
startRealtime();
