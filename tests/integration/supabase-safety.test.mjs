import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const guardedEnvironment = {
  ...process.env,
  SUPABASE_TEST_RUN: "false",
  SUPABASE_TEST_URL: "",
  SUPABASE_TEST_ANON_KEY: "",
  SUPABASE_TEST_SERVICE_ROLE_KEY: "",
  SUPABASE_TEST_SECRET_KEY: "",
  VITE_SUPABASE_URL: "https://production.example.invalid",
  VITE_SUPABASE_ANON_KEY: "must-not-be-used",
  SUPABASE_SERVICE_ROLE_KEY: "must-not-be-used",
  SUPABASE_SECRET_KEY: "must-not-be-used",
  SUPABASE_SERVICE_KEY: "must-not-be-used",
  SERVICE_ROLE_KEY: "must-not-be-used",
};

function expectPreflightFailure({ args = [], env = {}, message, wrapper = false }) {
  const url = new URL(wrapper ? "../../scripts/test-supabase-editing.mjs" : "./supabase-editing.mjs", import.meta.url);
  // Even a broken guard cannot make a network request from these local tests.
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    globalThis.fetch = async () => { throw new Error("UNEXPECTED_NETWORK_REQUEST"); };
    process.argv = [process.argv[0], "integration-suite", ...${JSON.stringify(args)}];
    await import(${JSON.stringify(url.href)});
  `], { cwd: root, env: { ...guardedEnvironment, ...env }, encoding: "utf8", timeout: 10_000 });
  assert.equal(result.signal, null, "Preflight guard timed out.");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, message);
  assert.doesNotMatch(result.stdout + result.stderr, /UNEXPECTED_NETWORK_REQUEST/);
  assert.doesNotMatch(result.stdout, /Test run:/, "The suite started before rejecting unsafe configuration.");
}

test("remote writes require explicit --run opt-in", () => {
  expectPreflightFailure({ message: /Esta prueba crea datos temporales/ });
});

test("production credentials are never used as fallback test credentials", () => {
  expectPreflightFailure({ args: ["--run"], message: /Faltan claves de prueba/ });
});

test("known production project requires an additional explicit override", () => {
  expectPreflightFailure({
    args: ["--run"],
    env: {
      SUPABASE_TEST_URL: "https://aqleunaqzixdatttvqby.supabase.co",
      SUPABASE_TEST_ANON_KEY: "test-anon",
      SUPABASE_TEST_SERVICE_ROLE_KEY: "test-service",
    },
    message: /destino coincide con producción/,
  });
});

test("configured production host is protected even when different from the known project", () => {
  expectPreflightFailure({
    args: ["--run"],
    env: {
      SUPABASE_TEST_URL: "https://production.example.invalid",
      SUPABASE_TEST_ANON_KEY: "test-anon",
      SUPABASE_TEST_SERVICE_ROLE_KEY: "test-service",
    },
    message: /destino coincide con producción/,
  });
});

test("legacy script preserves all integration safety checks", () => {
  expectPreflightFailure({ args: ["--run"], wrapper: true, message: /Faltan claves de prueba/ });
});
