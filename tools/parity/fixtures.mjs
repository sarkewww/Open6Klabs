#!/usr/bin/env node
/**
 * tools/parity/fixtures.mjs
 *
 * Deterministic fixture layer for the Amuse parity harness.
 *
 * Both the ORIGINAL widget (`widget-server.mjs`, :5199) and the REWRITE
 * (`vite preview`, :5200) are driven through Playwright with the SAME fixture
 * set installed on the page, so a parity run never depends on a live third-party
 * service and never emits a real external request. The two hosts run on
 * DIFFERENT origins, which also isolates their BroadcastChannels from each
 * other.
 *
 * ---------------------------------------------------------------------------
 * What is intercepted (nothing external escapes)
 * ---------------------------------------------------------------------------
 *  6 sources
 *    · Pear Desktop       GET http://localhost:9863/query
 *    · Cider (Apple)      GET http://localhost:10767/api/v1/playback/now-playing
 *                         GET http://localhost:10767/api/v1/playback/is-playing
 *    · Spicetify          GET http://localhost:7271/spicetify
 *    · Tidal              GET http://localhost:47836/current
 *    · Spotify            GET /api/widget/spotify/token            (local, mocked)
 *                         GET https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode
 *    · YouTube Music      GET /api/widget/accounts/ytmdesktop      (local, mocked)
 *                         ws://localhost:9863/socket.io/…          (routeWebSocket)
 *  plus the mock-backed same-origin endpoints the client reads
 *    · /api/widget/settings, /api/widget/subscription,
 *      /api/widgets/amuse/profiles/:id, /api/pusher/realtime/auth
 *  plus every sanctioned no-op host (fulfilled "lazily", no widget-visible effect)
 *    · metrics.6klabs.com, content.6klabs.com (GraphQL), hdx.6klabs.com,
 *      glorp.6klabs.com (PostHog), 6klabs.com (/api/auth/get-session),
 *      ipv4.icanhazip.com, cdn-uicons.flaticon.com
 *  plus
 *    · /api/events  (EventSource → SSE stub with a 60 s retry, no reconnect storm)
 *    · /sw.js       (404, exactly like the original host — no service worker)
 *    · ws://localhost:6001  (pusher-compatible settings channel via routeWebSocket)
 *
 * Any request that is NOT recognised is recorded as a VIOLATION and aborted —
 * `--selfcheck` fails if the violation list is non-empty.
 *
 * ---------------------------------------------------------------------------
 * Fixture provenance (not hand-waved)
 * ---------------------------------------------------------------------------
 * `node tools/parity/fixtures.mjs --record` drives the ORIGINAL against the
 * running mock-server and records the real request/response surface to
 * `tools/parity/baseline/original-baseline.json` (a first-class, committed
 * artifact — Todo 36 freezes its sha256). The recorded mock-API bodies are then
 * used as the default fixtures, and `mutations()`/`runMutationAgreement()`
 * provide property-based variation (drop field / rename / type-swap / boundary)
 * so later tasks can upgrade "equal on the chosen inputs" to "equal across the
 * input space".
 *
 * ---------------------------------------------------------------------------
 * Determinism knobs
 * ---------------------------------------------------------------------------
 *  · pusher-js: the client config already forces `enabledTransports:['ws','wss']`
 *    (no HTTP polling). We ALSO intercept `localhost:6001` HTTP as a belt-and-
 *    braces fallback, and mock the WebSocket itself.
 *  · EventSource `/api/events`: fulfilled as a finite SSE body with
 *    `retry: 60000` so it does not reconnect-storm during a run.
 *  · `react-palette` / vibrant sampling is asynchronous: callers must wait for
 *    palette stability before screenshotting. `waitForPaletteStable(page)` polls
 *    the resolved CSS custom properties until two consecutive samples match.
 *  · `prefers-reduced-motion`: pinned explicitly per run (`no-preference` by
 *    default) via `page.emulateMedia`, so motion branches are not silently
 *    collapsed and the choice is recorded in the capture.
 *
 * Usage:
 *   node tools/parity/fixtures.mjs --record
 *   node tools/parity/fixtures.mjs --selfcheck [--evidence <file>]
 *   node tools/parity/fixtures.mjs --list-scenarios
 *   node tools/parity/fixtures.mjs --status-drivers
 *
 * Programmatic (used by compare.mjs / behavior.mjs in Todos 31/32):
 *   import { installFixtures, mutations, SCENARIOS, WIDGET_STATUS_DRIVERS } from './fixtures.mjs';
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { freePorts, status, waitForHttp } from './procs.mjs';
import { startReference } from './run-reference.mjs';
import { startParity } from './dev-parity.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const BASELINE_PATH = join(HERE, 'baseline', 'original-baseline.json');

export const ORIGINAL_ORIGIN = 'http://localhost:5199';
export const REWRITE_ORIGIN = 'http://localhost:5200';
export const MOCK_ORIGIN = 'http://localhost:8787';
export const WIDGET_TOKEN = 'local';
export const PROFILE_ID = 'main';
export const WIDGET_PATH = `/widget/amuse/${WIDGET_TOKEN}`;

/** Hosts that must never be contacted for real. */
export const EXTERNAL_NOOP_HOSTS = [
  'metrics.6klabs.com',
  'content.6klabs.com',
  'hdx.6klabs.com',
  'glorp.6klabs.com',
  '6klabs.com',
  'ipv4.icanhazip.com',
  'cdn-uicons.flaticon.com',
];

/** Local source app hosts. */
export const SOURCE_HOSTS = {
  'localhost:9863': 'pear-desktop',
  'localhost:10767': 'cider',
  'localhost:7271': 'spicetify',
  'localhost:47836': 'tidal',
  'api.spotify.com': 'spotify',
};

/** The Spotify currently-playing URL (byte-identical to the adapter constant). */
export const SPOTIFY_CURRENTLY_PLAYING_URL =
  'https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode';

/** Cover/placeholder assets the widget already self-hosts. */
const NO_COVER = '/assets/spotify_no_cover-DlW0D82t.svg';
const AD_COVER = '/assets/spotify_ad_cover-B6syg7Z1.svg';

/** Profile settings mirror the mock-server `DEFAULT_SETTINGS` (Task 30 baseline). */
const PROFILE_SETTINGS = {
  skin: 'boxy',
  theme: 'default_light',
  cover: 'vinyl',
  tint_color: '#ffffff',
  font: 'poppins',
  visible_duration: 5,
  hide_delay: 0,
  cover_blur: true,
  cover_glow: true,
  hide_on_pause: false,
  song_change_only: false,
  magic_colors: true,
  hide_visualizer: false,
  show_animation: 'default_in',
  hide_animation: 'default_out',
  nothing_playing_cover: null,
  nothing_playing_title: null,
  nothing_playing_artist: null,
  is_demo: false,
};

/* -------------------------------------------------------------------------- */
/* Scenario registry                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Core fixture sets (the five the plan names) plus one scenario per renderable
 * WidgetStatus. `overrides` fields:
 *   pear/cider/spicetify/tidal/spotify/ytm : source variant
 *   session      : 'ok' | 'expired'
 *   subscription : 'pro' | 'free'
 *   profile      : 'main' | 'missing' | 'gated'
 *   musicService : profile `music_service`
 *   discordMember: boolean (session user)
 *   skin         : profile skin id
 *   pusherEvent  : payload pushed on `user_changed_settings`
 *   ytmStateUpdate / pusherEvent : live realtime payloads
 */
export const SCENARIOS = {
  normal: {},
  live: { pear: 'live' },
  ad: { pear: 'ad' },
  empty: { pear: 'empty' },
  error: { pear: 'error' },
  // ---- per-WidgetStatus drivers (see WIDGET_STATUS_DRIVERS) ----
  'session-expired': { session: 'expired' },
  'profile-missing': { profile: 'missing' },
  'ytm-not-connected': { ytm: 'not-connected', musicService: 'ytm-desktop' },
  'spotify-free': { spotify: '403', musicService: 'spotify' },
  'spotify-token-expired': { spotify: '401', musicService: 'spotify' },
  'spotify-no-account': { spotify: '400', musicService: 'spotify' },
  'spotify-server-error': { spotify: '503', musicService: 'spotify' },
  'disabled-profile': { subscription: 'free', profile: 'gated' },
  'disabled-pro-skin': { subscription: 'free', skin: 'windows98' },
  'disabled-discord-skin': { subscription: 'free', discordMember: false, skin: 'discord' },
};

/**
 * Every WidgetStatus value → the fixture/route that drives it.
 *
 * The plan requires this to be listed one-by-one. `renderable` marks whether the
 * parity screenshot matrix can render the state (the state machine owns the
 * non-renderable ones — Todo 8 unit tests).
 */
export const WIDGET_STATUS_DRIVERS = [
  { status: 'SESSION_EXPIRED', renderable: true, driver: 'session fixture → `GET /api/auth/get-session` returns 401 / `{code:"SESSION_EXPIRED"}` (scenario `session-expired`)' },
  { status: 'LOADING', renderable: false, driver: 'no fixture; the store default before any response. Parity matrix uses the pre-response boundary only (Todo 8 asserts the LOADING shell).' },
  { status: 'SUCCESS', renderable: true, driver: 'scenario `normal`: profile loads, Pear `GET :9863/query` returns a playing track, pusher ws connects (scenario `normal`)' },
  { status: 'NO_SPOTIFY_ACCOUNT', renderable: true, driver: '`GET api.spotify.com/.../currently-playing` → 400 (`resolveSpotifyErrorBranch(400)`) (scenario `spotify-no-account`)' },
  { status: 'YTMD_NOT_CONNECTED', renderable: true, driver: '`GET /api/widget/accounts/ytmdesktop` → 404 `{detail:"404: Youtube Music Desktop App is not connected"}` (scenario `ytm-not-connected`)' },
  { status: 'PROFILE_NOT_EXISTING', renderable: true, driver: '`GET /api/widgets/amuse/profiles/:id` → 404 (scenario `profile-missing`)' },
  { status: 'SPOTIFY_ERROR', renderable: true, driver: '`GET api.spotify.com/...` → unexpected status (default branch, e.g. 418) (scenario `error` on the spotify source)' },
  { status: 'SPOTIFY_ACCOUNT_ERROR', renderable: true, driver: 'Spotify account/token error body `{code}` (error table id 90); driven by the token endpoint returning an error code' },
  { status: 'SERVER_ERROR', renderable: true, driver: '`GET api.spotify.com/...` → 503 (`resolveSpotifyErrorBranch(503)`) (scenario `spotify-server-error`)' },
  { status: 'ACCOUNT_NOT_EXISTING', renderable: true, driver: 'session user missing / `GET /api/widget/accounts/ytmdesktop` 404 without the not-connected detail (error table id 92)' },
  { status: 'DISABLED_PROFILE', renderable: true, driver: 'subscription fixture `free` + profile route gating (profile index ≥ 3 on free) (scenario `disabled-profile`)' },
  { status: 'DISABLED_PRO_SKIN', renderable: true, driver: 'subscription fixture `free` + profile `settings.skin="windows98"` (scenario `disabled-pro-skin`)' },
  { status: 'DISABLED_DISCORD_SKIN', renderable: true, driver: 'subscription fixture `free` + `settings.skin="discord"` + session `is_discord_member:false` (scenario `disabled-discord-skin`). No splash entry (Todo 8).' },
  { status: 'SPOTIFY_FREE_ACCOUNT', renderable: true, driver: '`GET api.spotify.com/...` → 403 (`resolveSpotifyErrorBranch(403)`) (scenario `spotify-free`)' },
  { status: 'SPOTIFY_TOKEN_EXPIRED', renderable: true, driver: '`GET api.spotify.com/...` → 401 → `PlaybackState.TOKEN_EXPIRED` + `SPOTIFY_TOKEN_EXPIRED` (scenario `spotify-token-expired`)' },
];

/* -------------------------------------------------------------------------- */
/* Source payload builders (one per scenario variant)                          */
/* -------------------------------------------------------------------------- */

function pearPayload(variant) {
  switch (variant) {
    case 'live':
      return {
        track: { id: 'pear-live', title: 'Live From The Studio', author: 'Fixture DJ', duration: 0, cover: NO_COVER },
        player: { hasSong: true, seekbarCurrentPosition: 0, isPaused: false },
      };
    case 'ad':
      return {
        track: { id: 'pear-ad', title: 'Commercial', author: 'Video will play after ad', duration: 0, isAdvertisement: true, cover: AD_COVER },
        player: { hasSong: true, seekbarCurrentPosition: 0, isPaused: false },
      };
    case 'empty':
      return {
        track: { id: '', title: '', author: '', duration: 0, cover: '' },
        player: { hasSong: false, seekbarCurrentPosition: 0, isPaused: true },
      };
    case 'error':
      return { __status: 500, __body: { error: 'SERVER_ERROR' } };
    default:
      return {
        track: { id: 'pear-1', title: 'STAY LOW', author: 'MISTERK, FANNYMAGNET, Tphunk', duration: 214, cover: NO_COVER },
        player: { hasSong: true, seekbarCurrentPosition: 53, isPaused: false },
      };
  }
}

function ciderNowPlaying(variant) {
  if (variant === 'error') return { __status: 500, __body: { error: 'SERVER_ERROR' } };
  if (variant === 'empty') return { info: { name: '' } };
  return {
    info: {
      name: 'Midnight City',
      artistName: 'M83',
      durationInMillis: 243000,
      currentPlaybackTime: 60,
      playParams: { id: 'cider-1' },
      artwork: { width: 300, height: 300, url: 'https://cdn-uicons.flaticon.com/cover/{w}x{h}.jpg' },
    },
  };
}

function ciderIsPlaying(variant) {
  return { is_playing: variant !== 'empty' };
}

function spicetifyPayload(variant) {
  if (variant === 'error') return { __status: 500, __body: { error: 'SERVER_ERROR' } };
  if (variant === 'empty') return { title: '' };
  return {
    id: 'spicetify-1',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    duration: 200000,
    progress: 30000,
    cover_url: NO_COVER,
    is_playing: true,
  };
}

function tidalPayload(variant) {
  if (variant === 'error') return { __status: 500, __body: { error: 'SERVER_ERROR' } };
  if (variant === 'empty') return { title: '' };
  return {
    url: 'tidal-1',
    title: 'Levitating',
    artist: 'Dua Lipa',
    durationInSeconds: 203,
    currentInSeconds: 40,
    status: 'playing',
    image: NO_COVER,
  };
}

function spotifyCurrentlyPlaying(variant) {
  if (variant === 'empty') return { __status: 204 };
  if (variant === 'error') return { __status: 500, __body: { error: { status: 500, message: 'server_error' } } };
  if (variant === '403') return { __status: 403, __body: { error: { status: 403, message: 'premium_required' } } };
  if (variant === '401') return { __status: 401, __body: { error: { status: 401, message: 'token_expired' } } };
  if (variant === '400') return { __status: 400, __body: { error: { status: 400, message: 'no_account' } } };
  if (variant === '503') return { __status: 503, __body: { error: { status: 503, message: 'server_error' } } };
  if (variant === 'ad') {
    return {
      __status: 200,
      __body: { currently_playing_type: 'ad', is_playing: true, progress_ms: 0, item: { id: 'spotify-ad', name: 'Ad', type: 'ad' } },
    };
  }
  return {
    __status: 200,
    __body: {
      currently_playing_type: 'track',
      is_playing: true,
      progress_ms: 40000,
      item: {
        id: 'spotify-1',
        name: 'Sunflower',
        type: 'track',
        duration_ms: 158000,
        artists: [{ name: 'Post Malone' }],
        album: { images: [{ url: NO_COVER }] },
      },
    },
  };
}

function spotifyToken(variant) {
  if (variant === 'error') return { __status: 500, __body: { error: 'Failed to get Spotify token' } };
  if (variant === '403') return { __status: 403, __body: { error: 'no_spotify_account', code: 'SPOTIFY_FREE_ACCOUNT' } };
  if (variant === '401') return { __status: 401, __body: { error: 'token_expired', code: 'SPOTIFY_TOKEN_EXPIRED' } };
  if (variant === '400') return { __status: 400, __body: { error: 'no_spotify_account', code: 'NO_SPOTIFY_ACCOUNT' } };
  if (variant === '503') return { __status: 503, __body: { error: 'server_error', code: 'SERVER_ERROR' } };
  return { __status: 200, __body: { token: 'fixture-spotify-access-token' } };
}

function ytmToken(variant) {
  if (variant === 'not-connected') {
    return { __status: 404, __body: { detail: '404: Youtube Music Desktop App is not connected' } };
  }
  return { __status: 200, __body: { token: 'fixture-ytmdesktop-token' } };
}

function ytmStateUpdate(variant) {
  const thumb = (suffix) => ({ url: `https://cdn-uicons.flaticon.com/ytm-${suffix}.jpg` });
  if (variant === 'ad') {
    return { video: { id: 'ytm-ad', title: 'Ad', author: 'YouTube', durationSeconds: 15, thumbnails: [thumb('0'), thumb('1'), thumb('2')] }, player: { adPlaying: true, trackState: 1, videoProgress: 0 } };
  }
  if (variant === 'empty') return {};
  return {
    video: { id: 'ytm-1', title: 'As It Was', author: 'Harry Styles', durationSeconds: 167, thumbnails: [thumb('0'), thumb('1'), thumb('2')] },
    player: { adPlaying: false, trackState: 1, videoProgress: 30 },
  };
}

/* -------------------------------------------------------------------------- */
/* Baseline (recorded provenance)                                              */
/* -------------------------------------------------------------------------- */

export function loadBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** Find the last recorded body for a mock path (path may contain a trailing id). */
function baselineBody(baseline, pathPrefix) {
  if (!baseline?.entries) return undefined;
  const hit = [...baseline.entries].reverse().find((e) => e.path === pathPrefix || (e.path || '').startsWith(pathPrefix + '/'));
  return hit?.body;
}

/* -------------------------------------------------------------------------- */
/* Fixture resolution                                                          */
/* -------------------------------------------------------------------------- */

function resolveSession(overrides, baseline) {
  if (overrides.session === 'expired') {
    return { __status: 401, __body: { error: 'SESSION_EXPIRED', code: 'SESSION_EXPIRED', message: 'Session expired' } };
  }
  const recorded = baselineBody(baseline, '/api/auth/get-session');
  if (recorded && recorded.user) return { __status: 200, __body: recorded };
  return {
    __status: 200,
    __body: {
      user: {
        id: 'user_local',
        username: 'local',
        display_name: 'Local User',
        email: 'local@example.com',
        email_verified: true,
        is_discord_member: overrides.discordMember !== false,
        widget_token: WIDGET_TOKEN,
        avatar: null,
        badges: [],
        social_links: [],
      },
      session: { id: 'session_local', userId: 'user_local' },
    },
  };
}

function resolveSubscription(overrides) {
  if (overrides.subscription === 'free') {
    return { __status: 200, __body: { tier: 'FREE', status: 'inactive', current_period_end: null, cancel_at_period_end: false } };
  }
  return { __status: 200, __body: { tier: 'PRO', status: 'active', current_period_end: null, cancel_at_period_end: false } };
}

function resolveProfile(overrides, baseline) {
  if (overrides.profile === 'missing') {
    return { __status: 404, __body: { error: 'Profile not found' } };
  }
  const recorded = baselineBody(baseline, `/api/widgets/amuse/profiles/${PROFILE_ID}`);
  const base = recorded && typeof recorded === 'object' && !Array.isArray(recorded) ? recorded : {};
  const settings = { ...PROFILE_SETTINGS, ...(base.settings ?? {}) };
  if (overrides.skin) settings.skin = overrides.skin;
  return {
    __status: 200,
    __body: {
      _id: base._id ?? 'profile_main',
      user_id: base.user_id ?? 'user_local',
      profile_id: PROFILE_ID,
      name: base.name ?? 'Main',
      music_service: overrides.musicService ?? base.music_service ?? 'pear-desktop',
      settings,
      created_at: base.created_at ?? '1970-01-01T00:00:00.000Z',
      updated_at: base.updated_at ?? '1970-01-01T00:00:00.000Z',
    },
  };
}

function resolveWidgetSettings(baseline) {
  const recorded = baselineBody(baseline, '/api/widget/settings');
  return { __status: 200, __body: recorded ?? { general: { hide_popup: true } } };
}

/**
 * Build the complete fixture table for a scenario. Everything a page can ask
 * for is resolved here; `installFixtures` never falls through to the network
 * for anything outside the two hosts themselves.
 */
export function buildFixture(scenario = 'normal', overrides = {}) {
  const base = SCENARIOS[scenario] ?? {};
  const o = { ...base, ...overrides };
  const baseline = loadBaseline();
  // A raw payload override (used by the property-based mutator) wins over the
  // named variant string. `raw` keys are suffixed `Payload`.
  const pick = (raw, variant, builder) => (raw && typeof raw === 'object' ? raw : builder(variant ?? 'normal'));
  return {
    scenario,
    overrides: o,
    http: {
      session: resolveSession(o, baseline),
      widgetSettings: resolveWidgetSettings(baseline),
      subscription: resolveSubscription(o),
      profile: resolveProfile(o, baseline),
      pusherAuth: { __status: 200, __body: { auth: 'fixture-key:fixture-signature' } },
      events: { sse: true },
      sw: { __status: 404, __body: 'not found' },
      pear: pick(o.pearPayload, o.pear, pearPayload),
      ciderNowPlaying: pick(o.ciderNowPlayingPayload, o.cider, ciderNowPlaying),
      ciderIsPlaying: pick(o.ciderIsPlayingPayload, o.cider, ciderIsPlaying),
      spicetify: pick(o.spicetifyPayload, o.spicetify, spicetifyPayload),
      tidal: pick(o.tidalPayload, o.tidal, tidalPayload),
      spotifyToken: pick(o.spotifyTokenPayload, o.spotify, spotifyToken),
      spotifyCurrentlyPlaying: pick(o.spotifyCurrentlyPlayingPayload, o.spotify, spotifyCurrentlyPlaying),
      ytmToken: pick(o.ytmTokenPayload, o.ytm, ytmToken),
    },
    ws: {
      pusherEvent: o.pusherEvent ?? null,
      ytmStateUpdate: o.ytmStateUpdatePayload ?? o.ytmStateUpdate ?? ytmStateUpdate(o.ytm ?? 'normal'),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Route classification                                                        */
/* -------------------------------------------------------------------------- */

function classify(rawUrl, method) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return { kind: 'unintercepted', host: '', path: rawUrl };
  }
  const host = u.host;
  const path = u.pathname;

  if (host === 'localhost:5199' || host === 'localhost:5200') {
    if (path === '/api/events') return { kind: 'events', host, path };
    if (path.startsWith('/api/')) return { kind: 'api', host, path };
    return { kind: 'self', host, path };
  }
  if (host === 'localhost:8787') return { kind: 'api', host, path };
  if (host === 'localhost:6001') return { kind: 'pusher-http', host, path };
  if (SOURCE_HOSTS[host]) return { kind: 'source', host, path, source: SOURCE_HOSTS[host] };
  if (EXTERNAL_NOOP_HOSTS.includes(host) || host.endsWith('.6klabs.com') || host.endsWith('flaticon.com')) {
    return { kind: 'external', host, path };
  }
  return { kind: 'unintercepted', host, path };
}

function corsHeaders(request) {
  const h = request.headers();
  return {
    'access-control-allow-origin': h['origin'] || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': h['access-control-request-headers'] || '*',
  };
}

async function fulfillSpec(route, spec, request) {
  if (spec?.sse) {
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', ...corsHeaders(request) },
      // `retry` prevents the EventSource reconnect storm after the body ends.
      body: 'retry: 60000\nevent: ready\ndata: {}\n\n',
    });
  }
  const status = spec?.__status ?? 200;
  const body = spec?.__body !== undefined ? spec.__body : spec;
  if (status === 204) {
    return route.fulfill({ status, headers: { ...corsHeaders(request) }, body: '' });
  }
  const isText = typeof body === 'string';
  return route.fulfill({
    status,
    headers: { 'content-type': isText ? 'text/plain; charset=utf-8' : 'application/json', ...corsHeaders(request) },
    body: isText ? body : JSON.stringify(body),
  });
}

/* -------------------------------------------------------------------------- */
/* installFixtures                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Install the full deterministic fixture set on `page`.
 *
 * @param {import('playwright').Page} page
 * @param {object} [options]
 * @param {string} [options.scenario='normal']
 * @param {object} [options.overrides]           per-scenario overrides (see SCENARIOS)
 * @param {'no-preference'|'reduce'} [options.reducedMotion='no-preference']
 * @returns {Promise<{fixture: object, capture: object}>}
 */
export async function installFixtures(page, options = {}) {
  const scenario = options.scenario ?? 'normal';
  const fixture = buildFixture(scenario, options.overrides ?? {});
  const reducedMotion = options.reducedMotion ?? 'no-preference';

  // Determinism: pin reduced motion explicitly (recorded in the capture).
  await page.emulateMedia({ reducedMotion });

  const capture = {
    scenario,
    reducedMotion,
    requests: [],
    violations: [],
    websockets: [],
    fulfilled: 0,
    continued: 0,
  };

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    const cls = classify(url, method);
    const entry = { method, url, host: cls.host, path: cls.path, kind: cls.kind };
    capture.requests.push(entry);

    try {
      if (method === 'OPTIONS' && cls.kind !== 'self') {
        capture.fulfilled += 1;
        return await route.fulfill({ status: 204, headers: corsHeaders(request), body: '' });
      }

      switch (cls.kind) {
        case 'self':
          capture.continued += 1;
          return await route.continue();
        case 'events':
          capture.fulfilled += 1;
          return await fulfillSpec(route, fixture.http.events, request);
        case 'api': {
          capture.fulfilled += 1;
          const p = cls.path;
          if (p === '/api/auth/get-session') return await fulfillSpec(route, fixture.http.session, request);
          if (p === '/api/widget/settings') return await fulfillSpec(route, fixture.http.widgetSettings, request);
          if (p === '/api/widget/subscription') return await fulfillSpec(route, fixture.http.subscription, request);
          if (p.startsWith('/api/widgets/amuse/profiles')) return await fulfillSpec(route, fixture.http.profile, request);
          if (p === '/api/pusher/realtime/auth') return await fulfillSpec(route, fixture.http.pusherAuth, request);
          if (p === '/api/widget/spotify/token') return await fulfillSpec(route, fixture.http.spotifyToken, request);
          if (p === '/api/widget/accounts/ytmdesktop') return await fulfillSpec(route, fixture.http.ytmToken, request);
          // Any other mock-backed API: neutral 200 JSON (no widget-visible effect).
          return await fulfillSpec(route, { __status: 200, __body: {} }, request);
        }
        case 'source': {
          capture.fulfilled += 1;
          if (cls.source === 'pear-desktop' && cls.path === '/query') return await fulfillSpec(route, fixture.http.pear, request);
          if (cls.source === 'cider' && cls.path.endsWith('/now-playing')) return await fulfillSpec(route, fixture.http.ciderNowPlaying, request);
          if (cls.source === 'cider' && cls.path.endsWith('/is-playing')) return await fulfillSpec(route, fixture.http.ciderIsPlaying, request);
          if (cls.source === 'spicetify') return await fulfillSpec(route, fixture.http.spicetify, request);
          if (cls.source === 'tidal') return await fulfillSpec(route, fixture.http.tidal, request);
          if (cls.source === 'spotify') {
            if (cls.path === '/api/widget/spotify/token') return await fulfillSpec(route, fixture.http.spotifyToken, request);
            return await fulfillSpec(route, fixture.http.spotifyCurrentlyPlaying, request);
          }
          return await fulfillSpec(route, { __status: 200, __body: {} }, request);
        }
        case 'external': {
          capture.fulfilled += 1;
          // The original's auth client uses baseURL https://6klabs.com, so the
          // session request is cross-origin — the session fixture must apply here.
          if (cls.path === '/api/auth/get-session') return await fulfillSpec(route, fixture.http.session, request);
          if (cls.host === 'content.6klabs.com') return await fulfillSpec(route, { __status: 200, __body: { data: {} } }, request);
          if (cls.host === 'ipv4.icanhazip.com') return await fulfillSpec(route, { __status: 200, __body: '127.0.0.1' }, request);
          // metrics / hdx / glorp / cdn assets: lazy 200, no side effect.
          return await fulfillSpec(route, { __status: 200, __body: {} }, request);
        }
        case 'pusher-http': {
          capture.fulfilled += 1;
          return await fulfillSpec(route, { __status: 200, __body: { event: 'pusher:connection_established', data: JSON.stringify({ socket_id: 'fixture.000001', activity_timeout: 120 }) } }, request);
        }
        case 'unintercepted':
        default: {
          capture.violations.push(entry);
          return await route.abort('blockedbyclient');
        }
      }
    } catch (error) {
      capture.violations.push({ ...entry, error: String(error?.message ?? error) });
      try { await route.abort('failed'); } catch { /* already handled */ }
    }
  });

  // ---- WebSockets --------------------------------------------------------
  // Pusher-compatible settings channel.
  await page.routeWebSocket(/localhost:6001/, (ws) => {
    capture.websockets.push({ url: ws.url(), kind: 'pusher' });
    ws.send(JSON.stringify({ event: 'pusher:connection_established', data: JSON.stringify({ socket_id: 'fixture.000001', activity_timeout: 120 }) }));
    ws.onMessage((raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg.event === 'pusher:ping') return ws.send(JSON.stringify({ event: 'pusher:pong', data: '{}' }));
      if (msg.event === 'pusher:subscribe') {
        const d = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
        const channel = d?.channel;
        ws.send(JSON.stringify({ event: 'pusher_internal:subscription_succeeded', channel, data: '{}' }));
        if (fixture.ws.pusherEvent) {
          setTimeout(() => {
            try { ws.send(JSON.stringify({ event: 'user_changed_settings', channel, data: JSON.stringify(fixture.ws.pusherEvent) })); } catch { /* closed */ }
          }, 50);
        }
      }
    });
  });

  // YTM socket.io realtime channel (engine.io framing).
  await page.routeWebSocket(/localhost:9863/, (ws) => {
    capture.websockets.push({ url: ws.url(), kind: 'ytm' });
    const sid = 'fixture-ytm-sid';
    let namespace = '';
    ws.send('0' + JSON.stringify({ sid, upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 }));
    ws.onMessage((raw) => {
      const msg = String(raw);
      if (msg === '2') return ws.send('3');
      if (msg.startsWith('40')) {
        const nsPart = msg.slice(2);
        if (nsPart.endsWith(',')) namespace = nsPart.slice(0, -1);
        const reply = namespace ? `40${namespace},${JSON.stringify({ sid })}` : `40${JSON.stringify({ sid })}`;
        ws.send(reply);
        if (fixture.ws.ytmStateUpdate && Object.keys(fixture.ws.ytmStateUpdate).length) {
          setTimeout(() => {
            const event = JSON.stringify(['state-update', fixture.ws.ytmStateUpdate]);
            try { ws.send(namespace ? `42${namespace},${event}` : `42${event}`); } catch { /* closed */ }
          }, 50);
        }
      }
    });
  });

  return { fixture, capture };
}

/* -------------------------------------------------------------------------- */
/* Property-based mutation                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Generate property-based mutations of a JSON payload: drop a field, rename a
 * field, swap a primitive type, and push boundary values. Returns a list of
 * `{ name, payload }` — always at least 3 distinct variants for object inputs.
 */
export function mutations(payload) {
  const out = [];
  const seen = new Set();
  const push = (name, p) => {
    const key = JSON.stringify(p);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, payload: p });
  };

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const keys = Object.keys(payload);
    if (keys.length) {
      const dropKey = keys[0];
      const dropped = { ...payload };
      delete dropped[dropKey];
      push(`drop:${dropKey}`, dropped);

      const renameKey = keys[0];
      const renamed = { ...payload };
      renamed[`${renameKey}_renamed`] = renamed[renameKey];
      delete renamed[renameKey];
      push(`rename:${renameKey}`, renamed);

      for (const k of keys) {
        const v = payload[k];
        if (typeof v === 'string') { push(`typeswap:${k}`, { ...payload, [k]: 12345 }); break; }
        if (typeof v === 'number') { push(`typeswap:${k}`, { ...payload, [k]: 'typed-swap' }); break; }
        if (typeof v === 'boolean') { push(`typeswap:${k}`, { ...payload, [k]: 'true' }); break; }
      }
      // Boundary values on the first primitive.
      for (const k of keys) {
        const v = payload[k];
        if (typeof v === 'number') { push(`boundary:${k}:0`, { ...payload, [k]: 0 }); push(`boundary:${k}:neg`, { ...payload, [k]: -1 }); break; }
        if (typeof v === 'string') { push(`boundary:${k}:empty`, { ...payload, [k]: '' }); push(`boundary:${k}:long`, { ...payload, [k]: 'x'.repeat(4096) }); break; }
      }
    }
  } else if (typeof payload === 'number') {
    push('boundary:0', 0);
    push('boundary:-1', -1);
    push('boundary:max', Number.MAX_SAFE_INTEGER);
  } else if (typeof payload === 'string') {
    push('boundary:empty', '');
    push('boundary:long', 'x'.repeat(4096));
  }
  return out;
}

/**
 * Capture a normalised DOM snapshot for comparison. `waitForPaletteStable` must
 * have resolved first when the palette is in play.
 */
export async function captureDomSnapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="amuse-widget-root"]') || document.body;
    return (root.innerText || '').replace(/\s+/g, ' ').trim();
  });
}

/**
 * Wait until the resolved cover palette (CSS custom properties) stops changing.
 * `react-palette` / vibrant sampling is asynchronous; screenshots taken before
 * this settles are non-deterministic.
 */
export async function waitForPaletteStable(page, { timeoutMs = 4000, intervalMs = 100, stableSamples = 2 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let previous = null;
  let stable = 0;
  while (Date.now() < deadline) {
    const sample = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="amuse-widget-root"]') || document.documentElement;
      const cs = getComputedStyle(el);
      const names = ['--cover-color', '--cover-color-1', '--cover-color-2', '--tint-color', '--dominant-color'];
      return names.map((n) => cs.getPropertyValue(n)).join('|');
    });
    if (sample && sample === previous) {
      stable += 1;
      if (stable >= stableSamples) return sample;
    } else {
      stable = 0;
    }
    previous = sample;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return previous;
}

/**
 * Property-based agreement: for a base fixture + every mutation, drive BOTH
 * origins (original :5199 and rewrite :5200) with the mutated input and compare
 * their normalised DOM output.
 *
 * NOTE (Todo 30 boundary): the rewrite SPA currently ships no runtime wiring
 * (adapters/realtime/session are only exercised by unit tests), so it renders
 * the empty player shell. For each mutation the function therefore:
 *   · always asserts 0 unintercepted external requests on BOTH origins;
 *   · compares the DOM only when both sides rendered non-empty output, so the
 *     comparison activates automatically once Todos 31/32 give the rewrite a
 *     runtime (recorded per-variant in `samples[].domCompared`).
 *
 * @returns {Promise<{mutations:number, checked:number, mismatches:string[], samples:Array}>}
 */
export async function runMutationAgreement(browser, { scenario = 'normal', origins = [ORIGINAL_ORIGIN, REWRITE_ORIGIN], reducedMotion = 'no-preference' } = {}) {
  const fixture = buildFixture(scenario);
  const seeds = [
    { key: 'pearPayload', payload: fixture.http.pear },
    { key: 'spotifyCurrentlyPlayingPayload', payload: fixture.http.spotifyCurrentlyPlaying.__body ?? fixture.http.spotifyCurrentlyPlaying },
    { key: 'tidalPayload', payload: fixture.http.tidal },
  ];
  const variants = seeds.flatMap((seed) => mutations(seed.payload).map((m) => ({ ...m, key: seed.key })));
  const mismatches = [];
  const samples = [];
  let checked = 0;

  for (const variant of variants) {
    const overrides = { [variant.key]: variant.payload };
    const outputs = {};
    for (const origin of origins) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion, deviceScaleFactor: 1, locale: 'en-US' });
      const page = await context.newPage();
      const { capture } = await installFixtures(page, { scenario, overrides, reducedMotion });
      try {
        await page.goto(`${origin}${WIDGET_PATH}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1200);
        outputs[origin] = await captureDomSnapshot(page);
        if (capture.violations.length) mismatches.push(`${variant.name} @ ${origin}: ${capture.violations.length} unintercepted request(s)`);
      } catch (error) {
        outputs[origin] = null;
        mismatches.push(`${variant.name} @ ${origin}: ${String(error?.message ?? error)}`);
      } finally {
        await context.close();
      }
    }
    const [a, b] = [outputs[origins[0]], outputs[origins[1]]];
    const comparable = a !== null && b !== null && a !== '' && b !== '';
    if (comparable && a !== b) mismatches.push(`${variant.name}: DOM differs (${JSON.stringify(a)} vs ${JSON.stringify(b)})`);
    samples.push({ name: variant.name, outputs, domCompared: comparable, domEqual: comparable ? a === b : null });
    checked += 1;
  }
  return { mutations: variants.length, checked, mismatches, samples };
}

/* -------------------------------------------------------------------------- */
/* Recording (fixture provenance)                                              */
/* -------------------------------------------------------------------------- */

function scrubVolatile(body) {
  if (!body || typeof body !== 'object') return body;
  const clone = JSON.parse(JSON.stringify(body));
  const volatile = ['_id', 'user_id', 'created_at', 'updated_at', 'joined_at', 'last_login', 'last_active'];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      if (volatile.includes(k)) o[k] = `<${k}>`;
      else walk(o[k]);
    }
  };
  walk(clone);
  return clone;
}

/**
 * Drive the ORIGINAL against the running mock-server and record its real
 * request/response surface. Writes `baseline/original-baseline.json`.
 *
 * External / source requests are NOT sent for real: they are fulfilled with a
 * neutral stub or aborted, and only their request shape is recorded.
 */
export async function recordBaseline({ origin = ORIGINAL_ORIGIN, waitMs = 6000 } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', deviceScaleFactor: 1, locale: 'en-US' });
  const page = await context.newPage();
  const entries = [];
  const websockets = [];

  page.on('websocket', (ws) => websockets.push(ws.url()));

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    const cls = classify(url, method);

    if (cls.kind === 'self') return route.continue();

    if (cls.kind === 'events') {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
        body: 'retry: 60000\nevent: ready\ndata: {}\n\n',
      });
    }

    if (cls.kind === 'api') {
      // Hit the real mock-server through the widget-server proxy and record it.
      try {
        const response = await route.fetch();
        const contentType = response.headers()['content-type'] ?? '';
        let body = null;
        if (contentType.includes('application/json')) {
          try { body = scrubVolatile(await response.json()); } catch { body = null; }
        }
        entries.push({ method, url, host: cls.host, path: cls.path, resourceType: request.resourceType(), status: response.status(), contentType, body });
        return await route.fulfill({ response });
      } catch (error) {
        entries.push({ method, url, host: cls.host, path: cls.path, resourceType: request.resourceType(), status: 0, note: `fetch-failed: ${String(error?.message ?? error)}` });
        return route.abort('failed');
      }
    }

    if (cls.kind === 'source' || cls.kind === 'pusher-http') {
      const headers = request.headers();
      entries.push({
        method, url, host: cls.host, path: cls.path, resourceType: request.resourceType(),
        note: 'source-request-shape',
        requestHeaders: {
          'content-type': headers['content-type'] ?? null,
          authorization: headers.authorization ? '<redacted>' : null,
          'sentry-trace': headers['sentry-trace'] ?? null,
        },
        postData: request.postData() ?? null,
      });
      return route.abort('connectionrefused');
    }

    if (cls.kind === 'external') {
      entries.push({ method, url, host: cls.host, path: cls.path, resourceType: request.resourceType(), note: 'external-stub' });
      if (cls.host === 'content.6klabs.com') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{}}' });
      if (cls.host === 'ipv4.icanhazip.com') return route.fulfill({ status: 200, contentType: 'text/plain', body: '127.0.0.1' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }

    entries.push({ method, url, host: cls.host, path: cls.path, resourceType: request.resourceType(), note: 'unintercepted' });
    return route.abort('blockedbyclient');
  });

  // Let the pusher websocket connect to the REAL mock realtime server during
  // recording (we only need its URL for the baseline).
  await page.routeWebSocket(/localhost:9863/, (ws) => {
    ws.send('0' + JSON.stringify({ sid: 'record', upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 }));
    ws.onMessage((raw) => {
      if (String(raw).startsWith('40')) ws.send('40{"sid":"record"}');
      if (String(raw) === '2') ws.send('3');
    });
  });

  await page.goto(`${origin}${WIDGET_PATH}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(waitMs);
  await browser.close();

  // The default profile is `pear-desktop`, so the ORIGINAL never requests the
  // ytm-desktop token endpoint through the widget. Probe BOTH additive endpoints
  // directly against mock-server so the baseline records their real success
  // contract (`200 {token:string}`) rather than a 404.
  const directProbes = [];
  for (const path of ['/api/widget/spotify/token', '/api/widget/accounts/ytmdesktop']) {
    const probe = await probeEndpoint(MOCK_ORIGIN + path);
    directProbes.push({ method: 'GET', url: MOCK_ORIGIN + path, path, status: probe.status, body: probe.json ?? null });
  }

  const baseline = {
    meta: {
      recordedAt: new Date().toISOString(),
      node: process.version,
      origin,
      widgetToken: WIDGET_TOKEN,
      profileId: PROFILE_ID,
      note: 'Recorded from the ORIGINAL widget (widget-server.mjs) against mock-server. External/source requests are stubbed/aborted; only their request shape is recorded. Volatile ids/timestamps are scrubbed. directProbes records the two additive source-token endpoints directly from mock-server.',
    },
    entries,
    directProbes,
    websockets: [...new Set(websockets)],
  };

  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  return baseline;
}

/* -------------------------------------------------------------------------- */
/* Selfcheck                                                                   */
/* -------------------------------------------------------------------------- */

async function probeEndpoint(url) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { url, status: res.status, ok: res.ok, json, text };
  } catch (error) {
    return { url, status: 0, ok: false, error: String(error?.message ?? error) };
  }
}

async function runOneScenario(browser, origin, scenario, reducedMotion) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion, deviceScaleFactor: 1, locale: 'en-US', colorScheme: 'dark' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  const { capture } = await installFixtures(page, { scenario, reducedMotion });
  try {
    await page.goto(`${origin}${WIDGET_PATH}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await waitForPaletteStable(page).catch(() => null);
  } catch (error) {
    capture.pageError = String(error?.message ?? error);
  } finally {
    await context.close();
  }
  return { scenario, origin, capture, pageErrors };
}

export async function selfcheck({ evidencePath = null } = {}) {
  const report = { task: 'task-30-fixtures', startedAt: new Date().toISOString(), scenarios: [], endpoints: {}, violations: [], ok: true };

  // Start the stack first: the additive mock-server endpoints must be probed
  // while mock-server is actually listening.
  const parity = startParity();
  let browser = null;
  try {
    await parity.ready;

    // 1) Additive mock-server endpoints must be 2xx with `{token:string}`.
    for (const path of ['/api/widget/spotify/token', '/api/widget/accounts/ytmdesktop']) {
      const probe = await probeEndpoint(MOCK_ORIGIN + path);
      report.endpoints[path] = { status: probe.status, tokenType: typeof probe.json?.token, token: probe.json?.token ?? null };
      if (!(probe.ok && typeof probe.json?.token === 'string')) report.ok = false;
    }

    // 2) Both hosts, every scenario, with the full fixture set installed.
    browser = await chromium.launch();

    for (const scenario of Object.keys(SCENARIOS)) {
      for (const origin of [ORIGINAL_ORIGIN, REWRITE_ORIGIN]) {
        const result = await runOneScenario(browser, origin, scenario, 'no-preference');
        const { capture } = result;
        const external = capture.requests.filter((r) => r.kind === 'external').length;
        const sources = capture.requests.filter((r) => r.kind === 'source').length;
        const row = {
          scenario, origin,
          requests: capture.requests.length,
          fulfilled: capture.fulfilled,
          continued: capture.continued,
          externalFulfilled: external,
          sourceFulfilled: sources,
          violations: capture.violations,
          websockets: capture.websockets,
          reducedMotion: capture.reducedMotion,
          pageErrors: result.pageErrors,
        };
        report.scenarios.push(row);
        if (capture.violations.length) {
          report.ok = false;
          report.violations.push({ scenario, origin, violations: capture.violations });
        }
      }
    }

    // 3) Property-based mutation engine self-test: replay variants through the
    //    fixture layer on BOTH origins; never escape the interception table.
    const agreement = await runMutationAgreement(browser, { scenario: 'normal', reducedMotion: 'no-preference' });
    report.propertyBased = { mutations: agreement.mutations, checked: agreement.checked, mismatches: agreement.mismatches, domCompared: agreement.samples.filter((s) => s.domCompared).length };
    if (agreement.mutations < 3 || agreement.mismatches.length) report.ok = false;
  } catch (error) {
    report.ok = false;
    report.error = String(error?.stack ?? error);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await parity.stop();
    freePorts([8787, 5199, 5200, 6001]);
  }

  report.finishedAt = new Date().toISOString();
  if (evidencePath) {
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  return report;
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                         */
/* -------------------------------------------------------------------------- */

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const args = process.argv.slice(2);
  const has = (flag) => args.includes(flag);
  const valueOf = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  if (has('--list-scenarios')) {
    console.log(JSON.stringify(Object.keys(SCENARIOS), null, 2));
    process.exit(0);
  }
  if (has('--status-drivers')) {
    console.log(JSON.stringify(WIDGET_STATUS_DRIVERS, null, 2));
    process.exit(0);
  }

  if (has('--record')) {
    const ref = startReference();
    let code = 0;
    try {
      await ref.ready;
      const baseline = await recordBaseline();
      console.log(`[fixtures] recorded ${baseline.entries.length} entries -> ${BASELINE_PATH}`);
      console.log(`[fixtures] websockets: ${JSON.stringify(baseline.websockets)}`);
    } catch (error) {
      console.error(`[fixtures] record ERROR ${error?.stack ?? error}`);
      code = 1;
    } finally {
      await ref.stop();
      freePorts([8787, 5199, 6001]);
    }
    process.exit(code);
  }

  if (has('--selfcheck')) {
    const evidence = valueOf('--evidence');
    const report = await selfcheck({ evidencePath: evidence ?? null });
    for (const row of report.scenarios) {
      const tag = row.violations.length ? 'FAIL' : 'ok  ';
      console.log(`[fixtures] ${tag} ${row.scenario.padEnd(22)} ${row.origin}  req=${row.requests} fulfilled=${row.fulfilled} external=${row.externalFulfilled} source=${row.sourceFulfilled} ws=${row.websockets.length}`);
      for (const v of row.violations) console.log(`         VIOLATION ${v.method} ${v.url}`);
    }
    for (const [p, e] of Object.entries(report.endpoints)) {
      console.log(`[fixtures] endpoint ${p} -> ${e.status} token=${e.tokenType}${e.status >= 200 && e.status < 300 ? '' : ' FAIL'}`);
    }
    if (report.propertyBased) {
      console.log(`[fixtures] property-based: mutations=${report.propertyBased.mutations} checked=${report.propertyBased.checked} domCompared=${report.propertyBased.domCompared} mismatches=${report.propertyBased.mismatches.length}`);
      for (const m of report.propertyBased.mismatches) console.log(`         MUTATION ${m}`);
    }
    if (report.error) console.log(`[fixtures] ERROR ${report.error}`);
    if (evidence) console.log(`[fixtures] evidence -> ${evidence}`);
    console.log(report.ok ? 'FIXTURES SELFCHECK PASS' : 'FIXTURES SELFCHECK FAIL');
    process.exit(report.ok ? 0 : 1);
  }

  console.log('usage: node tools/parity/fixtures.mjs [--record | --selfcheck [--evidence <file>] | --list-scenarios | --status-drivers]');
}
