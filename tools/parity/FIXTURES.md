# Parity fixtures — deterministic source & WebSocket interception

`tools/parity/fixtures.mjs` is the fixture layer shared by the parity harness
(Todos 31–33). It installs a Playwright route table + WebSocket mocks on a page
so that **both** the original widget (`widget-server.mjs`, `:5199`) and the
rewrite (`vite preview`, `:5200`) run against the same deterministic inputs and
**never emit a real external request**.

```
node tools/parity/fixtures.mjs --record                 # re-record the baseline
node tools/parity/fixtures.mjs --selfcheck [--evidence <file>]
node tools/parity/fixtures.mjs --list-scenarios
node tools/parity/fixtures.mjs --status-drivers
```

Programmatic API used by `compare.mjs` / `behavior.mjs`:

```js
import { installFixtures, mutations, runMutationAgreement, waitForPaletteStable, captureDomSnapshot } from './fixtures.mjs';
```

## 1. Intercepted surface

| Kind | Host / path | Fulfilled with |
| --- | --- | --- |
| Pear Desktop | `GET http://localhost:9863/query` | scenario payload (normal/live/ad/empty/error) |
| Cider (Apple Music) | `GET http://localhost:10767/api/v1/playback/now-playing`, `.../is-playing` | scenario payload |
| Spicetify | `GET http://localhost:7271/spicetify` | scenario payload |
| Tidal | `GET http://localhost:47836/current` | scenario payload |
| Spotify token | `GET /api/widget/spotify/token` (local, proxied) | `200 {token:string}` |
| Spotify API | `GET https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode` | scenario payload (200/204/400/401/403/500/503) |
| YTM token | `GET /api/widget/accounts/ytmdesktop` (local, proxied) | `200 {token:string}` (or 404 not-connected) |
| YTM realtime | `ws://localhost:9863/socket.io/…` | `routeWebSocket` engine.io + socket.io `state-update` |
| Pusher realtime | `ws://localhost:6001/app/…` | `routeWebSocket` pusher handshake + `user_changed_settings` |
| Mock API | `/api/widget/settings`, `/api/widget/subscription`, `/api/widgets/amuse/profiles/:id`, `/api/pusher/realtime/auth` | recorded baseline bodies |
| SSE | `/api/events` | finite SSE body with `retry: 60000` (no reconnect storm) |
| Service worker | `/sw.js` | `404` (same as the original host — no SW) |
| No-op hosts | `metrics.6klabs.com`, `content.6klabs.com` (GraphQL → `{data:{}}`), `hdx.6klabs.com`, `glorp.6klabs.com` (PostHog), `6klabs.com` (`/api/auth/get-session`), `ipv4.icanhazip.com`, `cdn-uicons.flaticon.com` | lazy `200`, no widget-visible side effect |

Anything that does **not** match the table is recorded as a **violation** and
aborted. `--selfcheck` fails if any violation occurs on either origin.

## 2. Fixture provenance

* `node tools/parity/fixtures.mjs --record` drives the **original** against the
  running mock-server and writes `tools/parity/baseline/original-baseline.json`
  (a first-class committed artifact; Todo 36 freezes its sha256). It records the
  real request/response surface of every mock API endpoint, the request *shape*
  of every source call, the external-host call sites, and the pusher WebSocket
  URL. Volatile ids/timestamps are scrubbed. `directProbes` records the two
  additive source-token endpoints directly from mock-server (`200 {token:string}`).
* The mock-API fixtures are read back from that baseline; the source fixtures
  encode the response shapes the adapters were ported from (Todos 9–14) and are
  varied by the property-based mutator below.
* `mutations(payload)` produces drop-field / rename-field / type-swap / boundary
  variants; `runMutationAgreement(browser, …)` replays each variant through the
  fixture layer on **both** origins and compares their normalised DOM output.

> **Boundary (Todo 30).** The rewrite SPA currently ships no runtime wiring
> (adapters / realtime / session are only exercised by unit tests), so it renders
> the empty player shell. `runMutationAgreement` always asserts 0 unintercepted
> requests on both origins, and compares DOM output whenever both sides render
> non-empty (`samples[].domCompared`), so the equality assertion activates
> automatically once Todos 31/32 give the rewrite a runtime.

## 3. Determinism knobs

* **pusher-js** already uses `enabledTransports:['ws','wss']` (no HTTP polling);
  `localhost:6001` HTTP is additionally intercepted as a fallback, and the
  WebSocket itself is mocked via `routeWebSocket`.
* **EventSource** `/api/events` is fulfilled with a finite SSE body and
  `retry: 60000`, so it does not reconnect-storm.
* **Palette sampling** (`react-palette` / vibrant) is asynchronous:
  `waitForPaletteStable(page)` polls the resolved palette CSS custom properties
  until two consecutive samples match before any screenshot.
* **`prefers-reduced-motion`** is pinned explicitly per run
  (`no-preference` by default) via `page.emulateMedia` and recorded in the
  capture, so motion branches are never silently collapsed and the choice is
  auditable. Pass `reducedMotion:'reduce'` to exercise the reduced branch.
* Viewport / DPR / locale / color-scheme are pinned per context.

## 4. The 15 `WidgetStatus` values → driving fixture/route

`WIDGET_STATUS_DRIVERS` (exported, and printed by `--status-drivers`) is the
machine-readable source of truth. `renderable` marks whether the parity
screenshot matrix can render the state; non-renderable states are owned by the
Todo 8 unit tests.

| # | WidgetStatus | renderable | Driver |
| --- | --- | --- | --- |
| 1 | `SESSION_EXPIRED` | yes | session fixture → `/api/auth/get-session` 401 / `{code:"SESSION_EXPIRED"}` (scenario `session-expired`) |
| 2 | `LOADING` | no | store default before any response; parity uses the pre-response boundary only |
| 3 | `SUCCESS` | yes | scenario `normal`: profile loads + Pear `:9863/query` playing + pusher ws connects |
| 4 | `NO_SPOTIFY_ACCOUNT` | yes | `api.spotify.com` → 400 (scenario `spotify-no-account`) |
| 5 | `YTMD_NOT_CONNECTED` | yes | `/api/widget/accounts/ytmdesktop` → 404 not-connected detail (scenario `ytm-not-connected`) |
| 6 | `PROFILE_NOT_EXISTING` | yes | `/api/widgets/amuse/profiles/:id` → 404 (scenario `profile-missing`) |
| 7 | `SPOTIFY_ERROR` | yes | `api.spotify.com` unexpected status (default branch) |
| 8 | `SPOTIFY_ACCOUNT_ERROR` | yes | Spotify token error body `{code}` (error table id 90) |
| 9 | `SERVER_ERROR` | yes | `api.spotify.com` → 503 (scenario `spotify-server-error`) |
| 10 | `ACCOUNT_NOT_EXISTING` | yes | session user missing / ytm token 404 without not-connected detail (id 92) |
| 11 | `DISABLED_PROFILE` | yes | subscription fixture `free` + profile gating (scenario `disabled-profile`) |
| 12 | `DISABLED_PRO_SKIN` | yes | subscription `free` + `settings.skin="windows98"` (scenario `disabled-pro-skin`) |
| 13 | `DISABLED_DISCORD_SKIN` | yes | subscription `free` + `settings.skin="discord"` + `is_discord_member:false` (scenario `disabled-discord-skin`); no splash entry |
| 14 | `SPOTIFY_FREE_ACCOUNT` | yes | `api.spotify.com` → 403 (scenario `spotify-free`) |
| 15 | `SPOTIFY_TOKEN_EXPIRED` | yes | `api.spotify.com` → 401 (scenario `spotify-token-expired`) |

## 5. Additive mock-server endpoints

`mock-server/src/app.ts` gained two **purely additive** routes (no existing
behaviour/contract changed):

```
GET /api/widget/spotify/token          -> 200 { "token": "local-spotify-access-token" }
GET /api/widget/accounts/ytmdesktop    -> 200 { "token": "local-ytmdesktop-token" }
```

Both contracts are `200 {token: string}`. They exist so the fixture's recorded
baseline is a real success response instead of the 404 the captured client used
to receive.
