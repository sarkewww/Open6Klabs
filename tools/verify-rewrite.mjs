#!/usr/bin/env node
/**
 * tools/verify-rewrite.mjs — deterministic static gate for the amuse-widget
 * rewrite. CI-friendly: prints a per-check report and exits non-zero on ANY
 * violation.
 *
 * Checks
 *   1. hosts      — no 6klabs.com business-data request hosts in the rewrite
 *                   product (`app/**` + `tools/**`). The sanctioned no-op hosts
 *                   (metrics/content/hdx/glorp + ipv4.icanhazip.com) are the
 *                   only 6klabs hosts permitted, and only as inert constants.
 *   2. secrets    — zero hits for credential material in `app/**` (the
 *                   gitignored `app/_reference/` capture is excluded) and
 *                   `tools/**`: `Bearer <long hex>`, two historical hex
 *                   fragments, a Stripe live publishable key prefix, and a
 *                   PostHog project-token prefix.
 *   3. widget     — `widget/**` is an explicit frozen-capture allowlist entry
 *                   (contains historical credentials); it must exist and be
 *                   unmodified. Git history is never rewritten.
 *   4. deps       — `app/package.json` runtime dependencies are exact semver:
 *                   no `^`/`~`/`latest`/`*`/bare-major ranges.
 *   5. resources  — every relative import in the app resolves to a real file,
 *                   and every bare import maps to a declared dependency.
 *
 * Usage: node tools/verify-rewrite.mjs [--json]
 *
 * NOTE ON SELF-SCANNING: the forbidden credential tokens below are assembled at
 * runtime from fragments so this file's own source never contains them (and
 * therefore never self-triggers the secret gate). Do not "simplify" them into
 * literals.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const APP = join(ROOT, 'app');

/* -------------------------------------------------------------------------- */
/* Sanctioned no-op hosts (see app/src/amuse/external/noop-hosts.ts)          */
/* -------------------------------------------------------------------------- */

const NOOP_HOSTS = [
  'metrics.6klabs.com',
  'content.6klabs.com',
  'hdx.6klabs.com',
  'glorp.6klabs.com',
  'ipv4.icanhazip.com',
];

/** A 6klabs host is sanctioned only if it is a no-op host or a `glorp.*` sub. */
function isSanctionedHost(host) {
  const h = host.toLowerCase();
  if (NOOP_HOSTS.includes(h)) return true;
  return /^glorp\./.test(h);
}

/* -------------------------------------------------------------------------- */
/* Frozen-capture / infrastructure exemptions                                 */
/* -------------------------------------------------------------------------- */

/**
 * Paths exempt from one or more checks, each with a written reason.
 *   - `widget/**`            frozen capture of the original bundle; HEAD already
 *                            contains historical credentials. Never modified,
 *                            never re-scanned, git history never rewritten.
 *   - `tools/parity/baseline/**`  frozen HTTP baseline captured from the
 *                            original widget; contains the original's request
 *                            shapes (incl. a PostHog ingest URL) verbatim.
 *   - `tools/parity/**` (host) parity harness only: it *intercepts* the
 *                            original's hosts to reproduce them; it is test
 *                            infrastructure, not rewrite runtime.
 */
const EXEMPTIONS = [
  {
    glob: 'widget/**',
    checks: ['host', 'secret'],
    reason:
      'frozen capture of the original bundle; HEAD contains historical credentials; must not be modified; git history not rewritten',
  },
  {
    glob: 'tools/parity/baseline/**',
    checks: ['host', 'secret'],
    reason:
      'frozen HTTP baseline captured from the original widget (verbatim request shapes incl. an ingest URL); parity harness is complete and must not be modified',
  },
  {
    glob: 'tools/parity/**',
    checks: ['host'],
    reason:
      'parity harness intercepts the original hosts to reproduce them; test infrastructure, not rewrite runtime',
  },
];

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const withStars = escaped.replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*');
  return new RegExp('^' + withStars.replace(/\u0000/g, '.*') + '$');
}

function isExempt(file, check) {
  return EXEMPTIONS.some(
    (e) => e.checks.includes(check) && globToRegExp(e.glob).test(file),
  );
}

/* -------------------------------------------------------------------------- */
/* File enumeration (tracked + untracked-but-not-ignored)                     */
/* -------------------------------------------------------------------------- */

function listFiles() {
  try {
    const out = execFileSync(
      'git',
      [
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        'app',
        'tools',
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/\\/g, '/'));
  } catch {
    return walkFallback();
  }
}

function walkFallback() {
  const skip = new Set([
    'node_modules',
    'dist',
    '.git',
    '_reference',
    'assets',
    'webfonts',
    'css',
  ]);
  const out = [];
  const visit = (dir, rel) => {
    for (const name of readdirSyncSafe(dir)) {
      const abs = join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (skip.has(name)) continue;
        visit(abs, r);
      } else {
        out.push(r);
      }
    }
  };
  visit(APP, 'app');
  visit(join(ROOT, 'tools'), 'tools');
  return out;
}

function readdirSyncSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

const IS_BINARY_EXT =
  /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp[34]|wav|pdf|zip|gz|bin|exe|dll|snap)$/i;

function readText(abs) {
  let buf;
  try {
    buf = readFileSync(abs);
  } catch {
    return null;
  }
  // NUL byte in the head => binary, skip.
  for (let i = 0; i < Math.min(buf.length, 8000); i++) {
    if (buf[i] === 0) return null;
  }
  return buf.toString('utf8');
}

/* -------------------------------------------------------------------------- */
/* String-literal extraction (comment-aware)                                  */
/* -------------------------------------------------------------------------- */

/** Extract single/double/backtick string contents, skipping comments. */
function extractStringLiterals(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      i += 2;
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let j = i + 1;
      let buf = '';
      while (j < n) {
        if (src[j] === '\\') {
          buf += src[j + 1] ?? '';
          j += 2;
          continue;
        }
        if (src[j] === quote) break;
        buf += src[j];
        j++;
      }
      out.push(buf);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

/** Remove `//` and block comments, preserving string contents. */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      i += 2;
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Check 1 — 6klabs business-data hosts                                       */
/* -------------------------------------------------------------------------- */

const SIXLABS_RE = /(?:[a-z0-9-]+\.)*6klabs\.com/gi;

function checkHosts(files) {
  const violations = [];
  let scanned = 0;
  for (const file of files) {
    if (!file.startsWith('app/') && !file.startsWith('tools/')) continue;
    if (isExempt(file, 'host')) continue;
    if (IS_BINARY_EXT.test(file)) continue;
    const text = readText(join(ROOT, file));
    if (text == null) continue;
    scanned++;
    for (const literal of extractStringLiterals(text)) {
      for (const m of literal.matchAll(SIXLABS_RE)) {
        const host = m[0].toLowerCase();
        if (!isSanctionedHost(host)) {
          violations.push({
            file,
            host,
            detail: `non-sanctioned 6klabs host in string literal: ${host}`,
          });
        }
      }
    }
  }
  return { scanned, violations };
}

/* -------------------------------------------------------------------------- */
/* Check 2 — credential material                                              */
/* -------------------------------------------------------------------------- */

/** Built from fragments so this file never contains the forbidden tokens. */
const SECRET_TOKENS = [
  { id: 'historical-hex-fragment-1', token: ['c97816', 'ab'].join('') },
  { id: 'historical-hex-fragment-2', token: ['84ef80', '2d'].join('') },
  { id: 'stripe-live-publishable-prefix', token: ['pk', '_live_'].join('') },
  { id: 'posthog-project-token-prefix', token: ['p', 'hc_'].join('') },
];

const BEARER_HEX_RE = /Bearer\s+[0-9a-fA-F]{16,}/;

function checkSecrets(files) {
  const violations = [];
  let scanned = 0;
  for (const file of files) {
    if (!file.startsWith('app/') && !file.startsWith('tools/')) continue;
    if (isExempt(file, 'secret')) continue;
    if (IS_BINARY_EXT.test(file)) continue;
    const text = readText(join(ROOT, file));
    if (text == null) continue;
    scanned++;
    if (BEARER_HEX_RE.test(text)) {
      violations.push({ file, detail: 'Bearer <long hex> credential' });
    }
    for (const { id, token } of SECRET_TOKENS) {
      if (text.includes(token)) {
        violations.push({ file, detail: `${id} (${token.slice(0, 4)}…)` });
      }
    }
  }
  return { scanned, violations };
}

/* -------------------------------------------------------------------------- */
/* Check 3 — widget frozen-capture guard                                      */
/* -------------------------------------------------------------------------- */

function checkWidget() {
  const violations = [];
  const notes = [];
  const widgetDir = join(ROOT, 'widget');
  if (!existsSync(widgetDir)) {
    violations.push({ file: 'widget/', detail: 'widget/ directory is missing' });
    return { violations, notes };
  }
  for (const e of EXEMPTIONS) {
    notes.push(`${e.glob} — ${e.reason}`);
  }
  try {
    const status = execFileSync('git', ['status', '--porcelain', '--', 'widget'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    if (status) {
      violations.push({
        file: 'widget/',
        detail: `widget/ must not be modified (working tree changes):\n${status}`,
      });
    }
  } catch (err) {
    notes.push(`widget/ git-status check skipped: ${err.message}`);
  }
  return { violations, notes };
}

/* -------------------------------------------------------------------------- */
/* Check 4 — exact-pinned runtime dependencies                                */
/* -------------------------------------------------------------------------- */

const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function checkDeps() {
  const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'));
  const deps = Object.entries(pkg.dependencies ?? {});
  const violations = [];
  for (const [name, range] of deps) {
    if (!EXACT_SEMVER.test(range)) {
      let why = 'not an exact X.Y.Z semver';
      if (typeof range === 'string') {
        if (range.startsWith('^')) why = 'caret range';
        else if (range.startsWith('~')) why = 'tilde range';
        else if (range === 'latest') why = 'latest tag';
        else if (range === '*' || range === '') why = 'wildcard';
        else if (/^\d+$/.test(range)) why = 'bare major version';
      }
      violations.push({ file: 'app/package.json', detail: `${name}: "${range}" (${why})` });
    }
  }
  return { count: deps.length, violations };
}

/* -------------------------------------------------------------------------- */
/* Check 5 — resources + declared dependencies                                */
/* -------------------------------------------------------------------------- */

const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'http2',
  'https', 'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
  'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'timers',
  'tls', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

const SPEC_RE =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

const RESOLVE_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css'];

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function resolveRelative(fromFile, spec) {
  const base = resolve(dirname(join(ROOT, fromFile)), spec);
  for (const ext of RESOLVE_EXTS) {
    if (isFile(base + ext)) return true;
  }
  for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.json']) {
    if (isFile(join(base, 'index' + ext))) return true;
  }
  return false;
}

function packageNameOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function checkResources(files) {
  const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'));
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
  const violations = [];
  let imports = 0;
  let packages = 0;
  for (const file of files) {
    if (!/^app\/.*\.(ts|tsx|js|mjs|cjs|jsx)$/.test(file)) continue;
    if (file.startsWith('app/_reference/')) continue;
    const text = readText(join(ROOT, file));
    if (text == null) continue;
    for (const m of stripComments(text).matchAll(SPEC_RE)) {
      const raw = m[1];
      const spec = raw.split(/[?#]/)[0];
      if (!spec || spec.startsWith('#')) continue;
      imports++;
      if (spec.startsWith('.')) {
        if (!resolveRelative(file, spec)) {
          violations.push({ file, detail: `missing resource: '${raw}'` });
        }
        continue;
      }
      if (spec.startsWith('/')) continue; // absolute Vite public path
      const pkgName = packageNameOf(spec);
      if (pkgName.startsWith('node:') || NODE_BUILTINS.has(pkgName)) continue;
      packages++;
      if (!declared.has(pkgName)) {
        violations.push({ file, detail: `undeclared dependency: '${pkgName}'` });
      }
    }
  }
  // index.html /src resource references.
  const html = readText(join(APP, 'index.html'));
  if (html != null) {
    for (const m of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
      const p = m[1].split(/[?#]/)[0];
      if (!p.startsWith('/src/')) continue;
      if (!existsSync(join(APP, p.replace(/^\//, '')))) {
        violations.push({ file: 'app/index.html', detail: `missing resource: '${m[1]}'` });
      }
    }
  }
  return { imports, packages, violations };
}

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

function main() {
  const json = process.argv.includes('--json');
  const files = listFiles();

  const hosts = checkHosts(files);
  const secrets = checkSecrets(files);
  const widget = checkWidget();
  const deps = checkDeps();
  const resources = checkResources(files);

  const allViolations = [
    ...hosts.violations,
    ...secrets.violations,
    ...widget.violations,
    ...deps.violations,
    ...resources.violations,
  ];
  const ok = allViolations.length === 0;

  if (json) {
    const report = {
      ok,
      checks: {
        hosts: { scanned: hosts.scanned, violations: hosts.violations },
        secrets: { scanned: secrets.scanned, violations: secrets.violations },
        widget: { notes: widget.notes, violations: widget.violations },
        deps: { runtimeDeps: deps.count, violations: deps.violations },
        resources: {
          imports: resources.imports,
          packages: resources.packages,
          violations: resources.violations,
        },
      },
      exemptions: EXEMPTIONS,
      totalViolations: allViolations.length,
    };
    console.log(JSON.stringify(report, null, 2));
    process.exit(ok ? 0 : 1);
  }

  const line = (label, text) => console.log(`  ${label.padEnd(11)} ${text}`);
  console.log(`verify-rewrite: ${ok ? 'PASS' : 'FAIL'}`);
  line('[hosts]', `${hosts.violations.length} violation(s); ${hosts.scanned} file(s) scanned; sanctioned hosts: ${NOOP_HOSTS.join(', ')}`);
  line('[secrets]', `${secrets.violations.length} violation(s); ${secrets.scanned} file(s) scanned`);
  line('[widget]', `frozen-capture allowlist; ${widget.violations.length} violation(s)`);
  for (const n of widget.notes) line('', `- ${n}`);
  line('[deps]', `${deps.violations.length} violation(s); ${deps.count} runtime dep(s) exact-pinned`);
  line('[resources]', `${resources.violations.length} violation(s); ${resources.imports} import(s), ${resources.packages} package ref(s)`);
  if (!ok) {
    console.error('\nverify-rewrite: violations:');
    for (const v of allViolations) console.error(`  - ${v.file}: ${v.detail}`);
    process.exit(1);
  }
  console.log('verify-rewrite: PASS (0 violations)');
}

main();
