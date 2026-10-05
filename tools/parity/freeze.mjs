#!/usr/bin/env node
/**
 * tools/parity/freeze.mjs — freeze the parity REFERENCE set by sha256.
 *
 * The parity verdict (compare / behavior / report-check / verify-rewrite) is only
 * meaningful if the REFERENCE it measures against is itself immutable. Without a
 * freeze, a later "fix" could tweak a fixture, a comparator, a threshold, or the
 * recorded request baseline until the gate passes — the classic "adjust the test
 * until it goes green" failure. This tool pins the entire reference harness to a
 * committed sha256 manifest so any such tamper is caught on the next run.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS FROZEN (the reference set)
 * ─────────────────────────────────────────────────────────────────────────────
 *   · widget/**                       — frozen capture of the original bundle
 *   · widget-server.mjs               — original reference server
 *   · mock-server/**                  — deterministic backend the fixtures replay
 *   · tools/parity/**                 — the harness: fixtures, compare, behavior,
 *                                       report-check, acceptance, thresholds.json,
 *                                       and freeze.mjs itself
 *   · tools/parity/baseline/**        — the recorded HAR/request baseline, a
 *                                       FIRST-CLASS frozen artifact (its sha256 is
 *                                       listed and verified like any other file)
 *   · tools/verify-rewrite.mjs        — the static rewrite verifier
 *   · tools/beautify-reference.mjs    — reference-beautify generator
 *   · tools/sync-assets.mjs           — asset sync generator
 *   · dev.mjs                         — the local dev orchestrator
 *
 * The manifest (`tools/parity/freeze.json`) is NOT hashed (it is the manifest);
 * every other file in the set is.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *   node tools/parity/freeze.mjs            # verify if a manifest exists, else write
 *   node tools/parity/freeze.mjs --check    # verify (non-zero exit on ANY drift)
 *   node tools/parity/freeze.mjs --write    # (re)generate the manifest
 *   node tools/parity/freeze.mjs --json     # machine-readable result
 *
 * Exit codes: 0 = ok · 1 = drift detected · 2 = usage/IO error.
 *
 * Drift is reported for: changed sha256, deleted (recorded but missing), and added
 * (present but not recorded) files under the frozen paths. Enumeration uses
 * `git ls-files --cached` (the committed reference surface; node_modules/dist are
 * never tracked) plus the freezer script itself.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
/**
 * Manifest location. Defaults to `tools/parity/freeze.json`; `FREEZE_MANIFEST`
 * overrides it (used to exercise drift detection against a tampered copy without
 * touching the committed manifest or any frozen file).
 */
const MANIFEST_PATH = process.env.FREEZE_MANIFEST
  ? resolve(process.env.FREEZE_MANIFEST)
  : join(HERE, 'freeze.json');

/**
 * The frozen reference pathspecs (git pathspecs, relative to the repo root).
 * `tools/parity` covers the harness + `thresholds.json` + `baseline/**` +
 * `freeze.mjs`; the explicit entries are the harness-adjacent reference files.
 */
const REFERENCE_PATHS = [
  'widget',
  'widget-server.mjs',
  'mock-server',
  'tools/parity',
  'tools/verify-rewrite.mjs',
  'tools/beautify-reference.mjs',
  'tools/sync-assets.mjs',
  'dev.mjs',
];

/** The freezer script is part of the reference set; always include it. */
const SELF_PATH = 'tools/parity/freeze.mjs';

/** The manifest itself is never hashed (self-reference would be unstable). */
const MANIFEST_REL = 'tools/parity/freeze.json';

/**
 * First-class frozen artifacts called out explicitly in the manifest so a reader
 * (and the acceptance doc) can see the recorded request baseline is pinned.
 */
const FIRST_CLASS_ARTIFACTS = [
  'tools/parity/baseline/original-baseline.json',
  'tools/parity/thresholds.json',
  'tools/parity/freeze.mjs',
  'tools/parity/compare.mjs',
  'tools/parity/behavior.mjs',
  'tools/parity/report-check.mjs',
  'tools/parity/fixtures.mjs',
];

function sha256(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

/** Enumerate the frozen file set (repo-relative, forward slashes, sorted). */
function enumerate() {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--', ...REFERENCE_PATHS],
    { cwd: ROOT, encoding: 'utf8' },
  );
  const files = out
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\\/g, '/'))
    .filter(Boolean)
    .filter((f) => f !== MANIFEST_REL);
  if (!files.includes(SELF_PATH)) files.push(SELF_PATH);
  return [...new Set(files)].sort();
}

/** Build the manifest object from the current working tree. */
function buildManifest() {
  const files = enumerate();
  const hashes = {};
  for (const f of files) {
    const abs = join(ROOT, f);
    if (!existsSync(abs)) throw new Error(`frozen file missing on disk: ${f}`);
    hashes[f] = sha256(abs);
  }
  const aggregate = aggregateOf(hashes);
  return {
    generatedAt: new Date().toISOString(),
    algorithm: 'sha256',
    hashStyle: 'raw file bytes (utf8/二进制均为原始字节)',
    enumeratedBy: 'git ls-files --cached -- <reference paths> (+ freeze.mjs)',
    referencePaths: REFERENCE_PATHS,
    firstClassArtifacts: FIRST_CLASS_ARTIFACTS,
    fileCount: files.length,
    aggregate,
    files: hashes,
  };
}

/** Aggregate hash over the sorted `<hash>  <path>` lines (stable, order-independent). */
function aggregateOf(files) {
  const lines = Object.keys(files)
    .sort()
    .map((p) => `${files[p]}  ${p}\n`)
    .join('');
  return createHash('sha256').update(lines).digest('hex');
}

/** Compare the current tree against a recorded manifest. */
function diffAgainst(manifest) {
  const current = buildManifest();
  const recorded = manifest.files ?? {};
  const now = current.files;
  const changed = [];
  const deleted = [];
  const added = [];
  for (const [path, hash] of Object.entries(recorded)) {
    if (!(path in now)) deleted.push(path);
    else if (now[path] !== hash) changed.push({ path, recorded: hash, current: now[path] });
  }
  for (const path of Object.keys(now)) {
    if (!(path in recorded)) added.push(path);
  }
  const drift = changed.length + deleted.length + added.length > 0;
  return {
    drift,
    changed,
    deleted,
    added,
    recordedAggregate: manifest.aggregate ?? null,
    currentAggregate: current.aggregate,
    recordedCount: Object.keys(recorded).length,
    currentCount: current.fileCount,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);
  const json = has('--json');
  const wantWrite = has('--write');
  const wantCheck = has('--check');

  const manifestExists = existsSync(MANIFEST_PATH);

  if (wantWrite) {
    const manifest = buildManifest();
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
    if (json) {
      console.log(JSON.stringify({ mode: 'write', ok: true, manifest: MANIFEST_PATH, fileCount: manifest.fileCount, aggregate: manifest.aggregate }, null, 2));
    } else {
      console.log('[freeze] wrote manifest');
      console.log(`  path:      ${MANIFEST_PATH}`);
      console.log(`  files:     ${manifest.fileCount}`);
      console.log(`  aggregate: ${manifest.aggregate}`);
    }
    process.exitCode = 0;
    return;
  }

  // --check (explicit) or default: verify when a manifest exists.
  if (wantCheck || manifestExists) {
    if (!manifestExists) {
      console.error(`[freeze] no manifest at ${MANIFEST_PATH}; run: node tools/parity/freeze.mjs --write`);
      process.exitCode = 2;
      return;
    }
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const d = diffAgainst(manifest);
    if (json) {
      console.log(JSON.stringify({ mode: 'check', ok: !d.drift, manifest: MANIFEST_PATH, ...d }, null, 2));
    } else {
      console.log('[freeze] reference integrity check');
      console.log(`  manifest:   ${MANIFEST_PATH}`);
      console.log(`  files:      recorded ${d.recordedCount} · current ${d.currentCount}`);
      console.log(`  aggregate:  recorded ${d.recordedAggregate ?? 'n/a'} · current ${d.currentAggregate}`);
      if (!d.drift) {
        console.log('[freeze] PASS — every recorded sha256 matches; no added/deleted reference files.');
      } else {
        console.error(`[freeze] DRIFT DETECTED — ${d.changed.length} changed · ${d.deleted.length} deleted · ${d.added.length} added`);
        for (const c of d.changed) console.error(`  changed: ${c.path}\n    recorded ${c.recorded}\n    current  ${c.current}`);
        for (const p of d.deleted) console.error(`  deleted: ${p}`);
        for (const p of d.added) console.error(`  added:   ${p}`);
      }
    }
    process.exitCode = d.drift ? 1 : 0;
    return;
  }

  // No manifest and neither flag: write it (first run convenience).
  const manifest = buildManifest();
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log('[freeze] no manifest found — wrote initial manifest');
  console.log(`  path:      ${MANIFEST_PATH}`);
  console.log(`  files:     ${manifest.fileCount}`);
  console.log(`  aggregate: ${manifest.aggregate}`);
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(`[freeze] ERROR ${err?.stack ?? err}`);
  process.exitCode = 2;
}
