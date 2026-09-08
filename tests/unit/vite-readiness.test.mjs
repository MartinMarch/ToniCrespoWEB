import assert from "node:assert/strict";
import test from "node:test";
import { hasAnnouncedViteOrigin } from "../helpers/vite-readiness.mjs";

const origin = "http://127.0.0.1:4177";

test("Vite readiness recognizes plain and ANSI-colored CI output", () => {
  assert.equal(hasAnnouncedViteOrigin(`Local: ${origin}/\n`, origin), true);
  const colored = "\u001b[32m➜\u001b[39m \u001b[1mLocal\u001b[22m: \u001b[36mhttp://127.0.0.1:\u001b[1m4177\u001b[22m/\u001b[39m\n";
  assert.equal(hasAnnouncedViteOrigin(colored, origin), true);
});

test("Vite readiness never accepts another port, a startup message or partial URL", () => {
  for (const output of ["VITE ready in 126ms", "http://127.0.0.1:4178/", "http://127.0.0.1:41777/", origin, ""]) {
    assert.equal(hasAnnouncedViteOrigin(output, origin), false, output);
  }
});
