#!/usr/bin/env node
/**
 * beautify-reference.mjs
 *
 * Generates a readable, DESENSITIZED reverse-engineering reference layer at
 * `app/_reference/`. The output directory is git-ignored on purpose: it is a
 * reproducible scratch layer derived from committed sources, so no proprietary
 * reverse-engineered code (or embedded credentials) is ever committed.
 *
 * Sources of truth (all committed):
 *   - `widget/assets/<chunk>.js`  -> beautified with esbuild (`minify:false`)
 *   - `.omo/_beautify/<file>.js` -> copied verbatim (already readable)
 *
 * Desensitization happens BEFORE anything is written. Two passes:
 *   1. Spec pass: every `VITE_*_(TOKEN|API_KEY|KEY|POSTHOG[A-Z_]*)` /
 *      `VITE_POSTHOG_KEY_PUBLIC` string literal value -> `""`.
 *   2. Safety pass: any residual credential-shaped literal that does not live
 *      under a VITE_* property (e.g. the hardcoded `Bearer <hex>` and the
 *      posthog project key inside `main-Dx8nN5Es.js`) -> redacted.
 *
 * Deterministic + idempotent: same inputs => byte-identical output and
 * `reference-manifest.json` (sorted, forward-slash keys, sha256 per input).
 *
 * Usage: node tools/beautify-reference.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WIDGET_ASSETS = join(ROOT, 'widget', 'assets');
const BEAUTIFY_SRC = join(ROOT, '.omo', '_beautify');
const OUT_DIR = join(ROOT, 'app', '_reference');

/**
 * Overlay-closure chunks that are NOT already covered by `.omo/_beautify/`
 * (the overlay closure is the 19 `modulepreload` chunks in widget/overlay.html
 * plus their transitive imports). AmuseWidget / useAmuseSettings / the two
 * interfaces are covered by the copy list below, so they are excluded here.
 * Sorted for determinism.
 */
const BEAUTIFY_CHUNKS = [
  'LinearGradient-BOB__u-G.js',
  'PlayerWindows98-ChpRHqWu.js',
  '_widget_token-Be9ST3-c.js',
  'card-C5kIrwgQ.js',
  'index-B9ygI19o.js',
  'index-DppCSiCr.js',
  'isSymbol-CdNpN0Up.js',
  'main-Dx8nN5Es.js',
  'proxy-B-X3wluv.js',
  'react-palette-CpYaOuWc.js',
  'useAxios-Rfx7aUEI.js',
  'useCollection-DDnPU7JM.js',
  'useMutation-Ba0Zo_ud.js',
  'useMutations-Z5myPUak.js',
  'useSocket2-CiuC2fti.js',
];

/** Already-beautified files copied verbatim from `.omo/_beautify/`. */
const COPY_FILES = [
  'AmuseWidget.js',
  'subscription.interface.js',
  'useAmuseSettings.js',
  'user.interface.js',
];

// --- desensitization -------------------------------------------------------

/** Pass 1 (spec): VITE_* secret property values -> "". */
const VITE_SECRET_RE =
  /(VITE_[A-Z0-9_]*?(?:TOKEN|API_KEY|KEY|POSTHOG[A-Z0-9_]*)\s*:\s*)"(?:[^"\\]|\\.)*"/g;

/** Pass 2 (safety): credential-shaped literals that are not VITE_* properties.
 *  The prefixes are assembled at runtime so this committed file itself never
 *  contains a literal secret prefix. */
const CREDENTIAL_PREFIXES = ['pk_live', 'pk_test', 'sk_live', 'sk_test', 'phc'];

function desensitize(code) {
  let out = code.replace(VITE_SECRET_RE, '$1""');
  for (const prefix of CREDENTIAL_PREFIXES) {
    out = out.replace(new RegExp(prefix + '_' + '[A-Za-z0-9]+', 'g'), 'REDACTED');
  }
  out = out.replace(/Bearer\s+[A-Za-z0-9._-]{20,}/g, 'REDACTED');
  return out;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  /** @type {{source:string,sha256:string,output:string,outputSha256:string,mode:string}[]} */
  const inputs = [];

  for (const chunk of BEAUTIFY_CHUNKS) {
    const source = join(WIDGET_ASSETS, chunk);
    const raw = readFileSync(source, 'utf8');
    const beautified = esbuild.transformSync(raw, {
      loader: 'js',
      minify: false,
      legalComments: 'none',
    }).code;
    const code = desensitize(beautified);
    const output = join(OUT_DIR, chunk);
    writeFileSync(output, code, 'utf8');
    inputs.push({
      source: `widget/assets/${chunk}`,
      sha256: sha256(Buffer.from(raw, 'utf8')),
      output: `app/_reference/${chunk}`,
      outputSha256: sha256(Buffer.from(code, 'utf8')),
      mode: 'beautify',
    });
  }

  for (const file of COPY_FILES) {
    const source = join(BEAUTIFY_SRC, file);
    const raw = readFileSync(source, 'utf8');
    const code = desensitize(raw);
    const output = join(OUT_DIR, file);
    writeFileSync(output, code, 'utf8');
    inputs.push({
      source: `.omo/_beautify/${file}`,
      sha256: sha256(Buffer.from(raw, 'utf8')),
      output: `app/_reference/${file}`,
      outputSha256: sha256(Buffer.from(code, 'utf8')),
      mode: 'copy',
    });
  }

  inputs.sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));

  const manifest = {
    generatedBy: 'tools/beautify-reference.mjs',
    note: 'git-ignored scratch layer; regenerate from committed widget/ + .omo/_beautify/',
    desensitized: true,
    inputs,
  };
  writeFileSync(
    join(OUT_DIR, 'reference-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );

  console.log(
    `beautify-reference: wrote ${inputs.length} files to app/_reference/ (desensitized)`,
  );
}

main();
