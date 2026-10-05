#!/usr/bin/env node
/**
 * tools/check-host-injection.mjs
 *
 * Guard: the rewrite host HTML must carry the live-settings-refresh injection
 * that is equivalent to the original host (widget-server.mjs:63-65):
 *
 *   - subscribe with `new EventSource("/api/events")`
 *   - on the `profile-changed` event, dispatch `visibilitychange` + `focus`
 *     window events so react-query refetches settings without a reload
 *
 * Checked targets (in order):
 *   - app/index.html            (the rewrite host template, always)
 *   - app/dist/index.html       (the built host, when present)
 *   - any explicit paths passed as argv
 *
 * Usage: node tools/check-host-injection.mjs [file...]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/** Substrings that must all appear in the host HTML (order-independent). */
export const INJECTION_MARKERS = [
  'EventSource("/api/events")',
  'addEventListener("profile-changed"',
  'dispatchEvent(new Event("visibilitychange"))',
  'dispatchEvent(new Event("focus"))',
];

/** Returns { ok, missing, reason } for a single HTML file. */
export function checkInjection(file) {
  if (!existsSync(file)) return { ok: false, missing: [], reason: `missing ${file}` };
  const html = readFileSync(file, 'utf8');
  const missing = INJECTION_MARKERS.filter((marker) => !html.includes(marker));
  return {
    ok: missing.length === 0,
    missing,
    reason: missing.length ? `missing ${missing.length} marker(s) in ${file}` : '',
  };
}

function main() {
  const explicit = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  let files;
  if (explicit.length) {
    files = explicit.map((p) => resolve(p));
  } else {
    files = [join(ROOT, 'app', 'index.html')];
    const dist = join(ROOT, 'app', 'dist', 'index.html');
    if (existsSync(dist)) files.push(dist);
  }

  let ok = true;
  for (const file of files) {
    const result = checkInjection(file);
    console.log(`check-host-injection: ${result.ok ? 'PASS' : 'FAIL'} ${file}`);
    if (!result.ok) {
      ok = false;
      if (result.reason) console.log(`  ${result.reason}`);
      for (const marker of result.missing) console.log(`  missing: ${marker}`);
    }
  }
  if (!ok) {
    console.error('check-host-injection: FAIL');
    process.exit(1);
  }
  console.log('check-host-injection: PASS');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
