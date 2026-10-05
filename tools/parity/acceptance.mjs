#!/usr/bin/env node
/**
 * tools/parity/acceptance.mjs — Todo 35: full viewport & state matrix acceptance.
 *
 * This is the ACCEPTANCE RUN layered on top of the FINALIZED parity harness
 * (`compare.mjs` + `report-check.mjs` + `fixtures.mjs`). It does NOT re-implement
 * the matrix and it does NOT weaken any gate: it EXECUTES the full orthogonal
 * matrix at both viewports, then applies the acceptance-specific assertions the
 * harness itself does not express, and records the evidence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES (deterministic, CI-friendly — exit non-zero on any failure)
 * ─────────────────────────────────────────────────────────────────────────────
 *   PHASE 1  `node tools/parity/compare.mjs --all`
 *            → full orthogonal matrix: skin×cover×theme full cross (8×4×2=64,
 *              both viewports) + 14 renderable WidgetStatus (both viewports) +
 *              14-font single-dim scan + 6-source single-dim scan +
 *              24 animation parameter assertions. Writes results.json,
 *              thresholds.json and docs/parity-report.md. Raw output is teed to
 *              the evidence log (never hand-written).
 *   PHASE 2  `node tools/parity/report-check.mjs`
 *            → the frozen coverage/gate validator must exit 0.
 *   PHASE 3  ACCEPTANCE VALIDATION of the fresh results.json / thresholds.json:
 *              · coverage shape complete (128/28/14/6 rows; 8/4/2/14/6/12/12/15/2)
 *              · structural (key-node) gate = 0
 *              · style (Layer 2) gate = 0
 *              · RENDER-DECISION PARITY: origFound === rewFound for every row
 *                (a blank/white rewrite where the original painted = FAILURE;
 *                 the documented empty-root error branches render empty on BOTH)
 *              · REWRITE console/page errors = 0; every ORIGINAL page error is
 *                the documented React #418 hydration artifact (asymmetry
 *                recorded, not a rewrite regression)
 *              · pixel gate: every over-threshold case is enumerated in
 *                thresholds.unmet with a non-empty reason
 *   PHASE 4  ADDITIVE BOTH-VIEWPORT SWEEP (the harness runs font/source as a
 *            single-dim scan at the representative desktop viewport; this phase
 *            completes those dimensions at MOBILE too and exercises all 24
 *            animations individually):
 *              · 24-animation structural sweep — each show/hide id renders the
 *                rewrite with the skin mounted, 0 page/console errors.
 *              · mobile font (14) + source (6) sweep — BOTH origins, render
 *                parity + 0 rewrite errors.
 *              · representative screenshots (original + rewrite, both viewports)
 *                written under evidence/screenshots/.
 *   PHASE 5  Evidence: summary.json + parity-report.md copy + raw logs.
 *
 * Usage: node tools/parity/acceptance.mjs [--skip-matrix]
 *   `--skip-matrix` reuses an existing results.json (sweep-only debugging); the
 *   default run always re-executes the matrix.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startParity } from './dev-parity.mjs';
import { freePorts, status } from './procs.mjs';
import {
  ORIGINAL_ORIGIN,
  REWRITE_ORIGIN,
  MOCK_ORIGIN,
  WIDGET_PATH,
  buildFixture,
  installFixtures,
  waitForPaletteStable,
} from './fixtures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const EVIDENCE_DIR = join(ROOT, '.omo', 'evidence', 'amuse-widget-rewrite', 'task-35-matrix');
const SHOTS_DIR = join(EVIDENCE_DIR, 'screenshots');
const RESULTS_PATH = join(ROOT, '.omo', 'evidence', 'amuse-widget-rewrite', 'parity', 'results.json');
const THRESHOLDS_PATH = join(ROOT, 'tools', 'parity', 'thresholds.json');
const REPORT_PATH = join(ROOT, 'docs', 'parity-report.md');
const COMPARE_PATH = join(HERE, 'compare.mjs');
const REPORT_CHECK_PATH = join(HERE, 'report-check.mjs');

/* ---- Registries (mirror compare.mjs / report-check.mjs — read-only) -------- */
const SKINS = ['compact', 'boxy', 'gallery', 'minimal', 'macos', 'shell', 'windows98', 'discord'];
const COVERS = ['square', 'canvas', 'vinyl', 'none'];
const THEMES = ['default_dark', 'default_light'];
const FONTS = [
  'poppins', 'fredoka', 'spacemono', 'silkscreen', 'bagelFatOne', 'gasoekOne',
  'zcoolKuaile', 'zcoolQingkeHuangyou', 'singleDay', 'jua', 'russoOne',
  'monomakh', 'notoSerifDisplay', 'openDyslexic',
];
const SOURCES = ['pear-desktop', 'spotify', 'ytm-desktop', 'apple-music', 'tidal', 'spicetify'];
const STATES = [
  'SESSION_EXPIRED', 'LOADING', 'SUCCESS', 'NO_SPOTIFY_ACCOUNT', 'YTMD_NOT_CONNECTED',
  'PROFILE_NOT_EXISTING', 'SPOTIFY_ERROR', 'SPOTIFY_ACCOUNT_ERROR', 'SERVER_ERROR',
  'ACCOUNT_NOT_EXISTING', 'DISABLED_PROFILE', 'DISABLED_PRO_SKIN', 'DISABLED_DISCORD_SKIN',
  'SPOTIFY_FREE_ACCOUNT', 'SPOTIFY_TOKEN_EXPIRED',
];
const SHOW_ANIMATIONS = [
  'default_in', 'fade_in', 'slide_in_left', 'slide_in_right', 'slide_in_top',
  'slide_in_bottom', 'grow_in', 'shrink_in', 'swing_rotate_in_left',
  'swing_rotate_in_right', 'tilt_in_right', 'tilt_in_left',
];
const HIDE_ANIMATIONS = [
  'default_out', 'fade_out', 'slide_out_left', 'slide_out_right', 'slide_out_top',
  'slide_out_bottom', 'grow_out', 'shrink_out', 'swing_rotate_out_left',
  'swing_rotate_out_right', 'tilt_out_right', 'tilt_out_left',
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const REP_SKIN = 'boxy';
const REP_COVER = 'vinyl';
const REP_THEME = 'default_light';
const SKIN_SELECTOR = 'div.relative.flex.h-full.w-full.select-none.items-center.justify-center';
const SETTLE_MS = 1500;
const NAV_TIMEOUT_MS = 20000;
const CONCURRENCY = 3;

/* ---- Tiny check accumulator ------------------------------------------------ */
const checks = [];
const failures = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(detail ? `${name} — ${detail}` : name);
}

const RUN_LOG = [];
function log(line) {
  console.log(line);
  RUN_LOG.push(line);
}

/* -------------------------------------------------------------------------- */
/* Fixture settings override (same technique as compare.mjs; later route wins) */
/* -------------------------------------------------------------------------- */
async function installSettingsOverride(page, { scenario, overrides, settings }) {
  if (!settings) return;
  const fixture = buildFixture(scenario, overrides);
  const spec = fixture.http.profile;
  const body = spec.__body !== undefined ? JSON.parse(JSON.stringify(spec.__body)) : spec;
  if (body && typeof body === 'object' && body.settings) {
    Object.assign(body.settings, settings);
  }
  await page.route('**/api/widgets/amuse/profiles**', async (route) => {
    await route.fulfill({
      status: spec.__status ?? 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  });
}

function caseOverrides(c) {
  const overrides = {};
  if (c.skin) overrides.skin = c.skin;
  if (c.musicService) overrides.musicService = c.musicService;
  if (c.extraOverrides) Object.assign(overrides, c.extraOverrides);
  return overrides;
}

/**
 * Render one (origin, case, viewport). Captures BOTH `pageerror` (uncaught) and
 * `console.error` messages, which the matrix harness only records the former of.
 */
async function capture(browser, origin, c, vp, { screenshotPath = null } = {}) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    locale: 'en-US',
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  try {
    const overrides = caseOverrides(c);
    const settings = { cover: c.cover, theme: c.theme, font: c.font, ...(c.animations ?? {}) };
    await installFixtures(page, { scenario: c.scenario ?? 'normal', overrides, reducedMotion: 'no-preference' });
    await installSettingsOverride(page, { scenario: c.scenario ?? 'normal', overrides, settings });
    try {
      await page.goto(`${origin}${WIDGET_PATH}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    } catch {
      await page.goto(`${origin}${WIDGET_PATH}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    }
    await page.waitForSelector(SKIN_SELECTOR, { timeout: 8000 }).catch(() => {});
    await waitForPaletteStable(page).catch(() => null);
    await page.evaluate(() => document.fonts.ready).catch(() => null);
    await page.waitForTimeout(SETTLE_MS);
    await page.addStyleTag({ content: 'html,body{background:#ffffff !important;margin:0;padding:0;}' }).catch(() => {});
    await page.waitForTimeout(60);
    const found = await page.evaluate((sel) => !!document.querySelector(sel), SKIN_SELECTOR);
    if (screenshotPath) {
      mkdirSync(dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, type: 'png' });
    }
    return { found, pageErrors, consoleErrors };
  } finally {
    await context.close();
  }
}

/** Bounded-concurrency map (same shape as compare.mjs's pool). */
async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/* -------------------------------------------------------------------------- */
/* Phase 1 + 2 — run the frozen harness                                       */
/* -------------------------------------------------------------------------- */
function runNode(script, extraArgs = []) {
  return spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30 * 60 * 1000,
    env: { ...process.env },
  });
}

function phaseRunHarness(skipMatrix) {
  if (skipMatrix && existsSync(RESULTS_PATH)) {
    log('[acceptance] phase 1/5: SKIPPED (--skip-matrix) — reusing existing results.json');
  } else {
    log('[acceptance] phase 1/5: running compare.mjs --all (full orthogonal matrix)');
    const cmp = runNode(COMPARE_PATH, ['--all']);
    const out = `${cmp.stdout ?? ''}${cmp.stderr ?? ''}`;
    writeFileSync(join(EVIDENCE_DIR, 'compare-run.log'), out, 'utf8');
    for (const line of out.split(/\r?\n/)) if (line.startsWith('[compare]')) log(`  ${line}`);
    log(`[acceptance] compare.mjs exit=${cmp.status}${cmp.error ? ` error=${cmp.error.message}` : ''}`);
    check('compare.mjs --all exits 0', cmp.status === 0, `exit=${cmp.status}`);
  }

  log('[acceptance] phase 2/5: running report-check.mjs');
  const rc = runNode(REPORT_CHECK_PATH);
  const rcOut = `${rc.stdout ?? ''}${rc.stderr ?? ''}`;
  writeFileSync(join(EVIDENCE_DIR, 'report-check.log'), rcOut, 'utf8');
  for (const line of rcOut.split(/\r?\n/)) if (line.startsWith('[report-check]')) log(`  ${line}`);
  log(`[acceptance] report-check.mjs exit=${rc.status}`);
  check('report-check.mjs exits 0', rc.status === 0, `exit=${rc.status}`);
}

/* -------------------------------------------------------------------------- */
/* Phase 3 — acceptance validation of the fresh matrix                        */
/* -------------------------------------------------------------------------- */
function phaseValidate() {
  log('[acceptance] phase 3/5: validating the full-matrix results');
  for (const p of [RESULTS_PATH, THRESHOLDS_PATH, REPORT_PATH]) {
    check(`artifact exists: ${p.replace(ROOT, '')}`, existsSync(p));
  }
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
  const thresholds = JSON.parse(readFileSync(THRESHOLDS_PATH, 'utf8'));
  const report = readFileSync(REPORT_PATH, 'utf8');
  const rows = Array.isArray(results.rows) ? results.rows : [];
  const byGroup = (g) => rows.filter((r) => r.group === g);
  const distinct = (rs, k) => new Set(rs.map((r) => r[k]).filter((v) => v != null));

  /* -- coverage shape -- */
  check('comparisons = 176', rows.length === 176, `got ${rows.length}`);
  check('cross = 128 (8×4×2 × 2 viewports)', byGroup('cross').length === 128, `got ${byGroup('cross').length}`);
  check('state = 28 (14 renderable × 2 viewports)', byGroup('state').length === 28, `got ${byGroup('state').length}`);
  check('font = 14', byGroup('font').length === 14, `got ${byGroup('font').length}`);
  check('source = 6', byGroup('source').length === 6, `got ${byGroup('source').length}`);
  check('cross skins = 8', distinct(byGroup('cross'), 'skin').size === 8, `got ${distinct(byGroup('cross'), 'skin').size}`);
  check('cross covers = 4', distinct(byGroup('cross'), 'cover').size === 4, `got ${distinct(byGroup('cross'), 'cover').size}`);
  check('cross themes = 2', distinct(byGroup('cross'), 'theme').size === 2, `got ${distinct(byGroup('cross'), 'theme').size}`);
  check('viewports = 2', distinct(rows, 'viewport').size === 2, `got ${[...distinct(rows, 'viewport')].join(',')}`);
  check('animation ids = 12 show + 12 hide',
    results.animation?.ids?.showCount === 12 && results.animation?.ids?.hideCount === 12,
    `show=${results.animation?.ids?.showCount} hide=${results.animation?.ids?.hideCount}`);
  const missingFonts = FONTS.filter((f) => !rows.some((r) => r.caseId === `font:${f}`));
  const missingSources = SOURCES.filter((s) => !rows.some((r) => r.caseId === `source:${s}`));
  // `LOADING` is non-renderable (the store default before any response; asserted
  // by the state-machine unit tests, not screenshotted) — see report-check.
  const RENDERABLE_STATES = STATES.filter((s) => s !== 'LOADING');
  const missingStates = RENDERABLE_STATES.filter((s) => !rows.some((r) => r.caseId === `state:${s}`));
  check('every font value covered', missingFonts.length === 0, missingFonts.join(', '));
  check('every source value covered', missingSources.length === 0, missingSources.join(', '));
  check('every renderable state covered (14)', missingStates.length === 0, missingStates.join(', '));
  check('report enumerates all 15 WidgetStatus values', STATES.every((s) => report.includes(`\`${s}\``)));

  /* -- gates -- */
  const structTotal = rows.reduce((s, r) => s + (r.structuralDiff || 0), 0);
  const styleTotal = rows.reduce((s, r) => s + (r.styleDiff || 0), 0);
  check('structural (key-node) gate = 0', structTotal === 0, `total=${structTotal}`);
  check('style (Layer 2) gate = 0', styleTotal === 0, `total=${styleTotal}`);

  /* -- render success / no blank-white screens -- */
  const renderMismatch = rows.filter((r) => r.origFound !== r.rewFound);
  check('render-decision parity (origFound === rewFound) for all rows', renderMismatch.length === 0,
    renderMismatch.map((r) => `${r.caseId}@${r.viewport}`).join(', '));
  const blankCross = byGroup('cross').filter((r) => !r.rewFound);
  check('no blank rewrite render across the full cross', blankCross.length === 0,
    blankCross.map((r) => `${r.caseId}@${r.viewport}`).join(', '));
  const blankFont = byGroup('font').filter((r) => !r.rewFound);
  check('no blank rewrite render across the font scan', blankFont.length === 0,
    blankFont.map((r) => `${r.caseId}@${r.viewport}`).join(', '));

  /* -- console/page errors -- */
  const rewErrors = rows.reduce((s, r) => s + (r.rewErrors || 0), 0);
  const origErrors = rows.reduce((s, r) => s + (r.origErrors || 0), 0);
  check('rewrite page errors = 0 across the matrix', rewErrors === 0, `total=${rewErrors}`);
  const badOrigMsgs = rows.flatMap((r) => r.origErrorMsgs ?? []).filter((m) => !/React error #418/.test(m));
  check('every original page error is the documented React #418 artifact', badOrigMsgs.length === 0,
    badOrigMsgs.slice(0, 3).join(' | '));
  const rewViolations = rows.reduce((s, r) => s + (r.rewViolations || 0), 0);
  check('rewrite unintercepted external requests = 0', rewViolations === 0, `total=${rewViolations}`);

  /* -- pixel gate -- */
  const vps = thresholds.viewports || {};
  const over = rows.filter((r) => r.pixelPct != null && Number.isFinite(vps[r.viewport]?.threshold)
    && r.pixelPct > vps[r.viewport].threshold);
  const unmet = Array.isArray(thresholds.unmet) ? thresholds.unmet : [];
  const keyOf = (x) => `${x.caseId}@${x.viewport}`;
  const unmetKeys = new Set(unmet.map(keyOf));
  const missingUnmet = over.filter((r) => !unmetKeys.has(keyOf(r)));
  check('every over-threshold case is enumerated in unmet', missingUnmet.length === 0,
    missingUnmet.map(keyOf).join(', '));
  check('every unmet item has a non-empty reason', unmet.every((u) => u.reason && String(u.reason).trim()));
  check('threshold = floor + epsilon per viewport', VIEWPORTS.every((v) => {
    const t = vps[v.name];
    return !!t && t.threshold === Math.round((t.floor + t.epsilon) * 1e4) / 1e4;
  }));

  return {
    comparisons: rows.length,
    cross: byGroup('cross').length,
    state: byGroup('state').length,
    font: byGroup('font').length,
    source: byGroup('source').length,
    viewports: VIEWPORTS.map((v) => `${v.name} ${v.width}x${v.height}`),
    structural: structTotal,
    style: styleTotal,
    rewritePageErrors: rewErrors,
    originalPageErrors: origErrors,
    originalErrorKind: 'React error #418 (original host hydration artifact)',
    rewriteUninterceptedRequests: rewViolations,
    renderMismatches: renderMismatch.length,
    pixel: {
      withinThreshold: rows.length - unmet.length,
      overThreshold: unmet.length,
      unmet: unmet.map((u) => ({ caseId: u.caseId, viewport: u.viewport, pixelPct: u.pixelPct, reason: u.reason })),
    },
    thresholds: vps,
  };
}

/* -------------------------------------------------------------------------- */
/* Phase 4 — additive both-viewport sweep + representative screenshots       */
/* -------------------------------------------------------------------------- */
async function phaseSweep(browser) {
  log('[acceptance] phase 4/5: additive both-viewport sweep + representative screenshots');

  /* 4a — 24-animation structural sweep (rewrite). Each id is set in its slot;
   * the widget must mount with 0 page/console errors. Exact per-frame motion
   * values are locked by the unit suite (animations.test.ts). */
  const animCases = [
    ...SHOW_ANIMATIONS.map((id) => ({ slot: 'show_animation', id })),
    ...HIDE_ANIMATIONS.map((id) => ({ slot: 'hide_animation', id })),
  ];
  const animResults = await mapPool(animCases, CONCURRENCY, async ({ slot, id }) => {
    const c = { scenario: 'normal', skin: REP_SKIN, cover: REP_COVER, theme: REP_THEME, font: 'poppins', animations: { [slot]: id } };
    const res = await capture(browser, REWRITE_ORIGIN, c, VIEWPORTS[0]);
    return {
      slot, id, mounted: res.found,
      pageErrors: res.pageErrors, consoleErrors: res.consoleErrors,
      ok: res.found && res.pageErrors.length === 0 && res.consoleErrors.length === 0,
    };
  });
  const animFail = animResults.filter((a) => !a.ok);
  check('24-animation structural sweep: all render with 0 errors', animFail.length === 0,
    animFail.map((a) => `${a.slot}:${a.id}`).join(', '));

  /* 4b — mobile font (14) + source (6) sweep: completes the single-dim scans at
   * the second viewport. Both origins; render parity + 0 rewrite errors. */
  const mobCases = [
    ...FONTS.map((f) => ({ id: `font:${f}`, scenario: 'normal', skin: REP_SKIN, cover: REP_COVER, theme: REP_THEME, font: f })),
    ...SOURCES.map((s) => ({ id: `source:${s}`, scenario: 'normal', skin: REP_SKIN, cover: REP_COVER, theme: REP_THEME, font: 'poppins', musicService: s })),
  ];
  const mobResults = await mapPool(mobCases, CONCURRENCY, async (c) => {
    const o = await capture(browser, ORIGINAL_ORIGIN, c, VIEWPORTS[1]);
    const w = await capture(browser, REWRITE_ORIGIN, c, VIEWPORTS[1]);
    return {
      id: c.id, origFound: o.found, rewFound: w.found,
      rewPageErrors: w.pageErrors, rewConsoleErrors: w.consoleErrors,
      ok: o.found === w.found && w.pageErrors.length === 0 && w.consoleErrors.length === 0,
    };
  });
  const mobFail = mobResults.filter((m) => !m.ok);
  check('mobile font(14)+source(6) sweep: render parity + 0 rewrite errors', mobFail.length === 0,
    mobFail.map((m) => `${m.id} (origFound=${m.origFound} rewFound=${m.rewFound} err=${m.rewPageErrors.length}/${m.rewConsoleErrors.length})`).join(', '));

  /* 4c — representative screenshots (original + rewrite, both viewports). */
  const repCases = [
    ...SKINS.map((skin) => ({ id: `skin-${skin}`, scenario: 'normal', skin, cover: REP_COVER, theme: REP_THEME, font: 'poppins' })),
    { id: 'cover-square-dark', scenario: 'normal', skin: REP_SKIN, cover: 'square', theme: 'default_dark', font: 'poppins' },
    { id: 'cover-canvas', scenario: 'normal', skin: REP_SKIN, cover: 'canvas', theme: REP_THEME, font: 'poppins' },
    { id: 'cover-none-dark', scenario: 'normal', skin: REP_SKIN, cover: 'none', theme: 'default_dark', font: 'poppins' },
    { id: 'font-monomakh', scenario: 'normal', skin: REP_SKIN, cover: REP_COVER, theme: REP_THEME, font: 'monomakh' },
    { id: 'font-openDyslexic', scenario: 'normal', skin: REP_SKIN, cover: REP_COVER, theme: REP_THEME, font: 'openDyslexic' },
    { id: 'source-spotify', scenario: 'normal', skin: REP_SKIN, cover: REP_COVER, theme: REP_THEME, font: 'poppins', musicService: 'spotify' },
    { id: 'source-ytm-desktop', scenario: 'normal', skin: REP_SKIN, cover: REP_COVER, theme: REP_THEME, font: 'poppins', musicService: 'ytm-desktop' },
    { id: 'state-disabled-profile', scenario: 'disabled-profile', skin: REP_SKIN, cover: REP_COVER, theme: REP_THEME, font: 'poppins' },
  ];
  const shotJobs = [];
  for (const c of repCases) {
    for (const vp of VIEWPORTS) {
      for (const [origin, tag] of [[ORIGINAL_ORIGIN, 'original'], [REWRITE_ORIGIN, 'rewrite']]) {
        shotJobs.push({ c, vp, origin, tag });
      }
    }
  }
  const shotResults = await mapPool(shotJobs, CONCURRENCY, async ({ c, vp, origin, tag }) => {
    const file = `${c.id}-${vp.name}-${tag}.png`;
    const res = await capture(browser, origin, c, vp, { screenshotPath: join(SHOTS_DIR, file) });
    return { file, origin: tag, caseId: c.id, viewport: vp.name, found: res.found, pageErrors: res.pageErrors.length };
  });
  check('representative screenshots captured (original + rewrite, both viewports)',
    shotResults.length === repCases.length * VIEWPORTS.length * 2 && shotResults.every((s) => existsSync(join(SHOTS_DIR, s.file))),
    `captured ${shotResults.length}`);

  return {
    animationSweep: {
      total: animResults.length, passed: animResults.length - animFail.length, failures: animFail,
      results: animResults,
    },
    mobileSweep: {
      total: mobResults.length, passed: mobResults.length - mobFail.length, failures: mobFail,
      results: mobResults,
    },
    screenshots: shotResults.map((s) => s.file),
  };
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */
async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  mkdirSync(SHOTS_DIR, { recursive: true });
  const startedAt = new Date().toISOString();
  const skipMatrix = process.argv.includes('--skip-matrix');

  log(`[acceptance] Todo 35 — full viewport & state matrix acceptance`);
  log(`[acceptance] viewports: ${VIEWPORTS.map((v) => `${v.name} ${v.width}x${v.height}`).join(' · ')}`);

  phaseRunHarness(skipMatrix);
  const matrix = phaseValidate();

  let sweep = null;
  const parity = startParity();
  let browser = null;
  try {
    await parity.ready;
    const probes = await Promise.all([
      status(`${ORIGINAL_ORIGIN}${WIDGET_PATH}`),
      status(`${REWRITE_ORIGIN}${WIDGET_PATH}`),
      status(`${MOCK_ORIGIN}/api/health`),
    ]);
    check('parity stack healthy (original/rewrite/mock all 200)',
      probes.every((p) => p.status === 200), probes.map((p) => p.status).join(','));
    browser = await chromium.launch();
    sweep = await phaseSweep(browser);
  } catch (error) {
    check('phase 4 additive sweep completed', false, String(error?.stack ?? error));
  } finally {
    if (browser) await browser.close().catch(() => {});
    await parity.stop();
    freePorts([8787, 5199, 5200, 6001]);
  }

  const finishedAt = new Date().toISOString();
  const passed = checks.filter((c) => c.ok).length;
  const summary = {
    task: 'task-35-matrix',
    title: 'Full viewport & state matrix acceptance (1440x900 + 390x844)',
    startedAt,
    finishedAt,
    viewports: VIEWPORTS,
    harness: { compare: 'tools/parity/compare.mjs --all', reportCheck: 'tools/parity/report-check.mjs' },
    coverage: {
      skins: SKINS, covers: COVERS, themes: THEMES, fonts: FONTS, sources: SOURCES,
      states: STATES, renderableStates: 14, loadingState: 'LOADING (non-renderable; state-machine unit tests)',
      showAnimations: SHOW_ANIMATIONS, hideAnimations: HIDE_ANIMATIONS,
    },
    matrix,
    sweep,
    checks,
    result: { passed, total: checks.length, failed: failures.length, failures },
    ok: failures.length === 0,
  };
  writeFileSync(join(EVIDENCE_DIR, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
  if (existsSync(REPORT_PATH)) copyFileSync(REPORT_PATH, join(EVIDENCE_DIR, 'parity-report.md'));
  writeFileSync(join(EVIDENCE_DIR, 'acceptance-run.log'), RUN_LOG.join('\n') + '\n', 'utf8');

  log('');
  log(`[acceptance] checks: ${passed}/${checks.length} passed`);
  for (const c of checks) log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok || !c.detail ? '' : ` — ${c.detail}`}`);
  log(`[acceptance] evidence -> ${EVIDENCE_DIR}`);
  if (failures.length) {
    console.error(`[acceptance] FAIL — ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    log('[acceptance] PASS — full matrix at both viewports: structural 0 · style 0 · rewrite console errors 0 · render parity 100% · pixel within calibrated threshold or enumerated unmet.');
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error(`[acceptance] ERROR ${err?.stack ?? err}`);
  freePorts([8787, 5199, 5200, 6001]);
  process.exitCode = 3;
});
