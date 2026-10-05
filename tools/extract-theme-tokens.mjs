#!/usr/bin/env node
/**
 * extract-theme-tokens.mjs
 *
 * Reproducible extraction of the Tailwind v4 theme tokens the Amuse overlay
 * actually uses, from the original production CSS.
 *
 * Method (mirrors plan task 4):
 *   1. Parse every custom property declared in `@theme` / `:root` of
 *      `widget/assets/index-CEICj85Z.css` (candidate universe).
 *   2. Scan the 19 overlay `modulepreload` chunks from `widget/overlay.html`
 *      for `bg-/text-/font-/border-/...<token>` utility classes and intersect
 *      with the candidate universe.
 *   3. Union the tokens referenced through `var(--color-*)` / `var(--font-*)`
 *      in the ported stylesheets (PlayerWindows98 / AmuseWidget / main).
 *   4. Expand the dependency closure (e.g. `--color-background` pulls in the
 *      raw `--background` HSL variable) so every emitted value resolves.
 *
 * Outputs:
 *   - app/theme-tokens.json        (committed assertion basis)
 *   - app/src/styles/tailwind.css  (regenerated from the JSON, diffable)
 *   - .omo/evidence/amuse-widget-rewrite/task-4-theme.json (evidence copy)
 *
 * Usage:
 *   node tools/extract-theme-tokens.mjs            # write outputs
 *   node tools/extract-theme-tokens.mjs --check    # fail if outputs differ
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_CSS = path.join(ROOT, 'widget/assets/index-CEICj85Z.css');
const OVERLAY_HTML = path.join(ROOT, 'widget/overlay.html');
const DEFAULT_THEME_CSS = path.join(ROOT, 'app/node_modules/tailwindcss/theme.css');
const PORTED_CSS = [
  'widget/assets/PlayerWindows98-Dx94IdDH.css',
  'widget/assets/AmuseWidget-D785d3vh.css',
  'widget/assets/main-Dj8S0xjW.css',
];
const JSON_OUT = path.join(ROOT, 'app/theme-tokens.json');
const CSS_OUT = path.join(ROOT, 'app/src/styles/tailwind.css');
const EVIDENCE_OUT = path.join(ROOT, '.omo/evidence/amuse-widget-rewrite/task-4-theme.json');

const check = process.argv.includes('--check');
const read = (p) => fs.readFileSync(p, 'utf8');

/** Extract `{ ... }` content starting at the `{` at `open`. Returns [inner, closeIndex]. */
function braceBlock(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return [css.slice(open + 1, i), i];
    }
  }
  throw new Error('unbalanced braces');
}

/** Parse `--name: value;` declarations inside a CSS fragment. */
function parseDecls(fragment) {
  const out = {};
  const re = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)/g;
  let m;
  while ((m = re.exec(fragment))) out[m[1]] = m[2].trim();
  return out;
}

// ---------------------------------------------------------------------------
// 1. Candidate universe: @theme / :root custom properties
// ---------------------------------------------------------------------------
const indexCss = read(INDEX_CSS);

/** namespaced tokens from the compiled `@layer theme{ :root,:host{...} }` block */
const themeLayerTokens = {};
{
  const re = /@layer\s+theme\s*\{/g;
  let m;
  while ((m = re.exec(indexCss))) {
    const [layerInner] = braceBlock(indexCss, indexCss.indexOf('{', m.index));
    const rootOpen = layerInner.indexOf('{', layerInner.indexOf(':root'));
    if (rootOpen < 0) continue;
    const [rootInner] = braceBlock(layerInner, rootOpen);
    Object.assign(themeLayerTokens, parseDecls(rootInner));
  }
  // literal @theme block, if the source (not build output) is ever used
  const reTheme = /@theme\s*\{/g;
  while ((m = reTheme.exec(indexCss))) {
    const [inner] = braceBlock(indexCss, indexCss.indexOf('{', m.index));
    Object.assign(themeLayerTokens, parseDecls(inner));
  }
}

/** raw variables from standalone `:root` / `.dark` blocks (shadcn HSL layer) */
const themeVarLayers = { ':root': {}, '.dark': {} };
{
  const re = /(^|\})(:root|\.dark)(\s*,[^{]*)?\s*\{/g;
  let m;
  while ((m = re.exec(indexCss))) {
    const open = indexCss.indexOf('{', m.index);
    const [inner] = braceBlock(indexCss, open);
    const sel = m[2];
    Object.assign(themeVarLayers[sel], parseDecls(inner));
  }
}

// Tailwind's own default theme -> everything else is a *custom* token.
const defaultTokens = new Set(Object.keys(parseDecls(read(DEFAULT_THEME_CSS))));

const candidateTokens = {};
for (const [name, value] of Object.entries(themeLayerTokens)) {
  if (!defaultTokens.has(name)) candidateTokens[name] = value;
}

// Raw dependency variables (no Tailwind namespace) are candidates too.
const rawCandidates = {};
for (const [name, value] of Object.entries(themeVarLayers[':root'])) {
  if (!defaultTokens.has(name)) rawCandidates[name] = value;
}
for (const [name, value] of Object.entries(themeVarLayers['.dark'])) {
  if (!defaultTokens.has(name)) rawCandidates[name] = value;
}

// ---------------------------------------------------------------------------
// 2. Overlay closure: 19 modulepreload chunks
// ---------------------------------------------------------------------------
const overlayHtml = read(OVERLAY_HTML);
const chunkFiles = [...overlayHtml.matchAll(/<link rel="modulepreload" href="\/assets\/([^"]+)"/g)].map(
  (m) => m[1],
);
if (chunkFiles.length !== 19) {
  throw new Error(`expected 19 overlay chunks, found ${chunkFiles.length}`);
}
const chunkSource = chunkFiles.map((f) => read(path.join(ROOT, 'widget/assets', f))).join('\n');

// Utility prefixes that can consume a theme token.
const COLOR_PREFIXES = [
  'bg', 'text', 'border', 'fill', 'stroke', 'from', 'via', 'to', 'ring',
  'outline', 'shadow', 'decoration', 'accent', 'caret', 'divide', 'placeholder',
  'inset-ring',
];

/** Map a namespaced token to the set of utility class stems that can use it. */
function classPrefixes(name) {
  if (name.startsWith('--color-')) return COLOR_PREFIXES.map((p) => [p, name.slice('--color-'.length)]);
  if (name.startsWith('--font-')) return [['font', name.slice('--font-'.length)]];
  if (name.startsWith('--animate-')) return [['animate', name.slice('--animate-'.length)]];
  if (name.startsWith('--drop-shadow-')) return [['drop-shadow', name.slice('--drop-shadow-'.length)]];
  return [];
}

const overlayChunkTokens = [];
const referencedButNotDeclared = new Set();
for (const [name] of Object.entries(candidateTokens)) {
  const hit = classPrefixes(name).some(([prefix, stem]) => {
    const re = new RegExp(`(^|[^a-zA-Z0-9-])${prefix}-${stem}(?![a-zA-Z0-9-])`);
    return re.test(chunkSource);
  });
  if (hit) overlayChunkTokens.push(name);
}

// Sanity: any shell/discord/spotify/osx/font class in the chunks whose token is
// missing from the original @theme (i.e. referenced-but-not-declared upstream).
for (const m of chunkSource.matchAll(
  /(^|[^a-zA-Z0-9-])((?:bg|text|border|fill|stroke|from|via|to|ring|outline|shadow|drop-shadow|font|animate)-(?:shell|discord|spotify|osx)[a-z0-9-]*)/g,
)) {
  const cls = m[2];
  const declared = Object.keys(candidateTokens).some((name) =>
    classPrefixes(name).some(([prefix, stem]) => cls === `${prefix}-${stem}`),
  );
  if (!declared) referencedButNotDeclared.add(cls);
}

// ---------------------------------------------------------------------------
// 3. Ported stylesheets: var(--color-*) / var(--font-*) references
// ---------------------------------------------------------------------------
const portedVarTokens = new Set();
for (const rel of PORTED_CSS) {
  const css = read(path.join(ROOT, rel));
  for (const m of css.matchAll(/var\(\s*(--(?:color|font)-[a-zA-Z0-9_-]+)/g)) {
    if (m[1] in candidateTokens) portedVarTokens.add(m[1]);
  }
}

// ---------------------------------------------------------------------------
// 4. Declared set + dependency closure
// ---------------------------------------------------------------------------
const seed = new Set([...overlayChunkTokens, ...portedVarTokens]);
const declaredTokens = {};
const declaredDependencies = {};
const queue = [...seed];
const seen = new Set(queue);
while (queue.length) {
  const name = queue.shift();
  const value = candidateTokens[name] ?? rawCandidates[name];
  if (value === undefined) continue;
  if (name in candidateTokens) {
    declaredTokens[name] = value;
  } else if (name in rawCandidates) {
    const light = themeVarLayers[':root'][name];
    const dark = themeVarLayers['.dark'][name];
    declaredDependencies[name] = {};
    if (light !== undefined) declaredDependencies[name][':root'] = light;
    if (dark !== undefined) declaredDependencies[name]['.dark'] = dark;
  }
  for (const dep of value.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) {
    const d = dep[1];
    if (!seen.has(d) && (d in candidateTokens || d in rawCandidates)) {
      seen.add(d);
      queue.push(d);
    }
  }
}

const sortKeys = (obj) =>
  Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

const report = {
  generatedBy: 'tools/extract-theme-tokens.mjs',
  source: {
    indexCss: 'widget/assets/index-CEICj85Z.css',
    overlayHtml: 'widget/overlay.html',
    chunks: chunkFiles,
    portedCss: PORTED_CSS,
  },
  counts: {
    themeLayerCustomCandidates: Object.keys(candidateTokens).length,
    rawRootVariables: Object.keys(rawCandidates).length,
    overlayChunkTokens: overlayChunkTokens.length,
    portedCssVarTokens: portedVarTokens.size,
    declaredTokens: Object.keys(declaredTokens).length,
    declaredDependencies: Object.keys(declaredDependencies).length,
  },
  // full candidate universe (name -> verbatim value) from @theme / :root
  candidateTokens: sortKeys(candidateTokens),
  // tokens referenced by the 19 overlay chunks (intersection with candidates)
  overlayChunkTokens: [...overlayChunkTokens].sort(),
  // tokens referenced via var(--color-*) in the ported CSS (union source)
  portedCssVarTokens: [...portedVarTokens].sort(),
  // final declared set (name -> verbatim value)
  declaredTokens: sortKeys(declaredTokens),
  // raw dependency variables with their light/dark values
  declaredDependencies: sortKeys(declaredDependencies),
  // overlay custom classes that had no matching token in the original CSS
  referencedButNotDeclared: [...referencedButNotDeclared].sort(),
};

// ---------------------------------------------------------------------------
// Emit tailwind.css deterministically from the declared set
// ---------------------------------------------------------------------------
function formatValue(v) {
  return v.replace(/\s*,\s*/g, ',').trim();
}
const lines = [];
lines.push('@import "tailwindcss";');
lines.push('');
lines.push('/*');
lines.push(' * Theme tokens ported VERBATIM from widget/assets/index-CEICj85Z.css.');
lines.push(' * Generated by tools/extract-theme-tokens.mjs - do not edit by hand.');
lines.push(' * Assertion basis: app/theme-tokens.json');
lines.push(' */');
lines.push('');
const depNames = Object.keys(declaredDependencies);
if (depNames.length) {
  for (const layer of [':root', '.dark']) {
    const vars = depNames.filter((n) => layer in declaredDependencies[n]);
    if (!vars.length) continue;
    lines.push(`${layer} {`);
    for (const n of vars) lines.push(`  ${n}: ${formatValue(declaredDependencies[n][layer])};`);
    lines.push('}');
    lines.push('');
  }
}
lines.push('@theme {');
for (const [name, value] of Object.entries(declaredTokens)) {
  lines.push(`  ${name}: ${formatValue(value)};`);
}
lines.push('}');
lines.push('');
const cssOutput = lines.join('\n');

const jsonOutput = JSON.stringify(report, null, 2) + '\n';

if (check) {
  const normalize = (s) => s.replace(/\r\n/g, '\n');
  const mismatches = [];
  if (!fs.existsSync(JSON_OUT) || normalize(read(JSON_OUT)) !== normalize(jsonOutput)) mismatches.push(JSON_OUT);
  if (!fs.existsSync(CSS_OUT) || normalize(read(CSS_OUT)) !== normalize(cssOutput)) mismatches.push(CSS_OUT);
  if (mismatches.length) {
    console.error('OUT OF DATE:\n  ' + mismatches.join('\n  '));
    process.exit(1);
  }
  console.log('theme tokens are up to date');
} else {
  fs.writeFileSync(JSON_OUT, jsonOutput);
  fs.mkdirSync(path.dirname(CSS_OUT), { recursive: true });
  fs.writeFileSync(CSS_OUT, cssOutput);
  fs.mkdirSync(path.dirname(EVIDENCE_OUT), { recursive: true });
  fs.writeFileSync(EVIDENCE_OUT, jsonOutput);
  console.log(JSON.stringify(report.counts, null, 2));
  console.log('declared:', Object.keys(declaredTokens).length, 'deps:', depNames.length);
}
