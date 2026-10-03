#!/usr/bin/env node
/**
 * widget-server.mjs
 * Hosts the local Amuse widget (captured verbatim bundle under widget/) and
 * proxies /api/* to the mock server. No live 6klabs.com calls.
 *
 *   http://localhost:5199/widget/amuse/local   -> the Amuse overlay widget
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WIDGET = path.join(ROOT, "widget");
const PORT = Number(process.env.WIDGET_PORT || 5199);
const MOCK = Number(process.env.MOCK_PORT || 8787);

const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

function serveStatic(res, rel) {
  const p = path.join(WIDGET, rel);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}

function proxyApi(req, res) {
  const pr = http.request({ host: "localhost", port: MOCK, path: req.url, method: req.method, headers: req.headers }, (pres) => {
    res.writeHead(pres.statusCode || 502, pres.headers);
    pres.pipe(res);
  });
  pr.on("error", () => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `mock-server not running on :${MOCK}` }));
  });
  req.pipe(pr);
}

let html = fs.readFileSync(path.join(WIDGET, "overlay.html"), "utf8");
// defensive: strip any external / Cloudflare challenge bootstrap before serving
html = html.replace(/<script[^>]+src="https?:\/\/[^"]*"[^>]*>\s*<\/script>/gi, "");
html = html.replace(/<link[^>]+href="https?:\/\/[^"]*"[^>]*>/gi, "");
html = html.replace(/<script>\(function\(\)\{function c\(\)\{[\s\S]*?__CF\$cv\$params[\s\S]*?\}\)\(\);<\/script>/gi, "");
// instant settings refresh: subscribe to the self-hosted SSE and nudge react-query
const live = `<script>(function(){try{var es=new EventSource("/api/events");es.addEventListener("profile-changed",function(){try{window.dispatchEvent(new Event("visibilitychange"));}catch(e){}try{window.dispatchEvent(new Event("focus"));}catch(e){}});}catch(e){}})();</script>`;
html = html.includes("</body>") ? html.replace("</body>", live + "</body>") : html + live;
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  if (p.startsWith("/api/")) return proxyApi(req, res);
  if (/^\/(assets|webfonts|css)\//.test(p) || ["/favicon.ico", "/manifest.webmanifest", "/6k_logo_white_ico.svg", "/masked-icon.svg", "/apple-touch-icon.png"].includes(p)) {
    return serveStatic(res, p.slice(1));
  }
  if (/\.[a-z0-9]+$/i.test(p)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});
server.listen(PORT, () => console.log(`[widget] http://localhost:${PORT}/widget/amuse/local`));
