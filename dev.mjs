#!/usr/bin/env node
/**
 * dev.mjs — start the whole stack with one command:  pnpm dev
 * Runs the mock backend, the widget host and the control panel together,
 * prefixes their output, and shuts them all down on Ctrl+C.
 */
import { spawn } from "node:child_process";

const TASKS = [
  { name: "mock", color: "\x1b[36m", cmd: "pnpm", args: ["--dir", "mock-server", "dev"] },
  { name: "widget", color: "\x1b[32m", cmd: "node", args: ["widget-server.mjs"] },
  { name: "panel", color: "\x1b[35m", cmd: "pnpm", args: ["--dir", "panel", "dev"] },
];

const children = [];

function prefix(name, color) {
  const tag = `${color}[${name}]\x1b[0m `;
  return (chunk) => process.stdout.write(tag + String(chunk).replace(/\n(?=.)/g, `\n${tag}`));
}

for (const t of TASKS) {
  const child = spawn(t.cmd, t.args, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
  const out = prefix(t.name, t.color);
  child.stdout.on("data", out);
  child.stderr.on("data", out);
  child.on("exit", (code) => console.log(`${t.color}[${t.name}]\x1b[0m exited (${code})`));
  children.push(child);
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    try {
      if (process.platform === "win32" && c.pid) spawn("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
      else c.kill();
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(0), 300);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", shutdown);

console.log("\x1b[1mAmuse dev\x1b[0m — mock :8787 · widget :5199 · panel :5174 · realtime ws :6001");
console.log("Press Ctrl+C to stop.\n");
