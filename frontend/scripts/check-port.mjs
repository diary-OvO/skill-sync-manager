// Pre-dev port guard.
//
// Bind-test 127.0.0.1:5173. If it's already held, print a clear message and
// exit 1 so `wails dev` / `npm run dev` fails fast instead of silently
// drifting to 5174/5175 (Vite strictPort also rejects, but this runs first
// and gives a nicer message, including the PID on Windows when possible).
//
// We never kill anything — the user decides what to do with the offending
// process.

import net from "node:net";
import { execSync } from "node:child_process";
import process from "node:process";

const HOST = "127.0.0.1";
const PORT = 5173;

function findPidWindows(port) {
  try {
    const out = execSync(`netstat -ano -p tcp`, { encoding: "utf8" });
    // netstat rows look like:
    //   TCP    127.0.0.1:5173    0.0.0.0:0    LISTENING    12345
    const needle = `:${port} `;
    for (const line of out.split(/\r?\n/)) {
      if (line.includes("LISTENING") && line.includes(needle)) {
        const parts = line.trim().split(/\s+/);
        return parts[parts.length - 1];
      }
    }
  } catch {
    // netstat not available or blocked — just skip.
  }
  return null;
}

function probe(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => resolve({ ok: false, err }));
    server.once("listening", () => {
      server.close(() => resolve({ ok: true }));
    });
    // exclusive: true so EADDRINUSE surfaces instead of SO_REUSEADDR hiding it.
    server.listen({ host, port, exclusive: true });
  });
}

const { ok, err } = await probe(HOST, PORT);
if (ok) {
  process.exit(0);
}

const code = err && err.code;
if (code === "EADDRINUSE") {
  const pid = process.platform === "win32" ? findPidWindows(PORT) : null;
  console.error("");
  console.error(`\x1b[31m[skill-sync-manager] port ${HOST}:${PORT} is already in use.\x1b[0m`);
  if (pid) {
    console.error(`  Held by PID ${pid}.`);
    console.error(`  Inspect:  tasklist /fi "PID eq ${pid}"`);
    console.error(`  Stop it:  taskkill /PID ${pid} /F`);
  } else {
    console.error("  Find the owner and stop it before running `wails dev`.");
  }
  console.error(
    "  Vite is configured with strictPort — it will NOT fall back to 5174/5175.",
  );
  console.error("");
  process.exit(1);
}

console.error(`[skill-sync-manager] port probe failed: ${err ? err.message : "unknown"}`);
process.exit(1);
