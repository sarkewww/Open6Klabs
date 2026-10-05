#!/usr/bin/env node
/**
 * tools/parity/report-check.mjs — validate the full-matrix parity report.
 *
 * This is the GATE for the parity report/threshold work (Todo 33). It does NOT
 * re-render anything; it validates the artifacts produced by
 * `node tools/parity/compare.mjs --all`:
 *
 *   · `docs/parity-report.md`                          — the report
 *   · `tools/parity/thresholds.json`                   — calibrated thresholds
 *   · `.omo/evidence/amuse-widget-rewrite/parity/results.json` — raw rows
 *
 * It asserts, and exits non-zero on ANY failure:
 *   1. COVERAGE — the report enumerates every dimension value:
 *      skins 8 · covers 4 · themes 2 · fonts 14 · animations 24 (12 show + 12
 *      hide) · sources 6 · widget states 15 · viewports 2, and results.json
 *      contains the matching orthogonal matrix.
 *   2. STRUCTURAL GATE = 0 — no unexplained key-node structural difference.
 *   3. STYLE GATE = 0 — no unexplained computed-style difference (Layer 2).
 *   4. PIXEL — every case is within `floor + epsilon`, OR is enumerated in the
 *      unmet list with a non-empty reason (and every over-threshold case IS
 *      enumerated; no phantom entries).
 *   5. REPORT CONSISTENCY — the report carries the Gates / Calibrated pixel
 *      thresholds / Structural failures / Style gate / Unmet items sections,
 *      the gate markers are 0, and the unmet table matches thresholds.json.
 *
 * Usage: node tools/parity/report-check.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const REPORT_PATH = join(ROOT, 'docs', 'parity-report.md');
const THRESHOLDS_PATH = join(ROOT, 'tools', 'parity', 'thresholds.json');
const RESULTS_PATH = join(ROOT, '.omo', 'evidence', 'amuse-widget-rewrite', 'parity', 'results.json');

/** The frozen coverage contract (mirrors the compare.mjs registries). */
const EXPECTED = {
  skins: ['compact', 'boxy', 'gallery', 'minimal', 'macos', 'shell', 'windows98', 'discord'],
  covers: ['square', 'canvas', 'vinyl', 'none'],
  themes: ['default_dark', 'default_light'],
  fonts: [
    'poppins', 'fredoka', 'spacemono', 'silkscreen', 'bagelFatOne', 'gasoekOne',
    'zcoolKuaile', 'zcoolQingkeHuangyou', 'singleDay', 'jua', 'russoOne',
    'monomakh', 'notoSerifDisplay', 'openDyslexic',
  ],
  sources: ['pear-desktop', 'spotify', 'ytm-desktop', 'apple-music', 'tidal', 'spicetify'],
  showAnimations: [
    'default_in', 'fade_in', 'slide_in_left', 'slide_in_right', 'slide_in_top',
    'slide_in_bottom', 'grow_in', 'shrink_in', 'swing_rotate_in_left',
    'swing_rotate_in_right', 'tilt_in_right', 'tilt_in_left',
  ],
  hideAnimations: [
    'default_out', 'fade_out', 'slide_out_left', 'slide_out_right', 'slide_out_top',
    'slide_out_bottom', 'grow_out', 'shrink_out', 'swing_rotate_out_left',
    'swing_rotate_out_right', 'tilt_out_right', 'tilt_out_left',
  ],
  states: [
    'SESSION_EXPIRED', 'LOADING', 'SUCCESS', 'NO_SPOTIFY_ACCOUNT', 'YTMD_NOT_CONNECTED',
    'PROFILE_NOT_EXISTING', 'SPOTIFY_ERROR', 'SPOTIFY_ACCOUNT_ERROR', 'SERVER_ERROR',
    'ACCOUNT_NOT_EXISTING', 'DISABLED_PROFILE', 'DISABLED_PRO_SKIN', 'DISABLED_DISCORD_SKIN',
    'SPOTIFY_FREE_ACCOUNT', 'SPOTIFY_TOKEN_EXPIRED',
  ],
  viewports: ['desktop', 'mobile'],
};

const checks = [];
const failures = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(detail ? `${name} — ${detail}` : name);
}

function readText(p) { return readFileSync(p, 'utf8'); }
function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }

function main() {
  for (const p of [REPORT_PATH, THRESHOLDS_PATH, RESULTS_PATH]) {
    if (!existsSync(p)) {
      console.error(`[report-check] MISSING artifact: ${p}`);
      process.exitCode = 2;
      return;
    }
  }
  const report = readText(REPORT_PATH);
  const thresholds = readJson(THRESHOLDS_PATH);
  const results = readJson(RESULTS_PATH);
  const rows = Array.isArray(results.rows) ? results.rows : [];

  /* ---- 1. Coverage ------------------------------------------------------ */
  const dims = [
    ['skins', EXPECTED.skins],
    ['covers', EXPECTED.covers],
    ['themes', EXPECTED.themes],
    ['fonts', EXPECTED.fonts],
    ['sources', EXPECTED.sources],
    ['states', EXPECTED.states],
    ['animations', [...EXPECTED.showAnimations, ...EXPECTED.hideAnimations]],
    ['viewports', EXPECTED.viewports],
  ];
  for (const [dim, values] of dims) {
    const missing = values.filter((v) => !report.includes(`\`${v}\``));
    check(`coverage ${dim} (${values.length})`, missing.length === 0, missing.length ? `not in report: ${missing.join(', ')}` : '');
  }

  // results.json matrix shape.
  const groupOf = (r) => r.group;
  const distinct = (rs, k) => new Set(rs.map((r) => r[k]).filter((v) => v != null));
  const cross = rows.filter((r) => groupOf(r) === 'cross');
  check('results cross cases = 128', cross.length === 128, `got ${cross.length}`);
  check('results cross skins = 8', distinct(cross, 'skin').size === 8, `got ${distinct(cross, 'skin').size}`);
  check('results cross covers = 4', distinct(cross, 'cover').size === 4, `got ${distinct(cross, 'cover').size}`);
  check('results cross themes = 2', distinct(cross, 'theme').size === 2, `got ${distinct(cross, 'theme').size}`);
  check('results font cases = 14', rows.filter((r) => groupOf(r) === 'font').length === 14);
  check('results source cases = 6', rows.filter((r) => groupOf(r) === 'source').length === 6);
  check('results state cases = 28', rows.filter((r) => groupOf(r) === 'state').length === 28);
  check('results viewports = 2', distinct(rows, 'viewport').size === 2, `got ${[...distinct(rows, 'viewport')].join(',')}`);
  check('results animation ids = 24', (results.animation?.ids?.showCount ?? 0) === 12 && (results.animation?.ids?.hideCount ?? 0) === 12);

  /* ---- 2/3. Structural + style gates ------------------------------------ */
  const structTotal = rows.reduce((s, r) => s + (r.structuralDiff || 0), 0);
  const styleTotal = rows.reduce((s, r) => s + (r.styleDiff || 0), 0);
  const styleAllowedTotal = rows.reduce((s, r) => s + (r.styleAllowed || 0), 0);
  check('structural gate = 0', structTotal === 0, `total=${structTotal}`);
  check('style gate = 0 (unexplained)', styleTotal === 0, `total=${styleTotal}`);

  /* ---- 4. Pixel thresholds --------------------------------------------- */
  const vps = thresholds.viewports || {};
  for (const vp of EXPECTED.viewports) {
    const t = vps[vp];
    const ok = !!t && typeof t.floor === 'number' && typeof t.epsilon === 'number'
      && typeof t.threshold === 'number'
      && t.threshold === Math.round((t.floor + t.epsilon) * 1e4) / 1e4;
    check(`thresholds.${vp} floor+epsilon=threshold`, ok, JSON.stringify(t));
  }
  const thresholdOf = (vp) => (vps[vp] ? vps[vp].threshold : NaN);
  const over = rows.filter((r) => r.pixelPct != null && Number.isFinite(thresholdOf(r.viewport)) && r.pixelPct > thresholdOf(r.viewport));
  const unmet = Array.isArray(thresholds.unmet) ? thresholds.unmet : [];
  const keyOf = (x) => `${x.caseId}@${x.viewport}`;
  const unmetKeys = new Set(unmet.map(keyOf));
  const rowKeys = new Set(rows.map(keyOf));

  const missingUnmet = over.filter((r) => !unmetKeys.has(keyOf(r))).map(keyOf);
  check('every over-threshold case is enumerated', missingUnmet.length === 0, missingUnmet.join(', '));

  const noReason = unmet.filter((u) => !u.reason || !String(u.reason).trim());
  check('every unmet item has a non-empty reason', noReason.length === 0, noReason.map(keyOf).join(', '));

  const phantom = unmet.filter((u) => !rowKeys.has(keyOf(u)));
  check('no phantom unmet entries', phantom.length === 0, phantom.map(keyOf).join(', '));

  const declaredMissing = Array.isArray(thresholds.missingReason) ? thresholds.missingReason : [];
  check('thresholds.missingReason empty', declaredMissing.length === 0, declaredMissing.join(', '));

  /* ---- 5. Report consistency ------------------------------------------- */
  check('report has Gates section', report.includes('## Gates'));
  check('report structural gate marker = 0', /structural \(key-node contract\): \*\*0\*\* \(PASS\)/.test(report));
  check('report style gate marker = 0', /computed-style \(Layer 2\): \*\*0\*\* \(PASS\)/.test(report));
  check('report has Calibrated pixel thresholds section', report.includes('## Calibrated pixel thresholds'));
  check('report has Structural failures section', report.includes('### Structural failures (key nodes)'));
  check('report has Style gate section', report.includes('### Style gate'));
  check('report has Unmet items section', report.includes('## Unmet items'));
  check('report structural failures = None', /### Structural failures \(key nodes\)[\s\S]*?None — every case matches on the key-node contract\./.test(report));
  check('report style failures = None', /### Style gate \(Layer 2[^)]*\)[\s\S]*?None — every case matches on the computed-style gate\./.test(report));
  check('report allowlisted style count matches', report.includes(`- allowlisted differences: ${styleAllowedTotal}`), `expected ${styleAllowedTotal}`);
  check('report unexplained style count = 0', report.includes('- unexplained (gate) differences: 0'));
  if (styleAllowedTotal > 0) {
    check('report lists allowlist justifications', report.includes('Allowlisted differences (each with a written justification):'));
  }

  const pixelLine = report.match(/pixel: (\d+) within calibrated threshold · (\d+) enumerated unmet/);
  check('report pixel counts match thresholds', !!pixelLine
    && Number(pixelLine[1]) === rows.length - unmet.length
    && Number(pixelLine[2]) === unmet.length,
    pixelLine ? `report=${pixelLine[1]}/${pixelLine[2]} actual=${rows.length - unmet.length}/${unmet.length}` : 'marker not found');

  for (const u of unmet) {
    check(`report enumerates unmet ${keyOf(u)}`, report.includes(`\`${u.caseId}\``) && report.includes(String(u.reason).slice(0, 60)), '');
  }
  if (!unmet.length) {
    check('report states no unmet items', report.includes('None — every case is within its calibrated threshold.'));
  }

  /* ---- Output ---------------------------------------------------------- */
  console.log('[report-check] full-matrix parity report validation');
  console.log(`  artifacts: report=${REPORT_PATH}`);
  console.log(`             thresholds=${THRESHOLDS_PATH}`);
  console.log(`             results=${RESULTS_PATH} (${rows.length} rows)`);
  console.log('');
  for (const c of checks) {
    console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok || !c.detail ? '' : ` — ${c.detail}`}`);
  }
  console.log('');
  console.log(`[report-check] ${checks.length - failures.length}/${checks.length} checks passed`);
  if (failures.length) {
    console.error(`[report-check] FAIL — ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  } else {
    console.log('[report-check] PASS — coverage complete (8/4/2/14/24/6/15/2) · structural gate 0 · style gate 0 · every pixel case within threshold or enumerated unmet with a reason.');
    process.exitCode = 0;
  }
}

main();
