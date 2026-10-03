# Amuse — local widget + control panel

A local, self-contained **now-playing widget** plus a **self-written control panel**.
No live upstream calls; the widget runs a locally-captured bundle, driven by a mock backend.

## Structure

```
widget/            the widget bundle (SSR shell + JS/CSS/fonts)
panel/             control panel (React + Tailwind) with a live preview
mock-server/       local backend: auth, subscription/gating, profiles, now-playing, realtime
widget-server.mjs  hosts widget/ and proxies /api/* to the mock server
```

Realtime is **self-hosted**: a Pusher-compatible WebSocket on `ws://localhost:6001` plus an
SSE channel (`/api/events`). No external push service is contacted.

## Run

```bash
pnpm install

pnpm mock     # backend  -> http://localhost:8787
pnpm widget   # widget   -> http://localhost:5199/widget/amuse/local
pnpm panel    # panel    -> http://localhost:5174
```

Open the **panel** at `http://localhost:5174` — the right side embeds the widget and updates live.
The widget alone is at `http://localhost:5199/widget/amuse/local`.

> The panel runs with `--host` and proxies `/api`, `/widget`, `/webfonts`, `/assets` to the widget and
> mock servers, so it uses only **same-origin relative paths** — open it from another device on your LAN
> via `http://<your-machine-ip>:5174` and it still works. `localhost` always means the machine running the
> services; each person runs their own copy.

## How it works

- The panel loads the profile from `GET /api/widgets/amuse/profiles/main`, and every change is saved
  with `PUT` to the same endpoint; the widget re-reads the profile.
- Gating: `windows98` requires an active subscription, `discord` requires the Discord tier.
  Change plan locally: `curl -X POST -H "authorization: Bearer local" -H "content-type: application/json" -d '{"tier":"pro"}' http://localhost:8787/api/subscription/upgrade`
- Now-playing: the widget polls the local music source (`http://localhost:10767`, YouTube Music Desktop / Cider).
  Without it the widget shows "Nothing Playing"; the mock also exposes `GET /api/now-playing`.

## Notes

- Local, non-commercial research build; no live system is contacted at runtime.
- Session cookies (`.secrets/`, gitignored) were only used once to capture the bundle.
