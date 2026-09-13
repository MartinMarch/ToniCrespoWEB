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
  runInNewContext(outputText, { exports, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

const organization = await loadTypeScript("../../src/lib/artworkOrganization.ts");
const { createOrganizationState, moveArtwork, getOrganizationChanges, buildOrganizationPayload } = organization;
const plain = (value) => JSON.parse(JSON.stringify(value));
const fixture = () => [
  { id: "canvas", supportKind: "canvas", artworks: [{ id: "a", sortOrder: 9, isPublished: true }, { id: "b", sortOrder: 3, isPublished: false }] },
  { id: "paper", supportKind: "canvas", artworks: [{ id: "c", sortOrder: 100, isPublished: true }] },
  { id: "empty", supportKind: "canvas", artworks: [] },
];

test("panel selections remain distinct after deleting either selected collection or reloading a shorter catalog", () => {
  const { chooseOrganizationPanels } = organization;
  assert.deepEqual(plain(chooseOrganizationPanels(["a", "b", "c"], { left: "", right: "" })), { left: "a", right: "b" });
  assert.deepEqual(plain(chooseOrganizationPanels(["b", "c"], { left: "c", right: "a" })), { left: "c", right: "b" });
  assert.deepEqual(plain(chooseOrganizationPanels(["b", "c"], { left: "a", right: "b" })), { left: "b", right: "c" });
  assert.deepEqual(plain(chooseOrganizationPanels(["c"], { left: "a", right: "c" })), { left: "c", right: "" });
  assert.deepEqual(plain(chooseOrganizationPanels([], { left: "a", right: "b" })), { left: "", right: "" });
  assert.deepEqual(plain(chooseOrganizationPanels(["a", "b"], { left: "b", right: "a" })), { left: "b", right: "a" });
});

test("organizer return links only accept local paths without backslashes or control characters", () => {
  const { getOrganizerReturnPath } = organization;
  for (const path of ["/", "/lienzos", "/laminas/coleccion?interes=1#obra"]) assert.equal(getOrganizerReturnPath(path), path);
  for (const value of [null, 42, {}, "", "https://example.test", "//example.test", "/\\example.test", "/\n/example.test", "/\t/lienzos", "/lienzos\u007f", "/admin/organizar-obras"]) {
    assert.equal(getOrganizerReturnPath(value), "/", `Unsafe return path: ${JSON.stringify(value)}`);
  }
});

test("organization includes empty collections and hidden works, sorted without changing source arrays", () => {
  const collections = fixture();
  const before = plain(collections);
  assert.deepEqual(plain(createOrganizationState(collections)), { canvas: ["b", "a"], paper: ["c"], empty: [] });
  assert.deepEqual(collections, before);
});

test("moving within a collection uses final indices in both directions and preserves unrelated arrays", () => {
  const state = { first: ["a", "b", "c", "d"], second: ["e"] };
  const down = moveArtwork(state, "b", "first", 3);
  assert.deepEqual(plain(down), { first: ["a", "c", "d", "b"], second: ["e"] });
  assert.equal(down.second, state.second);
  assert.deepEqual(plain(moveArtwork(down, "b", "first", 0)), { first: ["b", "a", "c", "d"], second: ["e"] });
  assert.deepEqual(state.first, ["a", "b", "c", "d"]);
});

test("moving to empty or populated collections never duplicates or loses works and clamps indices", () => {
  const state = createOrganizationState(fixture());
  const moved = moveArtwork(state, "b", "empty", 99);
  assert.deepEqual(plain(moved), { canvas: ["a"], paper: ["c"], empty: ["b"] });
  assert.deepEqual(plain(moveArtwork(moved, "b", "paper", -7)), { canvas: ["a"], paper: ["b", "c"], empty: [] });
  assert.deepEqual(plain(state), { canvas: ["b", "a"], paper: ["c"], empty: [] });
});

test("unknown works, missing targets, nonfinite indices and no-op moves keep the original state", () => {
  const state = createOrganizationState(fixture());
  for (const args of [["missing", "paper", 0], ["a", "missing", 0], ["a", "paper", Infinity], ["a", "paper", NaN], ["a", "canvas", 1]]) {
    assert.equal(moveArtwork(state, ...args), state);
  }
});

test("changes describe exact original and final positions", () => {
  const before = createOrganizationState(fixture());
  const after = moveArtwork(before, "b", "paper", 1);
  assert.deepEqual(plain(getOrganizationChanges(before, after)), [
    { artworkId: "b", fromCollectionId: "canvas", toCollectionId: "paper", fromIndex: 0, toIndex: 1 },
    { artworkId: "a", fromCollectionId: "canvas", toCollectionId: "canvas", fromIndex: 1, toIndex: 0 },
  ]);
  assert.deepEqual(plain(getOrganizationChanges(before, before)), []);
});

test("payload snapshots preserve raw sort_order and include full hidden membership only in touched collections", () => {
  const collections = fixture();
  const next = moveArtwork(createOrganizationState(collections), "a", "empty", 0);
  assert.deepEqual(plain(buildOrganizationPayload(collections, next)), {
    expected_state: [
      { id: "canvas", artworks: [{ id: "a", sort_order: 9 }, { id: "b", sort_order: 3 }] },
      { id: "empty", artworks: [] },
    ],
    next_state: [{ id: "canvas", artwork_ids: ["b"] }, { id: "empty", artwork_ids: ["a"] }],
  });
  assert.deepEqual(plain(buildOrganizationPayload(collections, createOrganizationState(collections))), { expected_state: [], next_state: [] });
});

test("payload rejects deleted, duplicated, invented works and missing/unknown collections", () => {
  const collections = fixture();
  for (const next of [
    { canvas: ["a"], paper: ["c"], empty: [] },
    { canvas: ["a", "b"], paper: ["c", "b"], empty: [] },
    { canvas: ["a", "b"], paper: ["invented"], empty: [] },
    { canvas: ["a", "b"], paper: ["c"] },
    { canvas: ["a", "b"], paper: ["c"], empty: [], unknown: [] },
    { canvas: ["a", "b"], paper: ["c"], empty: null },
  ]) assert.throws(() => buildOrganizationPayload(collections, next));
});

test("payload rejects cross-branch moves but accepts one save with independent edits in both branches", () => {
  const collections = fixture();
  collections[1].supportKind = "paper";
  const before = createOrganizationState(collections);
  assert.throws(() => buildOrganizationPayload(collections, moveArtwork(before, "a", "paper", 0)), /No se pueden mover obras entre Lienzos y Obra en papel/);
  collections.push({ id: "paper-empty", supportKind: "paper", artworks: [] });
  const bothBranches = moveArtwork(moveArtwork(createOrganizationState(collections), "a", "empty", 0), "c", "paper-empty", 0);
  const payload = buildOrganizationPayload(collections, bothBranches);
  assert.deepEqual(plain(payload.next_state.map(item => item.id)), ["canvas", "paper", "empty", "paper-empty"]);
});

async function serviceFixture(error = null, configured = true) {
  const requests = [];
  const service = await loadTypeScript("../../src/services/artworkOrganizationService.ts", {
    "../lib/artworkOrganization": organization,
    "../lib/supabaseClient": { supabase: configured ? { async rpc(name, payload) {
      requests.push({ name, payload: plain(payload) });
      return { error };
    } } : null },
  });
  return { ...service, requests };
}

test("save performs one atomic RPC and no calls for an unchanged draft", async () => {
  const service = await serviceFixture();
  const collections = fixture();
  const state = createOrganizationState(collections);
  await service.saveArtworkOrganization(collections, state);
  assert.deepEqual(service.requests, []);
  await service.saveArtworkOrganization(collections, moveArtwork(state, "a", "paper", 0));
  assert.equal(service.requests.length, 1);
  assert.equal(service.requests[0].name, "reorganize_artworks");
  assert.deepEqual(service.requests[0].payload.next_state, [
    { id: "canvas", artwork_ids: ["b"] }, { id: "paper", artwork_ids: ["a", "c"] },
  ]);
});

test("save never falls back to independent writes on failure and validates before sending", async () => {
  const failure = { code: "40001", message: "ORGANIZATION_CONFLICT" };
  const service = await serviceFixture(failure);
  const collections = fixture();
  const state = createOrganizationState(collections);
  await assert.rejects(service.saveArtworkOrganization(collections, moveArtwork(state, "a", "paper", 0)), error => error === failure);
  assert.equal(service.requests.length, 1);
  await assert.rejects(service.saveArtworkOrganization(collections, {}));
  assert.equal(service.requests.length, 1);
  const unavailable = await serviceFixture(null, false);
  await assert.rejects(unavailable.saveArtworkOrganization(collections, state), /no está configurada/);
});

test("user-facing errors distinguish conflicts, missing activation, permissions, retries and uncertain network outcomes", async () => {
  const { getArtworkOrganizationErrorMessage: message } = await serviceFixture();
  assert.match(message({ code: "40001" }), /catálogo ha cambiado/);
  assert.match(message({ code: "PGRST202" }), /20260912144544_artwork_organization.sql/);
  assert.match(message({ code: "42501" }), /cuenta administradora/);
  assert.match(message({ code: "40P01" }), /unos segundos/);
  assert.match(message({ code: "22023" }), /validar/);
  assert.match(message(new TypeError("Failed to fetch")), /confirmar el guardado/);
  assert.match(message(undefined), /borrador/);
});
