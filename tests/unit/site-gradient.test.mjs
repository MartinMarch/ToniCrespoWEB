import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

async function loadTypeScript(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports, console: { warn() {} },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const settings = await loadTypeScript("../../src/types/siteSettings.ts");
const gradient = await loadTypeScript("../../src/lib/siteGradient.ts", { "../types/siteSettings": settings });
const { defaultSiteSettings } = settings;
const { isHexColor, normalizeGradientSettings, buildSiteGradient } = gradient;
const plain = value => JSON.parse(JSON.stringify(value));

async function serviceFixture(value, error = null, configured = true) {
  const requests = [];
  const supabase = configured ? {
    from(table) {
      assert.equal(table, "site_settings");
      return {
        select(columns) {
          assert.equal(columns, "value");
          return { eq(key, expected) {
            assert.equal(key, "key");
            assert.equal(expected, "global");
            return { async maybeSingle() {
              requests.push({ method: "read" });
              return { data: value === undefined ? null : { value }, error };
            } };
          } };
        },
        upsert(row, options) {
          requests.push({ method: "write", row: plain(row), options: plain(options) });
          return { select(columns) {
            assert.equal(columns, "value");
            return { async single() { return { data: { value: row.value }, error }; } };
          } };
        },
      };
    },
  } : null;
  const service = await loadTypeScript("../../src/services/siteSettingsService.ts", {
    "../lib/supabaseClient": { supabase }, "../types/siteSettings": settings, "../lib/siteGradient": gradient,
  });
  return { ...service, requests };
}

test("gradient defaults retain the existing start and end colors", () => {
  assert.deepEqual(plain(defaultSiteSettings.gradient), { startColor: "#d4d0c3", endColor: "#77756f" });
  assert.equal(buildSiteGradient(defaultSiteSettings.gradient), "linear-gradient(180deg, #d4d0c3 0%, #77756f 100%)");
});

test("only complete opaque six-digit HEX colors pass validation", () => {
  for (const color of ["#000000", "#ffffff", "#Ab19F0"]) assert.equal(isHexColor(color), true);
  for (const color of [undefined, null, 123456, {}, [], "", "#fff", "#12345678", "123456", "#gggggg", "red", "rgb(1,2,3)", "#123456\n", " #123456", "#123456;"]) {
    assert.equal(isHexColor(color), false, `must reject ${JSON.stringify(color)}`);
  }
});

test("legacy, absent or malformed settings fall back without mutating the defaults", () => {
  for (const value of [undefined, null, false, 42, "#abcdef", [], {}, { startColor: [], endColor: {} }]) {
    const actual = normalizeGradientSettings(value);
    assert.deepEqual(plain(actual), plain(defaultSiteSettings.gradient));
    actual.startColor = "#000000";
    assert.equal(defaultSiteSettings.gradient.startColor, "#d4d0c3");
  }
});

test("normalization validates each endpoint separately and canonicalizes uppercase and whitespace", () => {
  assert.deepEqual(plain(normalizeGradientSettings({ startColor: " #ABCD12 ", endColor: "#0987FE" })), {
    startColor: "#abcd12", endColor: "#0987fe",
  });
  assert.deepEqual(plain(normalizeGradientSettings({ startColor: "#112233", endColor: "invalid" })), {
    startColor: "#112233", endColor: "#77756f",
  });
  assert.deepEqual(plain(normalizeGradientSettings({ startColor: null, endColor: "#778899" })), {
    startColor: "#d4d0c3", endColor: "#778899",
  });
});

test("gradient rendering never interprets URLs, CSS variables, delimiters or injected styles", () => {
  for (const unsafe of ["url(https://example.test/image)", "var(--secret)", "#123456);background:url(https://example.test)", "#123456\n!important", "</style><script>alert(1)</script>"]) {
    const css = buildSiteGradient({ startColor: unsafe, endColor: "#AABBCC" });
    assert.equal(css, "linear-gradient(180deg, #d4d0c3 0%, #aabbcc 100%)");
  }
});

test("the settings loader keeps legacy contact and language data while adding gradient defaults", async () => {
  const legacy = { contact: { ...defaultSiteSettings.contact, email: "artist@example.test" }, defaultLanguage: "de" };
  const service = await serviceFixture(legacy);
  const result = await service.loadSiteSettings();
  assert.equal(result.defaultLanguage, "de");
  assert.equal(result.contact.email, "artist@example.test");
  assert.deepEqual(plain(result.gradient), plain(defaultSiteSettings.gradient));
  assert.deepEqual(service.requests, [{ method: "read" }]);
});

test("the settings loader returns normalized saved colors without writing during public loading", async () => {
  const service = await serviceFixture({ ...defaultSiteSettings, gradient: { startColor: "#DEF0A1", endColor: "invalid" } });
  const result = await service.loadSiteSettings();
  assert.deepEqual(plain(result.gradient), { startColor: "#def0a1", endColor: "#77756f" });
  assert.deepEqual(service.requests, [{ method: "read" }]);
});

test("missing configuration and failed reads safely render the default gradient", async () => {
  for (const fixture of [await serviceFixture(undefined), await serviceFixture(null, { message: "read failed" }), await serviceFixture(null, null, false)]) {
    assert.deepEqual(plain(await fixture.loadSiteSettings()), plain(defaultSiteSettings));
    assert.ok(fixture.requests.every(request => request.method === "read"));
  }
});

test("saving writes a single global JSON value containing gradient, contacts and default language", async () => {
  const service = await serviceFixture(null);
  const next = { ...defaultSiteSettings, defaultLanguage: "en", gradient: { startColor: "#DDEEFF", endColor: "#8899AA" } };
  const saved = await service.updateSiteSettings(next);
  assert.equal(service.requests.length, 1);
  const { row, options } = service.requests[0];
  assert.equal(row.key, "global");
  assert.deepEqual(options, { onConflict: "key" });
  assert.deepEqual(row.value.gradient, { startColor: "#ddeeff", endColor: "#8899aa" });
  assert.deepEqual(row.value.contact, plain(defaultSiteSettings.contact));
  assert.equal(row.value.defaultLanguage, "en");
  assert.ok(Number.isFinite(Date.parse(row.updated_at)));
  assert.deepEqual(plain(saved), row.value);
});

test("saving invalid or missing endpoints fails before any database call", async () => {
  for (const colors of [undefined, {}, { startColor: "#ffffff" }, { startColor: "red", endColor: "#ffffff" }, { startColor: "#123456\n", endColor: "#ffffff" }]) {
    const service = await serviceFixture(null);
    await assert.rejects(service.updateSiteSettings({ ...defaultSiteSettings, gradient: colors }), /#RRGGBB/);
    assert.deepEqual(service.requests, []);
  }
});

test("write errors propagate so the dialog can keep the draft and offer a retry", async () => {
  const failure = { message: "Permission denied", code: "42501" };
  const service = await serviceFixture(null, failure);
  await assert.rejects(service.updateSiteSettings(defaultSiteSettings), error => error === failure);
  assert.equal(service.requests.length, 1);
  const unavailable = await serviceFixture(null, null, false);
  await assert.rejects(unavailable.updateSiteSettings(defaultSiteSettings), /Supabase no está configurado/);
  assert.deepEqual(unavailable.requests, []);
});
