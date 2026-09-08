import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../../", import.meta.url));
const command = process.argv[2];
const project = "tonicrespo-tests";

// Keep the CLI's generated credentials out of console output and CI artifacts.
async function cli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--no-install", "supabase", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve(output)
      : reject(new Error(`Supabase CLI ${args[0]} failed (exit ${code}). Inspect the local ${project} Docker containers; credential output has been withheld.`)));
  });
}

if (command === "start") {
  console.log(`Starting isolated ${project} with repository migrations (Docker required).`);
  await cli(["start", "--exclude", "realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"]);
  console.log("Local Supabase ready at http://127.0.0.1:55321. Generated keys were not printed.");
} else if (command === "stop") {
  await cli(["stop", "--project-id", project, "--no-backup"]);
  console.log(`Removed only the temporary ${project} containers and test volumes.`);
} else if (command === "test") {
  const status = JSON.parse(await cli(["status", "--output", "json"]));
  const url = new URL(status.API_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.port !== "55321") {
    throw new Error("Refusing to use a non-local or unexpected Supabase target.");
  }
  if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error("Local Supabase did not provide test credentials.");
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["tests/integration/supabase-editing.mjs", "--run"], {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        SUPABASE_TEST_URL: url.origin,
        SUPABASE_TEST_ANON_KEY: status.ANON_KEY,
        SUPABASE_TEST_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      },
    });
    child.on("error", reject);
    child.on("close", resolve);
  });
  process.exitCode = code ?? 1;
} else {
  throw new Error("Use start, test or stop. All operations target only the isolated tonicrespo-tests project.");
}
