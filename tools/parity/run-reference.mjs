#!/usr/bin/env node
/**
 * tools/parity/run-reference.mjs
 *
 * Starts the ORIGINAL reference stack used by the parity harness:
 *
 *   mock-server   :8787  (+ realtime pusher-compatible ws :6001, same process)
 *   widget-server :5199  (serves widget/overlay.html at /widget/amuse/...)
 *
 * It only launches the existing scripts — it never edits widget-server.mjs or
 * mock-server, and never touches their routes/contract.
 *
 * Robust + idempotent: the three ports are freed before starting, so a previous
 * (or crashed) run can't leave a stale listener behind.
 *
 * Usage:
 *   node tools/parity/run-reference.mjs            # start and stay alive
 *   node tools/parity/run-reference.mjs --check    # start, assert :5199 200, exit
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { freePorts, killAll, spawnTask, status, waitForHttp } from './procs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

export const REFERENCE_PORTS = { mock: 8787, widget: 5199, realtime: 6001 };

/**
 * Start the original reference stack. Returns:
 *   { ports, tasks, ready: Promise<void>, stop(): Promise<void>, freed }
 */
export function startReference(overrides = {}) {
  const ports = {
    mock: overrides.mockPort ?? REFERENCE_PORTS.mock,
    widget: overrides.widgetPort ?? REFERENCE_PORTS.widget,
    realtime: overrides.realtimePort ?? REFERENCE_PORTS.realtime,
  };

  const freed = freePorts([ports.mock, ports.widget, ports.realtime]);

  const mock = spawnTask('mock', 'pnpm', ['--dir', 'mock-server', 'dev'], {
    cwd: ROOT,
    env: { PORT: String(ports.mock), REALTIME_PORT: String(ports.realtime) },
  });
  const widget = spawnTask('widget', 'node', ['widget-server.mjs'], {
    cwd: ROOT,
    env: { WIDGET_PORT: String(ports.widget), MOCK_PORT: String(ports.mock) },
  });

  const tasks = [mock, widget];
  const ready = Promise.all([
    waitForHttp(`http://localhost:${ports.mock}/`),
    waitForHttp(`http://localhost:${ports.widget}/widget/amuse/local`),
  ]).then(() => undefined);

  return { ports, tasks, ready, freed, stop: () => killAll(tasks) };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const check = process.argv.includes('--check');
  const ref = startReference();
  let code = 0;
  const shutdown = async () => {
    await ref.stop();
    process.exit(code);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    console.log(
      `[run-reference] original reference: mock :${ref.ports.mock} · widget :${ref.ports.widget} · realtime ws :${ref.ports.realtime}`,
    );
    if (Object.keys(ref.freed).length) console.log(`[run-reference] freed ports: ${JSON.stringify(ref.freed)}`);
    await ref.ready;
    console.log('[run-reference] reference ready');

    const probe = await status(`http://localhost:${ref.ports.widget}/widget/amuse/local`);
    console.log(`[run-reference] GET /widget/amuse/local -> ${probe.status}`);
    if (probe.status !== 200) code = 1;

    if (check) {
      console.log(code === 0 ? '[run-reference] CHECK PASS' : '[run-reference] CHECK FAIL');
      await shutdown();
    } else {
      console.log('[run-reference] running — press Ctrl+C to stop');
    }
  } catch (err) {
    console.error(`[run-reference] ERROR ${err.message}`);
    code = 1;
    await shutdown();
  }
}
