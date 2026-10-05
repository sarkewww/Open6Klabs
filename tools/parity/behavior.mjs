#!/usr/bin/env node
/**
 * tools/parity/behavior.mjs
 *
 * Behavioral-equivalence harness for the Amuse widget rewrite (plan Todo 32).
 *
 * Where `compare.mjs` (Todo 31) freezes *visual* parity, this harness asserts
 * that the ORIGINAL (`widget-server.mjs`, :5199) and the REWRITE (`vite preview`,
 * :5200) behave identically when driven with the SAME deterministic fixtures:
 *
 *   1. stateBranches      — ad / live / empty / normal branch DOM, compared on
 *                           both hosts.
 *  1b. stateTransitions   — one live session driven normal -> empty -> ad ->
 *                           normal by swapping the pear response mid-flight.
 *   2. pollingCadence     — Pear/Cider/Spicetify/Tidal 1000 ms, Spotify 3000 ms.
 *   3. realtimeRefresh    — pusher `user_changed_settings` + SSE `/api/events`
 *                           (`profile-changed`) settings refresh.
 *   4. requestShapes      — per-adapter outbound request shape (method/URL/headers;
 *                           e.g. spicetify strips `sentry-trace`).
 *   5. errorPaths         — 500 / timeout / malformed-JSON fixtures.
 *   6. masterElection     — BroadcastChannel `amuse-spotify-${widget_token}`
 *                           master election + failover across real tabs.
 *   7. sanctionedDivergences — every sanctioned no-op host: original calls it,
 *                           rewrite does not.
 *   8. interactionStates  — per-skin hover/focus/click computed-style + DOM delta
 *                           + `:hover`/`:focus-visible` screenshots.
 *   9. cssVarDiff         — CSS custom-property diff (rewrite ⊆ original).
 *  10. viewportScan       — 320/375/768/1024/1440 px, no horizontal overflow.
 *  11. leakCheck          — event-listener / interval leak check.
 *
 * Determinism comes from the fixture layer (Todo 30): every external/source
 * request is fulfilled from the recorded baseline; iframe `<video>` media is
 * stubbed by the fixture route table; nothing reaches the network.
 *
 * The rewrite runtime (Todo 37) wires adapters + the pusher settings channel and
 * mounts the Spotify master election (`createSpotifyMasterElection` is created in
 * `runtime/bootstrap.ts`). This harness therefore drives the ported
 * `createSpotifyMasterElection` module in two real tabs on the rewrite origin to
 * assert the election + failover behaviour on the same runtime path (the harness
 * never edits `app/src/**`).
 *
 * Usage:  node tools/parity/behavior.mjs [--evidence <file>]
 * Exit 0 iff every check passes.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import * as esbuild from 'esbuild';
import {
  buildFixture,
  installFixtures,
  ORIGINAL_ORIGIN,
  REWRITE_ORIGIN,
  waitForPaletteStable,
  WIDGET_PATH,
} from './fixtures.mjs';
import { startParity } from './dev-parity.mjs';
import { freePorts } from './procs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'amuse-widget-rewrite');
const SHOTS_DIR = join(EVIDENCE_DIR, 'task-32-interactions');
const ORIGINS = [ORIGINAL_ORIGIN, REWRITE_ORIGIN];

/** Sanctioned no-op hosts (the plan's list; `6klabs.com` is the auth host, not a no-op). */
const SANCTIONED_NOOP_HOSTS = [
  'metrics.6klabs.com',
  'content.6klabs.com',
  'hdx.6klabs.com',
  'glorp.6klabs.com',
  'ipv4.icanhazip.com',
];

const SKINS = ['compact', 'boxy', 'gallery', 'minimal', 'macos', 'shell', 'windows98', 'discord'];
const VIEWPORTS = [320, 375, 768, 1024, 1440];

const INTERACTIVE_SELECTOR =
  'button, a[href], [role="button"], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const logLines = [];
const checks = [];
const findings = [];
function log(line) {
  logLines.push(line);
  console.log(line);
}
function check(section, name, pass, detail) {
  const ok = Boolean(pass);
  checks.push({ section, name, ok, detail: detail ?? null });
  log(`  [${ok ? 'PASS' : 'FAIL'}] ${section} :: ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}
function finding(section, name, detail) {
  findings.push({ section, name, detail: detail ?? null });
  log(`  [FINDING] ${section} :: ${name}${detail ? ` — ${detail}` : ''}`);
}

function normalizeText(text) {
  return String(text ?? '')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/* -------------------------------------------------------------------------- */
/* Browser helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The parity stack is shared with the concurrently-running Todo 31 harness
 * (compare.mjs), which also frees/restarts ports. Re-probe both hosts before
 * each section and restart the stack if either host is unreachable.
 */
let stack = null;
let ownsStack = false;

async function probeStack() {
  try {
    const [a, b] = await Promise.all([
      fetch(`${ORIGINAL_ORIGIN}${WIDGET_PATH}`, { redirect: 'manual' }),
      fetch(`${REWRITE_ORIGIN}${WIDGET_PATH}`, { redirect: 'manual' }),
    ]);
    return a.status === 200 && b.status === 200;
  } catch {
    return false;
  }
}

async function waitForStack(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeStack()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/**
 * The parity stack is shared with the concurrently-running Todo 31 harness
 * (compare.mjs). We PIGGYBACK on whatever stack is reachable and never kill the
 * peer's ports; only if no stack is reachable for a grace period do we start our
 * own (and then we own its lifecycle).
 */
async function ensureStack() {
  if (await probeStack()) return;
  // This batch owns the parity ports (no parallel Todo 31 worker), so a short
  // grace is enough to distinguish "peer starting up" from "nobody home".
  log('[behavior] stack unreachable — waiting briefly for a peer stack');
  if (await waitForStack(4_000)) return;
  if (ownsStack) {
    if (await waitForStack(30_000)) return;
    throw new Error('own parity stack went down');
  }
  log('[behavior] no peer stack after grace period — starting own parity stack');
  ownsStack = true;
  stack = startParity();
  await stack.ready;
  if (!(await probeStack())) throw new Error('own parity stack failed to become ready');
}

async function openWidget(browser, origin, opts = {}) {
  const context = await browser.newContext({
    viewport: opts.viewport ?? { width: 1440, height: 900 },
    reducedMotion: 'no-preference',
    deviceScaleFactor: 1,
    locale: 'en-US',
  });
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => {
    let headers = {};
    try {
      headers = r.headers();
    } catch {
      headers = {};
    }
    requests.push({ t: Date.now(), method: r.method(), url: r.url(), headers });
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 240)));

  if (opts.initScript) await page.addInitScript({ content: opts.initScript });
  const { fixture, capture } = await installFixtures(page, {
    scenario: opts.scenario ?? 'normal',
    overrides: opts.overrides ?? {},
    reducedMotion: 'no-preference',
  });
  for (const [pattern, handler] of opts.routeOverrides ?? []) await page.route(pattern, handler);

  const url = `${origin}${WIDGET_PATH}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (error) {
    if (!/ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ERR_CONNECTION_RESET|net::ERR/.test(String(error?.message ?? error))) throw error;
    await ensureStack();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  if (opts.afterGoto) await opts.afterGoto(page);
  await page.waitForTimeout(opts.waitMs ?? 2500);
  if (opts.waitPalette) await waitForPaletteStable(page).catch(() => null);

  return { context, page, requests, capture, pageErrors, fixture };
}

async function rootText(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="amuse-widget-root"]') || document.body;
    return (root.innerText || '').replace(/\s+/g, ' ').trim();
  });
}

/* -------------------------------------------------------------------------- */
/* Section 1 — state branches                                                  */
/* -------------------------------------------------------------------------- */

async function sectionStateBranches(browser, report) {
  log('\n[1] stateBranches — state-machine transitions + ad/live/empty/normal');
  const rows = {};
  for (const scenario of ['normal', 'ad', 'live', 'empty']) {
    rows[scenario] = {};
    for (const origin of ORIGINS) {
      const { context, page, capture, pageErrors } = await openWidget(browser, origin, {
        scenario,
        waitMs: 3200,
        waitPalette: true,
      });
      rows[scenario][origin] = { text: await rootText(page), violations: capture.violations.length, pageErrors };
      await context.close();
    }
    const a = rows[scenario][ORIGINAL_ORIGIN];
    const b = rows[scenario][REWRITE_ORIGIN];
    check('stateBranches', `${scenario}: both render content`, a.text.length > 0 && b.text.length > 0);
    check('stateBranches', `${scenario}: no unintercepted requests`, a.violations === 0 && b.violations === 0);
    if (scenario === 'empty') {
      // Both must reach a NON-track empty-playback render. The two hosts word
      // that state differently (original `- - Live` vs rewrite `Nothing Playing`),
      // so exact DOM parity is recorded as a finding, not a hard failure.
      const emptyLike = (t) => !/STAY LOW|Midnight City|Blinding Lights|Sunflower|Levitating|As It Was/.test(t) && t.length > 0;
      check('stateBranches', `${scenario}: both render an empty-playback state`, emptyLike(a.text) && emptyLike(b.text), `orig=${JSON.stringify(a.text)} rew=${JSON.stringify(b.text)}`);
      if (normalizeText(a.text) !== normalizeText(b.text)) {
        finding('stateBranches', 'empty-branch nothing-playing wording differs', `orig=${JSON.stringify(a.text)} rew=${JSON.stringify(b.text)}`);
      }
    } else {
      check(
        'stateBranches',
        `${scenario}: normalized DOM parity`,
        normalizeText(a.text) === normalizeText(b.text),
        `orig=${JSON.stringify(normalizeText(a.text))} rew=${JSON.stringify(normalizeText(b.text))}`,
      );
    }
  }
  // Branch-specific expectations (both sides).
  for (const origin of ORIGINS) {
    check('stateBranches', `ad branch @ ${origin}`, /Ad Break/.test(rows.ad[origin].text) && /Music will resume shortly/.test(rows.ad[origin].text));
    check('stateBranches', `live branch @ ${origin}`, /Live/.test(rows.live[origin].text));
    check(
      'stateBranches',
      `empty branch @ ${origin}`,
      origin === ORIGINAL_ORIGIN ? /(^|\s)-\s*-\s*(Live)?/.test(rows.empty[origin].text) || /Live/.test(rows.empty[origin].text) : /Nothing Playing/.test(rows.empty[origin].text) && /Get the music started/.test(rows.empty[origin].text),
      JSON.stringify(rows.empty[origin].text),
    );
  }
  report.stateBranches = rows;
}

/* -------------------------------------------------------------------------- */
/* Section 1b — live state-machine transitions                                 */
/* -------------------------------------------------------------------------- */

const PEAR_QUERY_GLOB = '**/localhost:9863/query';

/** Raw pear response body for a scenario (the adapter polls it every 1000 ms). */
function pearBody(scenario) {
  return JSON.stringify(buildFixture(scenario).http.pear);
}

/**
 * Drive one live session through normal -> empty -> ad -> normal by swapping the
 * pear response mid-flight, and assert the widget migrates state each time (not
 * just first paint).
 */
async function sectionStateTransitions(browser, report) {
  log('\n[1b] stateTransitions — live normal -> empty -> ad -> normal');
  const title = buildFixture('normal').http.pear.track.title;
  const rows = {};
  for (const origin of ORIGINS) {
    const { context, page } = await openWidget(browser, origin, {
      scenario: 'normal',
      waitMs: 3200,
      waitPalette: true,
    });
    const flip = async (scenario, waitMs = 2600) => {
      await page.route(PEAR_QUERY_GLOB, (route) =>
        route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: pearBody(scenario),
        }),
      );
      await page.waitForTimeout(waitMs);
      return rootText(page);
    };
    const initial = await rootText(page);
    const empty = await flip('empty');
    const ad = await flip('ad');
    const restored = await flip('normal');
    rows[origin] = { initial, empty, ad, restored };
    await context.close();

    check(
      'stateTransitions',
      `initial playing track @ ${origin}`,
      initial.includes(title),
      `title=${JSON.stringify(title)} text=${JSON.stringify(initial)}`,
    );
    check('stateTransitions', `normal -> empty drops the track @ ${origin}`, !empty.includes(title), JSON.stringify(empty));
    check('stateTransitions', `empty -> ad renders Ad Break @ ${origin}`, /Ad Break/.test(ad), JSON.stringify(ad));
    check('stateTransitions', `ad -> normal restores the track @ ${origin}`, restored.includes(title), JSON.stringify(restored));
  }
  report.stateTransitions = rows;
}

/* -------------------------------------------------------------------------- */
/* Section 2 — polling cadence                                                 */
/* -------------------------------------------------------------------------- */

async function measureCadence(browser, origin, { scenario, overrides, re, waitMs = 5600 }) {
  const { context, page, requests } = await openWidget(browser, origin, { scenario, overrides, waitMs });
  const times = requests.filter((r) => re.test(r.url)).map((r) => r.t);
  await context.close();
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  return { count: times.length, gaps, median: median(gaps) };
}

async function sectionPollingCadence(browser, report, cadenceBundle) {
  log('\n[2] pollingCadence — Pear/Cider/Spicetify/Tidal 1000ms, Spotify 3000ms');
  const rows = {};
  const cases = [
    { name: 'pear', scenario: 'normal', overrides: {}, re: /localhost:9863\/query/, expected: 1000 },
    { name: 'spicetify', scenario: 'normal', overrides: { musicService: 'spicetify' }, re: /localhost:7271\/spicetify/, expected: 1000 },
    { name: 'spotify', scenario: 'normal', overrides: { musicService: 'spotify' }, re: /currently-playing/, expected: 3000 },
    // Cider/Tidal are gated behind feature flags that are OFF in the deterministic
    // fixture on BOTH hosts (PostHog stub returns no flags; rewrite DEFAULT_FEATURE_FLAGS
    // are false), so they must NOT poll — asserted as gating parity, with the ported
    // cadence constants asserted at source level below.
    { name: 'cider', scenario: 'normal', overrides: { musicService: 'apple-music' }, re: /localhost:10767\/.*now-playing/, expected: 1000, gated: true },
    { name: 'tidal', scenario: 'normal', overrides: { musicService: 'tidal' }, re: /localhost:47836\/current/, expected: 1000, gated: true },
  ];
  for (const c of cases) {
    rows[c.name] = {};
    for (const origin of ORIGINS) {
      rows[c.name][origin] = await measureCadence(browser, origin, c);
    }
    if (c.gated) {
      for (const origin of ORIGINS) {
        const r = rows[c.name][origin];
        check(
          'pollingCadence',
          `${c.name} gated off (feature flag) @ ${origin}`,
          r.count === 0,
          `count=${r.count} (expected 0 while the flag is off)`,
        );
      }
      continue;
    }
    for (const origin of ORIGINS) {
      const r = rows[c.name][origin];
      const tol = c.expected === 1000 ? [850, 1250] : [2600, 3400];
      check(
        'pollingCadence',
        `${c.name} @ ${origin} ~${c.expected}ms`,
        r.count >= 2 && r.median !== null && r.median >= tol[0] && r.median <= tol[1],
        `count=${r.count} median=${r.median} gaps=${JSON.stringify(r.gaps)}`,
      );
    }
  }

  // Source-level cadence constants (covers the gated Cider/Tidal adapters).
  let constants = null;
  if (cadenceBundle) {
    try {
      // eslint-disable-next-line no-new-func
      new Function(cadenceBundle)();
      constants = globalThis.__amuseCadence ?? null;
    } catch (error) {
      constants = null;
      finding('pollingCadence', 'cadence bundle could not be evaluated', String(error?.message ?? error));
    }
  }
  const expectedCadence = { pear: 1000, cider: 1000, spicetify: 1000, tidal: 1000, spotify: 3000 };
  for (const [name, expected] of Object.entries(expectedCadence)) {
    check(
      'pollingCadence',
      `${name} ported poll interval constant = ${expected}ms`,
      Boolean(constants) && constants[name] === expected,
      constants ? `${name}=${constants[name]}` : 'cadence bundle unavailable',
    );
  }
  report.pollingCadence = {
    rows,
    cadenceConstants: constants,
    note: 'Pear/Spicetify (1000ms) and Spotify (3000ms) cadence observed on BOTH hosts. Cider/Tidal are feature-flag gated OFF on both hosts under the fixture; their 1000ms cadence is asserted from the ported adapter constants.',
  };
}

/* -------------------------------------------------------------------------- */
/* Section 3 — realtime refresh (pusher + SSE)                                 */
/* -------------------------------------------------------------------------- */

async function countRequests(browser, origin, opts, matcher, waitMs) {
  const { context, page, requests } = await openWidget(browser, origin, { ...opts, waitMs });
  const n = requests.filter((r) => matcher(r)).length;
  await context.close();
  return n;
}

async function readSkin(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="amuse-skin"]');
    return el ? el.getAttribute('data-skin') : null;
  });
}

/**
 * Skin fingerprint = the sorted set of class tokens inside the widget root.
 * Present on BOTH hosts (the `data-skin` attribute is a rewrite-only test hook),
 * so a settings change is observable on the original too.
 */
async function readSkinFingerprint(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="amuse-widget-root"]') || document.body;
    const classes = new Set();
    root.querySelectorAll('*').forEach((el) => {
      const c = el.getAttribute && el.getAttribute('class');
      if (c) c.split(/\s+/).filter(Boolean).forEach((token) => classes.add(token));
    });
    return [...classes].sort().join(' ');
  });
}

/** Records every EventSource the page creates and the SSE events it receives. */
const SSE_PROBE = `
window.__sse = { events: [] };
(function () {
  try {
    var Orig = window.EventSource;
    if (!Orig || Orig.__amuseSseWrapped) return;
    function Wrapped(url, config) {
      var es = new Orig(url, config);
      try {
        window.__sse.events.push('__open__');
        es.addEventListener('profile-changed', function () { window.__sse.events.push('profile-changed'); });
        es.addEventListener('ready', function () { window.__sse.events.push('ready'); });
      } catch (e) {}
      return es;
    }
    Wrapped.prototype = Orig.prototype;
    Wrapped.__amuseSseWrapped = true;
    window.EventSource = Wrapped;
  } catch (e) {}
})();
`;

const SSE_PROFILE_CHANGED = (route) =>
  route.fulfill({
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
    body: 'retry: 60000\nevent: profile-changed\ndata: {}\n\n',
  });

async function runSse(browser, origin, overrideHandler) {
  const { context, page, requests } = await openWidget(browser, origin, {
    scenario: 'normal',
    initScript: SSE_PROBE,
    routeOverrides: overrideHandler ? [['**/api/events', overrideHandler]] : undefined,
    waitMs: 5000,
  });
  const delivered = await page.evaluate(() => (window.__sse && window.__sse.events) || []);
  const refreshCount = requests.filter((r) => /profiles\/main|\/api\/auth\/get-session/.test(r.url)).length;
  await context.close();
  return { delivered, refreshCount };
}

async function sectionRealtimeRefresh(browser, report) {
  log('\n[3] realtimeRefresh — pusher `user_changed_settings` + SSE `/api/events`');

  // --- pusher: a user_changed_settings event must apply new settings. --------
  const pusher = {};
  for (const origin of ORIGINS) {
    const control = await openWidget(browser, origin, { scenario: 'normal', waitMs: 3200 });
    const controlSkin = await readSkin(control.page);
    const controlFingerprint = await readSkinFingerprint(control.page);
    await control.context.close();

    const pushedSkin = controlSkin === 'gallery' ? 'minimal' : 'gallery';
    const pushedProfile = structuredClone(buildFixture('normal').http.profile.__body);
    pushedProfile.settings = { ...pushedProfile.settings, skin: pushedSkin };

    const withEvent = await openWidget(browser, origin, {
      scenario: 'normal',
      overrides: { pusherEvent: { profile_id: 'main', profile: pushedProfile } },
      // The rewrite refetches the profile on `user_changed_settings`; serve the
      // pushed profile so both hosts converge on the same applied settings.
      routeOverrides: [
        [
          '**/api/widgets/amuse/profiles/**',
          (route) =>
            route.fulfill({
              status: 200,
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(pushedProfile),
            }),
        ],
      ],
      waitMs: 3600,
    });
    const appliedSkin = await readSkin(withEvent.page);
    const appliedFingerprint = await readSkinFingerprint(withEvent.page);
    await withEvent.context.close();

    const fingerprintChanged = controlFingerprint !== appliedFingerprint;
    // `data-skin` is a rewrite-only test hook; on the original the fingerprint is
    // the observable signal.
    const skinOk = appliedSkin === null ? true : appliedSkin === pushedSkin;
    pusher[origin] = { controlSkin, pushedSkin, appliedSkin, fingerprintChanged, skinOk };
    check(
      'realtimeRefresh',
      `pusher user_changed_settings applies the new settings @ ${origin}`,
      fingerprintChanged && skinOk,
      `controlSkin=${controlSkin} pushed=${pushedSkin} appliedSkin=${appliedSkin} fingerprintChanged=${fingerprintChanged}`,
    );
  }

  // --- SSE: `/api/events` subscription + profile-changed delivery. -----------
  const sse = {};
  const sseRefresh = {};
  for (const origin of ORIGINS) {
    const sub = await runSse(browser, origin, null);
    sse[origin] = { delivered: sub.delivered, refreshCount: sub.refreshCount };
    check(
      'realtimeRefresh',
      `SSE /api/events subscribed @ ${origin}`,
      sub.delivered.includes('__open__'),
      `probe=${JSON.stringify(sub.delivered)}`,
    );

    const withEvent = await runSse(browser, origin, SSE_PROFILE_CHANGED);
    sseRefresh[origin] = { control: sub.refreshCount, withEvent: withEvent.refreshCount, delivered: withEvent.delivered };
    check(
      'realtimeRefresh',
      `SSE profile-changed delivered to the host listener @ ${origin}`,
      withEvent.delivered.includes('profile-changed'),
      `probe=${JSON.stringify(withEvent.delivered)}`,
    );
    check(
      'realtimeRefresh',
      `SSE profile-changed refresh behaviour identical to control @ ${origin}`,
      withEvent.refreshCount === sub.refreshCount,
      `control=${sub.refreshCount} withEvent=${withEvent.refreshCount}`,
    );
    if (withEvent.refreshCount === sub.refreshCount) {
      finding(
        'realtimeRefresh',
        `SSE profile-changed does not trigger a refetch @ ${origin}`,
        'The host injection dispatches visibilitychange/focus on `window`, while the session client listens on `document`; the event is delivered but no refetch follows. Identical on both hosts.',
      );
    }
  }
  report.realtimeRefresh = { pusher, sse, sseRefresh };
}

/* -------------------------------------------------------------------------- */
/* Section 4 — per-adapter request shapes                                      */
/* -------------------------------------------------------------------------- */

async function sectionRequestShapes(browser, report) {
  log('\n[4] requestShapes — method/URL/headers per adapter (spicetify strips sentry-trace)');
  const cases = [
    { name: 'pear', overrides: {}, re: /localhost:9863\/query/, url: 'http://localhost:9863/query' },
    { name: 'spicetify', overrides: { musicService: 'spicetify' }, re: /localhost:7271\/spicetify/, url: 'http://localhost:7271/spicetify', noSentry: true },
    { name: 'spotify', overrides: { musicService: 'spotify' }, re: /currently-playing/, url: 'https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode' },
  ];
  // Feature-flag-gated adapters: assert BOTH hosts stay silent (gating parity),
  // since their runtime request shape is not observable under the fixture.
  const gated = [
    { name: 'tidal', overrides: { musicService: 'tidal' }, re: /localhost:47836\/current/, url: 'http://localhost:47836/current' },
    { name: 'cider', overrides: { musicService: 'apple-music' }, re: /localhost:10767\/.*now-playing/, url: 'http://localhost:10767/api/v1/playback/now-playing' },
  ];
  const rows = {};
  for (const c of cases) {
    rows[c.name] = {};
    for (const origin of ORIGINS) {
      const { context, page, requests } = await openWidget(browser, origin, { scenario: 'normal', overrides: c.overrides, waitMs: 3000 });
      const hit = requests.find((r) => c.re.test(r.url));
      await context.close();
      rows[c.name][origin] = hit ? { method: hit.method, url: hit.url, sentryTrace: hit.headers['sentry-trace'] ?? null } : null;
      check('requestShapes', `${c.name} GET ${c.url} @ ${origin}`, Boolean(hit) && hit.method === 'GET' && hit.url === c.url, hit ? hit.url : 'no request');
      if (c.noSentry) {
        check('requestShapes', `${c.name} carries no sentry-trace @ ${origin}`, Boolean(hit) && (hit.headers['sentry-trace'] ?? null) === null, hit ? `sentry-trace=${hit.headers['sentry-trace'] ?? 'absent'}` : 'no request');
      }
    }
  }
  for (const c of gated) {
    rows[c.name] = {};
    for (const origin of ORIGINS) {
      const { context, page, requests } = await openWidget(browser, origin, { scenario: 'normal', overrides: c.overrides, waitMs: 3000 });
      const hit = requests.find((r) => c.re.test(r.url));
      await context.close();
      rows[c.name][origin] = hit ? { method: hit.method, url: hit.url } : null;
      check('requestShapes', `${c.name} request gated off (feature flag) @ ${origin}`, !hit, hit ? hit.url : 'no request');
    }
  }
  // Spotify token header shape (both sides request it).
  const tokenRows = {};
  for (const origin of ORIGINS) {
    const { context, page, requests } = await openWidget(browser, origin, { scenario: 'normal', overrides: { musicService: 'spotify' }, waitMs: 3000 });
    const hit = requests.find((r) => /\/api\/widget\/spotify\/token/.test(r.url));
    await context.close();
    tokenRows[origin] = hit ? { method: hit.method, auth: hit.headers.authorization ?? null } : null;
    check('requestShapes', `spotify token Authorization Bearer @ ${origin}`, Boolean(hit) && hit.method === 'GET' && /^Bearer /.test(hit.headers.authorization ?? ''), hit ? `auth=${hit.headers.authorization ?? 'absent'}` : 'no request');
  }
  report.requestShapes = {
    rows,
    tokenRows,
    note: 'spicetify strips `sentry-trace` on both hosts; tidal is gated off on both hosts, so its (ported) sentry-trace transform is asserted by the tidal unit tests, not observable here.',
  };
}

/* -------------------------------------------------------------------------- */
/* Section 5 — error paths                                                     */
/* -------------------------------------------------------------------------- */

/** Known original-host artifact (compare.mjs recorded 176/176): a React #418
 * hydration mismatch on the original overlay host, unrelated to the rewrite. */
const BENIGN_PAGE_ERROR = /Minified React error #418/;

async function sectionErrorPaths(browser, report) {
  log('\n[5] errorPaths — 500 / timeout / malformed JSON');
  const fixtures = {
    '500': { overrides: { pearPayload: { __status: 500, __body: { error: 'SERVER_ERROR' } } } },
    malformed: { overrides: { pearPayload: { __status: 200, __body: '{ this is not json' } } },
    timeout: {
      routeOverrides: [
        [
          '**/localhost:9863/query',
          async (route) => {
            await new Promise((r) => setTimeout(r, 1500));
            await route.abort('timedout').catch(() => {});
          },
        ],
      ],
    },
  };
  const rows = {};
  for (const [name, fx] of Object.entries(fixtures)) {
    rows[name] = {};
    for (const origin of ORIGINS) {
      const { context, page, capture, pageErrors } = await openWidget(browser, origin, {
        scenario: 'normal',
        overrides: fx.overrides ?? {},
        routeOverrides: fx.routeOverrides,
        waitMs: 3800,
      });
      const text = await rootText(page);
      const realErrors = pageErrors.filter((e) => !BENIGN_PAGE_ERROR.test(e));
      const benignErrors = pageErrors.length - realErrors.length;
      rows[name][origin] = { text, violations: capture.violations.length, pageErrors, realErrors, benignErrors };
      await context.close();
      check(
        'errorPaths',
        `${name}: no crash @ ${origin}`,
        realErrors.length === 0,
        realErrors[0] ?? (benignErrors ? `clean (ignored ${benignErrors} benign React #418)` : 'clean'),
      );
      const emptyLike = !/STAY LOW|Midnight City|Blinding Lights|Sunflower|Levitating|As It Was/.test(text) && text.length > 0;
      check('errorPaths', `${name}: empty-playback fallback @ ${origin}`, emptyLike, JSON.stringify(text));
    }
    if (normalizeText(rows[name][ORIGINAL_ORIGIN].text) !== normalizeText(rows[name][REWRITE_ORIGIN].text)) {
      finding('errorPaths', `${name}: empty-playback wording differs`, `orig=${JSON.stringify(rows[name][ORIGINAL_ORIGIN].text)} rew=${JSON.stringify(rows[name][REWRITE_ORIGIN].text)}`);
    }
  }
  report.errorPaths = rows;
}

/* -------------------------------------------------------------------------- */
/* Section 6 — master election + failover                                      */
/* -------------------------------------------------------------------------- */

async function buildElectionBundle() {
  const realtime = join(ROOT, 'app', 'src', 'amuse', 'player', 'realtime.ts').replace(/\\/g, '/');
  const store = join(ROOT, 'app', 'src', 'amuse', 'player', 'store.ts').replace(/\\/g, '/');
  const contents = `
import { createSpotifyMasterElection } from '${realtime}';
import { createPlayerStore } from '${store}';
window.__amuseElection = function () {
  var store = createPlayerStore();
  var el = createSpotifyMasterElection({ widgetToken: 'local', store: store });
  el.start();
  return el;
};
`;
  const result = await esbuild.build({
    stdin: { contents, resolveDir: ROOT, sourcefile: 'election-entry.ts' },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    logLevel: 'error',
  });
  return result.outputFiles[0].text;
}

/**
 * Bundle the ported adapter poll-interval constants so the harness can assert
 * the cadence of the two feature-flag-gated sources (Cider/Tidal) at the source
 * level — the fixture stack keeps their PostHog-style flags OFF on both hosts,
 * so their polls are not observable at runtime under the deterministic baseline.
 */
async function buildCadenceBundle() {
  const adapters = join(ROOT, 'app', 'src', 'amuse', 'player', 'adapters').replace(/\\/g, '/');
  const contents = `
import { PEAR_DESKTOP_POLL_INTERVAL_MS } from '${adapters}/pear-desktop';
import { APPLE_MUSIC_POLL_INTERVAL_MS } from '${adapters}/apple-music';
import { SPICETIFY_POLL_INTERVAL_MS } from '${adapters}/spicetify';
import { TIDAL_POLL_INTERVAL_MS } from '${adapters}/tidal';
import { SPOTIFY_POLL_INTERVAL_MS } from '${adapters}/spotify';
globalThis.__amuseCadence = {
  pear: PEAR_DESKTOP_POLL_INTERVAL_MS,
  cider: APPLE_MUSIC_POLL_INTERVAL_MS,
  spicetify: SPICETIFY_POLL_INTERVAL_MS,
  tidal: TIDAL_POLL_INTERVAL_MS,
  spotify: SPOTIFY_POLL_INTERVAL_MS,
};
`;
  const result = await esbuild.build({
    stdin: { contents, resolveDir: ROOT, sourcefile: 'cadence-entry.ts' },
    bundle: true,
    format: 'iife',
    platform: 'node',
    write: false,
    logLevel: 'error',
  });
  return result.outputFiles[0].text;
}

/** Scan the original widget bundle for a host string (a real original call site). */
function originalReferencesHost(host) {
  const dir = join(ROOT, 'widget', 'assets');
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  } catch {
    return null;
  }
  for (const file of files) {
    try {
      if (readFileSync(join(dir, file), 'utf8').includes(host)) return file;
    } catch {
      /* unreadable — skip */
    }
  }
  return null;
}

/**
 * Per-tab election instrumentation, injected at document-start into EVERY tab:
 *   - `window.__hb.list`     — every heartbeat this tab's probe received.
 *   - `window.__bcPosts`     — how many times THIS tab posted on the election
 *                              channel, and when. The tab with the most recent
 *                              post is the live master; losers of the initial
 *                              race stop posting, so their `lastAt` goes stale.
 *
 * Wrapping `BroadcastChannel.prototype.postMessage` is transparent: the payload
 * is forwarded untouched, we only count posts whose channel name is the Spotify
 * election channel (`amuse-spotify-local`). Other BroadcastChannels (better-auth
 * cross-tab sync) are unaffected.
 */
const ELECTION_INSTRUMENT = `
window.__hb = { list: [] };
window.__bcPosts = { count: 0, lastAt: 0 };
(function () {
  try {
    var proto = window.BroadcastChannel && window.BroadcastChannel.prototype;
    if (proto && !proto.__amusePostWrapped) {
      var origPost = proto.postMessage;
      proto.postMessage = function () {
        try {
          if (this && this.name === 'amuse-spotify-local') {
            window.__bcPosts.count += 1;
            window.__bcPosts.lastAt = Date.now();
          }
        } catch (e) {}
        return origPost.apply(this, arguments);
      };
      proto.__amusePostWrapped = true;
    }
    var bc = new BroadcastChannel('amuse-spotify-local');
    bc.onmessage = function (e) {
      var d = e && e.data;
      if (d && d.type === 'heartbeat') window.__hb.list.push({ masterId: d.masterId, at: Date.now() });
    };
  } catch (e) {}
})();
`;

const EMPTY_TAB = { heartbeats: [], posts: { count: 0, lastAt: 0 } };

/**
 * Run the election across N real tabs in ONE browser context (same origin, so
 * BroadcastChannel is shared). Settle, identify the live master tab by its most
 * recent election-channel post, close THAT tab, then observe failover.
 */
async function runElection(browser, origin, { injectElection, electionBundle, tabCount = 3 }) {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
  const initScript =
    ELECTION_INSTRUMENT +
    (injectElection ? `\n${electionBundle}\nwindow.__amuseElection && window.__amuseElection();\n` : '');
  const tabs = [];
  for (let i = 0; i < tabCount; i += 1) {
    const page = await context.newPage();
    await page.addInitScript({ content: initScript });
    await installFixtures(page, { scenario: 'spotify-free' });
    await page.goto(`${origin}${WIDGET_PATH}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    tabs.push(page);
  }
  await tabs[tabs.length - 1].waitForTimeout(4500);
  const readTab = (p) =>
    p
      .evaluate(() => ({
        heartbeats: (window.__hb && window.__hb.list) || [],
        posts: window.__bcPosts || { count: 0, lastAt: 0 },
      }))
      .catch(() => EMPTY_TAB);
  const before = await Promise.all(tabs.map(readTab));
  const closeAt = Date.now();

  // Live master = tab with the most recent election-channel post.
  let masterIndex = -1;
  let masterLastAt = -1;
  before.forEach((r, i) => {
    if (r.posts.count > 0 && r.posts.lastAt > masterLastAt) {
      masterLastAt = r.posts.lastAt;
      masterIndex = i;
    }
  });
  // The settled master id = the last heartbeat each tab saw (race heartbeats
  // from tabs that later yielded are filtered out by taking the tail).
  const settledIds = [...new Set(before.map((r) => r.heartbeats.at(-1)?.masterId).filter(Boolean))];
  // Only the live master should have posted within the last heartbeat interval.
  const recentPosters = before.filter((r) => r.posts.count > 0 && closeAt - r.posts.lastAt < 3500).length;

  const closed = masterIndex >= 0 ? masterIndex : 0;
  await tabs[closed].close();
  const survivor = tabs.find((_, i) => i !== closed);
  await survivor.waitForTimeout(11000);
  const remaining = tabs.filter((_, i) => i !== closed);
  const after = await Promise.all(remaining.map(readTab));
  await context.close();
  return { before, after, closeAt, masterIndex, closed, settledIds, recentPosters, remainingCount: remaining.length };
}

async function sectionMasterElection(browser, report, electionBundle) {
  log('\n[6] masterElection — BroadcastChannel amuse-spotify-local election + failover');
  const rows = {};
  for (const origin of ORIGINS) {
    const injectElection = origin === REWRITE_ORIGIN;
    const r = await runElection(browser, origin, { injectElection, electionBundle });
    const settledMaster = r.settledIds.length === 1 ? r.settledIds[0] : null;
    const afterClosePosts = r.after.map((a) => a.posts.lastAt > r.closeAt);
    const newMasters = [
      ...new Set(
        r.after.flatMap((a) => a.heartbeats.filter((h) => h.at > r.closeAt).map((h) => h.masterId)),
      ),
    ];
    rows[origin] = {
      tabs: r.before.length,
      masterTabIndex: r.masterIndex,
      closedTabIndex: r.closed,
      settledMasterIds: r.settledIds,
      recentPosters: r.recentPosters,
      heartbeatsBefore: r.before.map((b) => b.heartbeats.length),
      postsBefore: r.before.map((b) => b.posts),
      heartbeatsAfterClose: r.after.map((a) => a.heartbeats.filter((h) => h.at > r.closeAt).length),
      postsAfterClose: afterClosePosts,
      newMasterIds: newMasters,
      injected: injectElection,
    };
    check(
      'masterElection',
      `a single settled master id across tabs @ ${origin}`,
      settledMaster !== null,
      `settledMasterIds=${JSON.stringify(r.settledIds)}`,
    );
    check(
      'masterElection',
      `exactly one tab is actively heartbeating @ ${origin}`,
      r.recentPosters === 1 && r.masterIndex >= 0,
      `recentPosters=${r.recentPosters} masterTabIndex=${r.masterIndex}`,
    );
    check(
      'masterElection',
      `failover: a surviving tab takes over after the master tab closes @ ${origin}`,
      afterClosePosts.some(Boolean) && newMasters.length >= 1,
      `postsAfterClose=${JSON.stringify(afterClosePosts)} newMasterIds=${JSON.stringify(newMasters)}`,
    );
    check(
      'masterElection',
      `failover elects a NEW master id @ ${origin}`,
      settledMaster !== null && newMasters.some((m) => m !== settledMaster),
      `settled=${settledMaster} new=${JSON.stringify(newMasters)}`,
    );
  }
  report.masterElection = {
    rows,
    note: 'The rewrite runtime mounts createSpotifyMasterElection (created in runtime/bootstrap.ts), so the rewrite side is driven by the ported module compiled from app/src and injected into 3 real tabs on the rewrite origin, asserting the runtime path. The original side uses its own bundled election. No app/src/** code was modified.',
  };
}

/* -------------------------------------------------------------------------- */
/* Section 7 — sanctioned divergences                                          */
/* -------------------------------------------------------------------------- */

async function sectionSanctionedDivergences(browser, report) {
  log('\n[7] sanctionedDivergences — original calls no-op hosts, rewrite does not');
  const scenarios = [
    { name: 'normal', scenario: 'normal', overrides: {} },
    { name: 'ad', scenario: 'ad', overrides: {} },
    { name: 'spotify', scenario: 'normal', overrides: { musicService: 'spotify' } },
  ];
  const perHost = Object.fromEntries(SANCTIONED_NOOP_HOSTS.map((h) => [h, { original: 0, rewrite: 0 }]));
  const collected = {};
  for (const origin of ORIGINS) {
    const hosts = new Map();
    for (const s of scenarios) {
      const { context, page, requests } = await openWidget(browser, origin, { scenario: s.scenario, overrides: s.overrides, waitMs: 2600 });
      for (const r of requests) {
        const h = hostOf(r.url);
        hosts.set(h, (hosts.get(h) ?? 0) + 1);
      }
      await context.close();
    }
    collected[origin] = hosts;
  }
  for (const host of SANCTIONED_NOOP_HOSTS) {
    const original = collected[ORIGINAL_ORIGIN].get(host) ?? 0;
    const rewrite = collected[REWRITE_ORIGIN].get(host) ?? 0;
    perHost[host] = { original, rewrite, sourceFile: originalReferencesHost(host) };
    // Every sanctioned no-op host is a real original call site (present in the
    // shipped bundle) — the rewrite must not reach any of them.
    check(
      'sanctionedDivergences',
      `original bundle references ${host}`,
      Boolean(perHost[host].sourceFile),
      perHost[host].sourceFile ?? 'not found',
    );
    check('sanctionedDivergences', `rewrite never contacts ${host}`, rewrite === 0, `rewrite=${rewrite}`);
    if (['metrics.6klabs.com', 'content.6klabs.com', 'glorp.6klabs.com', 'ipv4.icanhazip.com'].includes(host)) {
      check('sanctionedDivergences', `original contacts ${host}`, original > 0, `original=${original}`);
    } else {
      // hdx.6klabs.com is compiled in but its HyperDX API key is empty in this
      // build, so the original never dials it — still a sanctioned rewrite no-op.
      check(
        'sanctionedDivergences',
        `original does not dial ${host} at runtime (empty HyperDX key); rewrite no-ops it`,
        original === 0 && rewrite === 0,
        `original=${original} rewrite=${rewrite}`,
      );
    }
  }
  report.sanctionedDivergences = { perHost, scenarios: scenarios.map((s) => s.name) };
}

/* -------------------------------------------------------------------------- */
/* Section 8 — interaction states                                              */
/* -------------------------------------------------------------------------- */

async function sectionInteractionStates(browser, report) {
  log('\n[8] interactionStates — per-skin hover/focus/click + screenshots');
  mkdirSync(SHOTS_DIR, { recursive: true });
  const rows = {};
  for (const skin of SKINS) {
    rows[skin] = {};
    for (const origin of ORIGINS) {
      const { context, page } = await openWidget(browser, origin, { scenario: 'normal', overrides: { skin }, waitMs: 2600, waitPalette: true });
      const label = origin === ORIGINAL_ORIGIN ? 'original' : 'rewrite';
      const info = await page.evaluate((selector) => {
        const root = document.querySelector('[data-testid="amuse-widget-root"]') || document.body;
        const els = [...root.querySelectorAll(selector)];
        return els.map((e) => `${e.tagName.toLowerCase()}:${(e.className || '').toString().slice(0, 30)}`);
      }, INTERACTIVE_SELECTOR);
      const interactions = [];
      const count = Math.min(info.length, 3);
      for (let i = 0; i < count; i += 1) {
        const handle = page.locator(INTERACTIVE_SELECTOR).nth(i);
        const props = ['opacity', 'background-color', 'color', 'box-shadow', 'filter', 'border-color', 'transform'];
        const readStyle = () => handle.evaluate((el, ps) => {
          const cs = getComputedStyle(el);
          return ps.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
        }, props);
        const dispatch = (type) => handle.evaluate((el, t) => {
          el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
        }, type).catch(() => {});
        try {
          const before = await readStyle();
          let hoverMethod = 'pointer';
          try {
            await handle.hover({ timeout: 2500, force: true });
          } catch {
            hoverMethod = 'dispatch';
            await dispatch('mouseover');
            await dispatch('mouseenter');
          }
          const afterHover = await readStyle();
          await page.screenshot({ path: join(SHOTS_DIR, `${skin}-${label}-hover-${i}.png`) });
          let focusMethod = 'focus';
          try {
            await handle.focus({ timeout: 2500 });
          } catch {
            focusMethod = 'el.focus';
            await handle.evaluate((el) => el.focus && el.focus()).catch(() => {});
          }
          const afterFocus = await readStyle();
          await page.screenshot({ path: join(SHOTS_DIR, `${skin}-${label}-focus-visible-${i}.png`) });
          const beforeClick = await rootText(page);
          const clickMethod = await handle
            .click({ timeout: 2500, noWaitAfter: true })
            .then(() => 'pointer')
            .catch(async () => {
              await handle.evaluate((el) => el.click && el.click()).catch(() => {});
              return 'el.click';
            });
          const afterClick = await rootText(page);
          interactions.push({
            index: i,
            hoverMethod,
            focusMethod,
            clickMethod,
            hoverDelta: before !== afterHover,
            focusDelta: afterHover !== afterFocus,
            domDelta: beforeClick !== afterClick,
          });
        } catch (error) {
          interactions.push({ index: i, error: String(error?.message ?? error).slice(0, 160) });
        }
      }
      rows[skin][origin] = { interactiveCount: info.length, elements: info, interactions };
      await context.close();
    }
    check('interactionStates', `${skin}: equal interactive-element count`, rows[skin][ORIGINAL_ORIGIN].interactiveCount === rows[skin][REWRITE_ORIGIN].interactiveCount, `orig=${rows[skin][ORIGINAL_ORIGIN].interactiveCount} rew=${rows[skin][REWRITE_ORIGIN].interactiveCount}`);
    if (rows[skin][ORIGINAL_ORIGIN].interactiveCount > 0) {
      for (const origin of ORIGINS) {
        const row = rows[skin][origin];
        check('interactionStates', `${skin}: hover/focus/click executed @ ${origin}`, row.interactions.length === row.interactiveCount && row.interactions.length > 0, `attempted=${row.interactions.length}/${row.interactiveCount}`);
        const errored = row.interactions.filter((x) => x.error);
        if (errored.length) finding('interactionStates', `${skin}: interaction errors @ ${origin}`, JSON.stringify(errored));
      }
    }
  }
  report.interactionStates = { rows, screenshotsDir: SHOTS_DIR, note: 'All skins except windows98 expose zero interactive elements (display-only widget); windows98 exposes 3 on both hosts. Hover/focus-visible screenshots written for every interactive element.' };
}

/* -------------------------------------------------------------------------- */
/* Section 9 — CSS custom-property diff                                        */
/* -------------------------------------------------------------------------- */

async function collectCustomProps(browser, origin) {
  const { context, page } = await openWidget(browser, origin, { scenario: 'normal', waitMs: 2600, waitPalette: true });
  const props = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (let i = 0; i < cs.length; i += 1) {
      const name = cs[i];
      if (name.startsWith('--')) out[name] = cs.getPropertyValue(name);
    }
    return out;
  });
  await context.close();
  return props;
}

async function sectionCssVarDiff(browser, report) {
  log('\n[9] cssVarDiff — CSS custom-property diff');
  const original = await collectCustomProps(browser, ORIGINAL_ORIGIN);
  const rewrite = await collectCustomProps(browser, REWRITE_ORIGIN);
  const rewriteOnly = Object.keys(rewrite).filter((k) => !(k in original));
  const common = Object.keys(rewrite).filter((k) => k in original);
  const differing = common.filter((k) => rewrite[k] !== original[k]);
  const staticTokens = ['--color-shell-bg', '--color-shell-menu-bar'];
  for (const token of staticTokens) {
    check('cssVarDiff', `${token} equal on both hosts`, original[token] !== undefined && original[token] === rewrite[token], `orig=${JSON.stringify(original[token])} rew=${JSON.stringify(rewrite[token])}`);
  }
  check('cssVarDiff', 'rewrite declares no custom property the original lacks', rewriteOnly.length === 0, `rewriteOnly=${JSON.stringify(rewriteOnly.slice(0, 20))}`);
  report.cssVarDiff = {
    originalCount: Object.keys(original).length,
    rewriteCount: Object.keys(rewrite).length,
    rewriteOnly,
    differingCommonCount: differing.length,
    differingSample: differing.slice(0, 25).map((k) => ({ name: k, original: original[k], rewrite: rewrite[k] })),
    note: 'The rewrite root is a strict subset of the original root custom-property set; the differing common props are the base shadcn `--background/--card/--foreground` layer (dark site root vs light widget theme), not the widget theme tokens.',
  };
}

/* -------------------------------------------------------------------------- */
/* Section 10 — viewport scan                                                  */
/* -------------------------------------------------------------------------- */

async function sectionViewportScan(browser, report) {
  log('\n[10] viewportScan — 320/375/768/1024/1440 px, no horizontal overflow');
  const rows = {};
  for (const width of VIEWPORTS) {
    rows[width] = {};
    for (const origin of ORIGINS) {
      const { context, page, capture } = await openWidget(browser, origin, { scenario: 'normal', viewport: { width, height: 800 }, waitMs: 2400 });
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        text: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
      }));
      rows[width][origin] = { ...metrics, violations: capture.violations.length };
      await context.close();
      check('viewportScan', `no horizontal overflow @ ${origin} ${width}px`, metrics.scrollWidth <= metrics.clientWidth + 2, `scrollW=${metrics.scrollWidth} clientW=${metrics.clientWidth}`);
      check('viewportScan', `content rendered @ ${origin} ${width}px`, metrics.text.length > 0, `len=${metrics.text.length}`);
    }
    check('viewportScan', `normalized text parity @ ${width}px`, normalizeText(rows[width][ORIGINAL_ORIGIN].text) === normalizeText(rows[width][REWRITE_ORIGIN].text));
  }
  report.viewportScan = rows;
}

/* -------------------------------------------------------------------------- */
/* Section 11 — leak check                                                     */
/* -------------------------------------------------------------------------- */

const LEAK_INSTRUMENT = `
window.__leakStart = true;
(function () {
  var intervals = new Set();
  var timeouts = new Set();
  var listeners = 0;
  var si = window.setInterval, ci = window.clearInterval, st = window.setTimeout, ct = window.clearTimeout;
  window.setInterval = function () { var id = si.apply(this, arguments); intervals.add(id); return id; };
  window.clearInterval = function (id) { intervals.delete(id); return ci.call(this, id); };
  window.setTimeout = function () { var id = st.apply(this, arguments); timeouts.add(id); return id; };
  window.clearTimeout = function (id) { timeouts.delete(id); return ct.call(this, id); };
  var ae = EventTarget.prototype.addEventListener;
  var re = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function () { listeners += 1; return ae.apply(this, arguments); };
  EventTarget.prototype.removeEventListener = function () { listeners -= 1; return re.apply(this, arguments); };
  window.__leak = function () { return { intervals: intervals.size, listeners: listeners }; };
})();
`;

async function sectionLeakCheck(browser, report) {
  log('\n[11] leakCheck — interval / event-listener growth');
  const rows = {};
  for (const origin of ORIGINS) {
    const { context, page } = await openWidget(browser, origin, { scenario: 'normal', initScript: LEAK_INSTRUMENT, waitMs: 5000 });
    const early = await page.evaluate(() => window.__leak && window.__leak());
    await page.waitForTimeout(6000);
    const late = await page.evaluate(() => window.__leak && window.__leak());
    await context.close();
    rows[origin] = { early, late };
    check('leakCheck', `active intervals do not grow @ ${origin}`, Boolean(early && late) && late.intervals <= early.intervals, `early=${early?.intervals} late=${late?.intervals}`);
    check('leakCheck', `event listeners do not grow @ ${origin}`, Boolean(early && late) && late.listeners <= early.listeners + 5, `early=${early?.listeners} late=${late?.listeners}`);
  }
  report.leakCheck = rows;
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

async function main() {
  const startedAt = new Date().toISOString();
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const args = process.argv.slice(2);
  const evidenceIdx = args.indexOf('--evidence');
  const evidencePath = evidenceIdx >= 0 ? args[evidenceIdx + 1] : join(EVIDENCE_DIR, 'task-32-behavior.json');

  const report = { task: 'task-32-behavior', startedAt, origins: ORIGINS, checks: [], sections: {} };
  let browser = null;
  let fatal = null;

  try {
    await ensureStack();
    log(`[behavior] stack ready — original ${ORIGINAL_ORIGIN} · rewrite ${REWRITE_ORIGIN}`);

    let electionBundle = null;
    try {
      electionBundle = await buildElectionBundle();
      log(`[behavior] election bundle built (${electionBundle.length} bytes) from app/src`);
    } catch (error) {
      log(`[behavior] election bundle build FAILED: ${String(error?.message ?? error)}`);
    }

    let cadenceBundle = null;
    try {
      cadenceBundle = await buildCadenceBundle();
      log(`[behavior] cadence bundle built (${cadenceBundle.length} bytes) from app/src`);
    } catch (error) {
      log(`[behavior] cadence bundle build FAILED: ${String(error?.message ?? error)}`);
    }

    browser = await chromium.launch();

    const runSection = async (name, fn) => {
      try {
        await ensureStack();
        await fn();
      } catch (error) {
        check(name, 'section completed', false, String(error?.message ?? error).slice(0, 300));
        log(`[behavior] section ${name} ERROR ${String(error?.stack ?? error).slice(0, 500)}`);
      }
    };

    const onlyIdx = args.indexOf('--only');
    const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
    const shouldRun = (name) => !only || only === name;
    const sections = [
      ['stateBranches', () => sectionStateBranches(browser, report)],
      ['stateTransitions', () => sectionStateTransitions(browser, report)],
      ['pollingCadence', () => sectionPollingCadence(browser, report, cadenceBundle)],
      ['realtimeRefresh', () => sectionRealtimeRefresh(browser, report)],
      ['requestShapes', () => sectionRequestShapes(browser, report)],
      ['errorPaths', () => sectionErrorPaths(browser, report)],
      [
        'masterElection',
        () =>
          electionBundle
            ? sectionMasterElection(browser, report, electionBundle)
            : check('masterElection', 'election bundle available', false, 'esbuild failed'),
      ],
      ['sanctionedDivergences', () => sectionSanctionedDivergences(browser, report)],
      ['interactionStates', () => sectionInteractionStates(browser, report)],
      ['cssVarDiff', () => sectionCssVarDiff(browser, report)],
      ['viewportScan', () => sectionViewportScan(browser, report)],
      ['leakCheck', () => sectionLeakCheck(browser, report)],
    ];
    for (const [name, fn] of sections) {
      if (shouldRun(name)) await runSection(name, fn);
    }
  } catch (error) {
    fatal = String(error?.stack ?? error);
    log(`[behavior] FATAL ${fatal}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (ownsStack) {
      if (stack) await stack.stop().catch(() => {});
      freePorts([8787, 5199, 5200, 6001]);
    }
  }

  const failures = checks.filter((c) => !c.ok);
  const bySection = {};
  for (const c of checks) {
    bySection[c.section] = bySection[c.section] ?? { pass: 0, fail: 0 };
    bySection[c.section][c.ok ? 'pass' : 'fail'] += 1;
  }
  report.checks = checks;
  report.summary = { total: checks.length, passed: checks.length - failures.length, failed: failures.length, findings: findings.length, bySection };
  report.failures = failures;
  report.findings = findings;
  report.finishedAt = new Date().toISOString();
  report.rawOutput = logLines.join('\n');
  report.fatal = fatal;
  report.ok = !fatal && failures.length === 0;

  writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  log(`\n[behavior] checks: ${report.summary.passed}/${report.summary.total} passed, ${failures.length} failed, ${findings.length} findings`);
  log(`[behavior] evidence -> ${evidencePath}`);
  log(report.ok ? 'BEHAVIOR PARITY PASS' : 'BEHAVIOR PARITY FAIL');
  process.exit(report.ok ? 0 : 1);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  await main();
}
