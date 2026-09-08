/** Run the existing isolated component regressions against an owned Vite server.
 * Both browser scripts deny non-local requests and replace backend services.
 * Mock Vite credentials provide a second safeguard against loading real config.
 */
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { chromium } from "@playwright/test";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const vitePath = fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url));
const origin = "http://127.0.0.1:4177";
const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
const environment = {
  ...process.env,
  VITE_BASE_PATH: "/",
  VITE_SUPABASE_URL: "https://test-project.supabase.co",
  VITE_SUPABASE_ANON_KEY: "public-test-anon-key",
  CHROME_PATH: chromePath,
  HOME_EDITOR_TEST_URL: origin,
  ROOMS_TEST_URL: origin,
};
// The CI entrypoint always exercises the full room matrix. Focused local runs
// remain available through the original browser script.
delete environment.ROOMS_TEST_FIXTURES;

const children = new Set();
let interruptedSignal;
const interrupt = () => handleSignal("SIGINT");
const terminate = () => handleSignal("SIGTERM");

function start(args, pipeOutput = false) {
  const child = spawn(process.execPath, args, {
    cwd: repository,
    env: environment,
    stdio: pipeOutput ? ["ignore", "pipe", "pipe"] : "inherit",
    detached: process.platform !== "win32",
  });
  children.add(child);
  // Always resolve: a startup failure must not become an unhandled rejection
  // while the readiness check is observing this same process.
  child.completion = new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  return child;
}

function signalChild(child, signal) {
  if (!child.pid) return;
  try {
    // Signal only this runner's process group, including a browser that may
    // remain alive if a component regression is interrupted unexpectedly.
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

async function stop(child) {
  if (child.exitCode === null && child.signalCode === null) {
    signalChild(child, "SIGTERM");
    const finished = await Promise.race([child.completion.then(() => true), pause(3000, undefined, { ref: false }).then(() => false)]);
    if (!finished) {
      signalChild(child, "SIGKILL");
      await child.completion;
    }
  }
  children.delete(child);
}

function handleSignal(signal) {
  interruptedSignal = signal;
  for (const child of children) signalChild(child, "SIGTERM");
}

async function waitForVite(vite, hasAnnouncedReady) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (interruptedSignal) throw new Error(`Interrupted by ${interruptedSignal}`);
    if (vite.exitCode !== null || vite.signalCode !== null || !vite.pid) {
      const result = await vite.completion;
      throw result.error ?? new Error(`Vite failed to start on strict port 4177 (exit ${result.code ?? result.signal}).`);
    }
    // Do not mistake an unrelated server already occupying 4177 for ours.
    if (hasAnnouncedReady()) {
      try {
        const response = await fetch(`${origin}/@vite/client`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return;
      } catch { /* Vite has announced its URL but may still be warming up. */ }
    }
    await pause(100);
  }
  throw new Error("Owned Vite server did not become ready within 30 seconds.");
}

async function runRegression(relativePath) {
  if (interruptedSignal) throw new Error(`Interrupted by ${interruptedSignal}`);
  console.log(`\nComponent regression: ${relativePath}`);
  const started = performance.now();
  const child = start([relativePath]);
  const timeout = setTimeout(() => signalChild(child, "SIGTERM"), 6 * 60_000);
  try {
    const result = await child.completion;
    if (result.error) throw result.error;
    if (result.code !== 0) throw new Error(`${relativePath} failed (exit ${result.code ?? result.signal}).`);
    console.log(`Completed ${relativePath} in ${((performance.now() - started) / 1000).toFixed(1)}s`);
  } finally {
    clearTimeout(timeout);
    await stop(child);
  }
}

async function main() {
  await access(chromePath, constants.X_OK).catch(() => {
    throw new Error(`Chromium is unavailable at ${chromePath}. Run npx playwright install chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.`);
  });
  const started = performance.now();
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  const vite = start([vitePath, "--host", "127.0.0.1", "--port", "4177", "--strictPort"], true);
  let output = "";
  vite.stdout.on("data", (data) => { output = `${output}${data}`.slice(-8000); process.stdout.write(data); });
  vite.stderr.on("data", (data) => process.stderr.write(data));
  try {
    await waitForVite(vite, () => output.includes(`${origin}/`));
    await runRegression("tests/browser/home-editor.mjs");
    await runRegression("tests/browser/artwork-rooms.mjs");
    console.log(`\nPASS component regressions in ${((performance.now() - started) / 1000).toFixed(1)}s`);
  } finally {
    await Promise.all([...children].map(stop));
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = interruptedSignal === "SIGINT" ? 130 : interruptedSignal === "SIGTERM" ? 143 : 1;
}
