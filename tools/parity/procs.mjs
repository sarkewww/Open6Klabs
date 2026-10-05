#!/usr/bin/env node
/**
 * tools/parity/procs.mjs
 *
 * Small, dependency-free process helpers shared by the parity runners
 * (run-reference.mjs, dev-parity.mjs). Windows-first, but degrades to POSIX
 * `kill` so the same scripts work on CI runners.
 *
 * Nothing here changes the behavior/contract of widget-server.mjs or
 * mock-server — it only starts/stops/health-checks them from the outside.
 */
import { execSync, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const isWin = process.platform === 'win32';

/** PIDs currently LISTENING on `port` (Windows) — [] elsewhere. */
export function pidsOnPort(port) {
  if (!isWin) {
    try {
      const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' });
      return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
  try {
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      // e.g. "  TCP    127.0.0.1:5200    0.0.0.0:0    LISTENING    12345"
      const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
      if (m && Number(m[1]) === Number(port)) pids.add(m[2]);
    }
    return [...pids];
  } catch {
    return [];
  }
}

/** Kill any process listening on `port` (tree kill on Windows). Returns killed PIDs. */
export function freePort(port) {
  const killed = [];
  for (const pid of pidsOnPort(port)) {
    try {
      if (isWin) execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
      else process.kill(Number(pid), 'SIGKILL');
      killed.push(pid);
    } catch {
      /* already gone */
    }
  }
  return killed;
}

/** Free a list of ports, returning a { port: [pids] } report of what was reclaimed. */
export function freePorts(ports) {
  const report = {};
  for (const port of ports) {
    const killed = freePort(port);
    if (killed.length) report[port] = killed;
  }
  return report;
}

const COLORS = {
  mock: '\x1b[36m',
  widget: '\x1b[32m',
  rewrite: '\x1b[35m',
  ref: '\x1b[33m',
};

function prefixer(name, color) {
  const tag = `${color}[${name}]\x1b[0m `;
  return (chunk) => process.stdout.write(tag + String(chunk).replace(/\n(?=.)/g, `\n${tag}`));
}

/**
 * Spawn a long-lived task with prefixed output. Returns { name, child, pid }.
 * `shell: true` is required on Windows for `pnpm`/`node` shims; the child pid
 * is then the shell, which is why killTree uses `taskkill /T`.
 */
export function spawnTask(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: opts.cwd ?? process.cwd(),
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  const out = prefixer(name, COLORS[name] ?? '\x1b[37m');
  child.stdout?.on('data', out);
  child.stderr?.on('data', out);
  child.on('exit', (code) => console.log(`${COLORS[name] ?? ''}[${name}]\x1b[0m exited (${code})`));
  return { name, child, pid: child.pid };
}

/** Kill a spawned task and its whole tree. */
export function killTree(task) {
  if (!task) return;
  const pid = task.pid ?? task.child?.pid;
  if (!pid) return;
  try {
    if (isWin) spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else task.child?.kill('SIGKILL');
  } catch {
    /* ignore */
  }
}

/** Kill every task in `tasks` and wait a beat for the OS to release ports. */
export async function killAll(tasks, settleMs = 400) {
  for (const t of tasks) killTree(t);
  await sleep(settleMs);
}

/**
 * Poll `url` until it returns ANY HTTP response (connection success), or until
 * `timeoutMs`. Resolves with the Response; rejects on timeout.
 * Pass `expectStatus` to also require a specific status code.
 */
export async function waitForHttp(url, { timeoutMs = 30_000, intervalMs = 250, expectStatus } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (expectStatus === undefined || res.status === expectStatus) return res;
      lastErr = new Error(`${url} -> HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await sleep(intervalMs);
  }
  throw new Error(`waitForHttp timeout after ${timeoutMs}ms for ${url}: ${lastErr?.message ?? 'no response'}`);
}

/** GET a URL and return { status, ok } without throwing on non-2xx. */
export async function status(url) {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    return { status: res.status, ok: res.ok };
  } catch (err) {
    return { status: 0, ok: false, error: err.message };
  }
}
