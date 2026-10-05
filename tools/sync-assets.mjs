#!/usr/bin/env node
/**
 * sync-assets.mjs
 *
 * Copies the self-hosted assets the rewrite needs from the committed `widget/`
 * reference into `app/public/`, then writes `app/public/asset-manifest.json`
 * (sha256 + byte size per copied file).
 *
 * Deterministic + idempotent: copy targets are wiped and rebuilt on every run,
 * file lists are sorted, and manifest keys use forward slashes.
 *
 * What is copied (from `widget/` -> `app/public/`):
 *   - assets/*.svg                       (8 skin previews + 4 covers + 2 themes + named icons)
 *   - assets/Custom Nothing Playing Info-*.mp4
 *   - assets/*.woff2|*.woff|*.ttf|*.eot  (every @font-face file: 37 families + ms_sans_serif)
 *   - assets/main-Dj8S0xjW.css           (the site stylesheet, kept as the 4th <link> chain)
 *   - css/critical-fonts.css, css/fa6.css
 *   - css/widget.css, css/player.css      (ported app/src/styles/{widget,player}.css)
 *   - webfonts/**                        (poppins + FontAwesome files referenced by the two css)
 *
 * Git-ignored outputs: app/public/{assets,webfonts,css}/
 * Committed outputs:   app/public/asset-manifest.json and this script.
 *
 * Usage: node tools/sync-assets.mjs
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WIDGET = join(ROOT, 'widget');
const OUT = join(ROOT, 'app', 'public');

const toPosix = (p) => p.split('\\').join('/');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const ASSETS_SRC = join(WIDGET, 'assets');
const CSS_SRC = join(WIDGET, 'css');
const WEBFONTS_SRC = join(WIDGET, 'webfonts');

const FONT_EXT = new Set(['.woff2', '.woff', '.ttf', '.eot']);

function walkFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function main() {
  if (!existsSync(ASSETS_SRC)) {
    throw new Error(`missing source: ${ASSETS_SRC}`);
  }

  // Wipe copy outputs so removals upstream are reflected (idempotent).
  for (const sub of ['assets', 'css', 'webfonts']) {
    rmSync(join(OUT, sub), { recursive: true, force: true });
  }

  /** @type {{src:string,dest:string}[]} */
  const jobs = [];
  const push = (src, dest) => {
    mkdirSync(dirname(dest), { recursive: true });
    jobs.push({ src, dest });
  };

  // 1) assets/*.svg + mp4 + fonts + main site stylesheet
  for (const name of readdirSync(ASSETS_SRC).sort()) {
    const full = join(ASSETS_SRC, name);
    const ext = name.slice(name.lastIndexOf('.'));
    const isSvg = ext === '.svg';
    const isMp4 = /^Custom Nothing Playing Info-.*\.mp4$/.test(name);
    const isFont = FONT_EXT.has(ext);
    const isMainCss = name === 'main-Dj8S0xjW.css';
    if (isSvg || isMp4 || isFont || isMainCss) {
      push(full, join(OUT, 'assets', name));
    }
  }

  // 2) css/critical-fonts.css + css/fa6.css (all css/*.css)
  if (existsSync(CSS_SRC)) {
    for (const name of readdirSync(CSS_SRC).sort()) {
      if (name.endsWith('.css')) push(join(CSS_SRC, name), join(OUT, 'css', name));
    }
  }

  // 2b) app-owned widget/player CSS ports -> public/css.
  // These are linked directly by app/index.html. Keeping them in public/ (rather
  // than as Vite-processed /src links) stops Vite merging them into the generated
  // Tailwind sheet and preserves their cascade slot after /assets/main-Dj8S0xjW.css.
  // The canonical source of truth stays app/src/styles/{widget,player}.css.
  for (const name of ['widget.css', 'player.css']) {
    const src = join(ROOT, 'app', 'src', 'styles', name);
    if (!existsSync(src)) throw new Error(`missing app stylesheet: ${src}`);
    push(src, join(OUT, 'css', name));
  }

  // 3) webfonts/** preserving sub-directories (poppins/**, fa-*.*)
  if (existsSync(WEBFONTS_SRC)) {
    for (const full of walkFiles(WEBFONTS_SRC)) {
      push(full, join(OUT, 'webfonts', relative(WEBFONTS_SRC, full)));
    }
  }

  // Copy
  for (const { src, dest } of jobs) copyFileSync(src, dest);

  // Manifest (sha256 per copied file, sorted by output path)
  const files = jobs.map(({ src, dest }) => {
    const buf = readFileSync(src);
    return {
      source: toPosix(relative(ROOT, src)),
      output: toPosix(relative(ROOT, dest)),
      sha256: sha256(buf),
      bytes: buf.length,
    };
  });
  files.sort((a, b) => (a.output < b.output ? -1 : a.output > b.output ? 1 : 0));

  const manifest = {
    generatedBy: 'tools/sync-assets.mjs',
    fileCount: files.length,
    files,
  };
  writeFileSync(
    join(OUT, 'asset-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );

  console.log(`sync-assets: copied ${files.length} files -> app/public/`);
}

main();
