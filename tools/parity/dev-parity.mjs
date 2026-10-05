#!/usr/bin/env node
/**
 * tools/parity/dev-parity.mjs
 *
 * One command that starts BOTH hosts side by side for parity work:
 *
 *   rewrite  :5200  `pnpm --dir app preview` (built SPA, /api -> :8787)
 *   original :5199  widget-server.mjs       (from run-reference.mjs)
 *   mock     :8787  mock-server             (+ realtime ws :6001)
 *
 * Usage:
 *   node tools/parity/dev-parity.mjs            # start both and stay alive
 *   node tools/parity/dev-parity.mjs --check    # bounded: assert both 200 +
 *                                               # host injection, then kill all
 *
 * The rewrite is served from app/dist, so run `pnpm --dir app build` first.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkInjection } from '../check-host-injection.mjs';
import { freePorts, killAll, spawnTask, status, waitForHttp } from './procs.mjs';
import { startReference } from './run-reference.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const REWRITE_PORT = 5200;

/** Start the rewrite (vite preview) + original reference. */
export function startParity() {
  const freedRewrite = freePorts([REWRITE_PORT]);
  const ref = startReference();
  const rewrite = spawnTask('rewrite', 'pnpm', ['--dir', 'app', 'preview'], { cwd: ROOT });
  const tasks = [...ref.tasks, rewrite];
  const ready = Promise.all([
    ref.ready,
    waitForHttp(`http://localhost:${REWRITE_PORT}/widget/amuse/local`),
  ]).then(() => undefined);
  return { ref, rewrite, tasks, ready, freedRewrite, stop: () => killAll(tasks) };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const check = process.argv.includes('--check');
  let code = 0;

  if (check && !existsSync(join(ROOT, 'app', 'dist', 'index.html'))) {
    console.error('[dev-parity] app/dist/index.html missing — run: pnpm --dir app build');
    process.exit(1);
  }

  const parity = startParity();
  const shutdown = async () => {
    await parity.stop();
    process.exit(code);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    console.log(
      `[dev-parity] rewrite :${REWRITE_PORT} (vite preview) + original :${parity.ref.ports.widget} (widget-server) + mock :${parity.ref.ports.mock}`,
    );
    if (Object.keys(parity.freedRewrite).length)
      console.log(`[dev-parity] freed rewrite ports: ${JSON.stringify(parity.freedRewrite)}`);
    await parity.ready;
    console.log('[dev-parity] both hosts ready');

    const targets = [
      ['rewrite ', `http://localhost:${REWRITE_PORT}/widget/amuse/local`],
      ['original', `http://localhost:${parity.ref.ports.widget}/widget/amuse/local`],
    ];
    for (const [label, url] of targets) {
      const probe = await status(url);
      console.log(`[dev-parity] GET [${label}] ${url} -> ${probe.status}`);
      if (probe.status !== 200) code = 1;
    }

    // /api/* must be proxied from the rewrite (:5200) to the mock backend (:8787).
    const apiUrl = `http://localhost:${REWRITE_PORT}/api/health`;
    const apiProbe = await status(apiUrl);
    console.log(`[dev-parity] GET [rewrite ] ${apiUrl} -> ${apiProbe.status} (proxy :${parity.ref.ports.mock})`);
    if (apiProbe.status !== 200) code = 1;

    // The rewrite host HTML must carry the SSE live-refresh injection.
    for (const file of [join(ROOT, 'app', 'dist', 'index.html'), join(ROOT, 'app', 'index.html')]) {
      const result = checkInjection(file);
      console.log(`[dev-parity] injection ${result.ok ? 'PASS' : 'FAIL'} ${file}`);
      if (!result.ok) {
        code = 1;
        if (result.reason) console.log(`  ${result.reason}`);
        for (const marker of result.missing) console.log(`  missing: ${marker}`);
      }
    }

    if (check) {
      console.log(code === 0 ? '[dev-parity] CHECK PASS' : '[dev-parity] CHECK FAIL');
      await shutdown();
    } else {
      console.log('[dev-parity] running — press Ctrl+C to stop');
    }
  } catch (err) {
    console.error(`[dev-parity] ERROR ${err.message}`);
    code = 1;
    await shutdown();
  }
}
