#!/usr/bin/env node
/**
 * check-head-order.mjs
 *
 * Verifies the BUILT app (app/dist) keeps the original widget overlay
 * stylesheet cascade, and that every stylesheet link resolves to a real,
 * non-empty file (no 404) after Vite's bundling/rewrite:
 *
 *   1 /css/critical-fonts.css
 *   2 /css/fa6.css
 *   3 /static/index-<hash>.css   (generated Tailwind v4 sheet)
 *   4 /assets/main-Dj8S0xjW.css
 *   5 /css/widget.css
 *   6 /css/player.css
 *
 * Usage: node tools/check-head-order.mjs [distDir=app/dist]
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIST = resolve(ROOT, process.argv[2] ?? join('app', 'dist'));

function fail(msg) {
  console.error(`check-head-order: FAIL - ${msg}`);
  process.exit(1);
}

const indexPath = join(DIST, 'index.html');
if (!existsSync(indexPath)) fail(`missing ${indexPath} (run: pnpm --dir app build)`);
const html = readFileSync(indexPath, 'utf8');

const hrefs = (html.match(/<link\b[^>]*>/g) ?? [])
  .filter((t) => /rel="stylesheet"/.test(t))
  .map((t) => (t.match(/href="([^"]+)"/) ?? [])[1]);

if (hrefs.length !== 6) fail(`expected 6 stylesheet links, found ${hrefs.length}: ${hrefs.join(', ')}`);

const checks = [
  [0, (h) => h === '/css/critical-fonts.css', '/css/critical-fonts.css'],
  [1, (h) => h === '/css/fa6.css', '/css/fa6.css'],
  [2, (h) => /^\/static\/index-[\w-]+\.css$/.test(h), '/static/index-<hash>.css'],
  [3, (h) => h === '/assets/main-Dj8S0xjW.css', '/assets/main-Dj8S0xjW.css'],
  [4, (h) => h === '/css/widget.css', '/css/widget.css'],
  [5, (h) => h === '/css/player.css', '/css/player.css'],
];
for (const [i, test, label] of checks) {
  if (!test(hrefs[i])) fail(`slot ${i + 1} expected ${label}, got ${hrefs[i]}`);
}

for (const href of hrefs) {
  const file = join(DIST, href.replace(/^\//, ''));
  if (!existsSync(file)) fail(`${href} -> ${file} does not exist (404)`);
  if (statSync(file).size === 0) fail(`${href} -> ${file} is empty`);
}

// Sanity: the generated slot-3 sheet is really the Tailwind v4 sheet.
const gen = readFileSync(join(DIST, hrefs[2].replace(/^\//, '')), 'utf8');
if (!/tailwindcss v4/.test(gen)) fail('slot 3 is not the generated Tailwind v4 sheet');

console.log('check-head-order: PASS');
for (const [i, href] of hrefs.entries()) console.log(`  ${i + 1}. ${href}`);
