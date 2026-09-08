/**
 * Browser regression for home quotation typography and the real artwork editor.
 * Run with Vite available locally: node tests/browser/home-editor.mjs
 * HOME_EDITOR_TEST_URL defaults to http://127.0.0.1:5173.
 * All service calls are mocked and all non-loopback/mutating HTTP is blocked.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import WebSocket from "ws";

const siteUrl = new URL(process.env.HOME_EDITOR_TEST_URL ?? "http://127.0.0.1:5173");
assert(["localhost", "127.0.0.1", "[::1]"].includes(siteUrl.hostname), "Use a loopback Vite URL");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const blocked = [];
const spanish = { title: "Obra de prueba", technique: "Óleo", caption: "Pie español", description: "Descripción española original." };
const translations = Object.fromEntries(["ca", "en", "de"].map((locale) => [locale, {
  title: `Title ${locale}`, technique: `Technique ${locale}`, caption: `Caption ${locale}`, description: `Description ${locale} original.`,
}]));
const artwork = { id: "offline-artwork", ...spanish, dimensions: "30 × 30 cm", translations };
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
await import('/@vite/client');
await import('/src/styles/global.css');
const [reactModule, domModule, { ArtworkEditorDialog }, { formatHomeStatementHtml }, { getEditorialPageTranslations }] = await Promise.all([
  import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'),
  import('/src/components/admin/ContentEditorDialogs.tsx'), import('/src/lib/homeStatement.ts'), import('/src/data/editorialTranslations.ts'),
]);
const React = reactModule.default ?? reactModule;
const { createRoot } = domModule.default ?? domModule;
const root = createRoot(document.getElementById('root'));
let revision = 0;
window.__editorTest = { formatHomeStatementHtml, getEditorialPageTranslations, render(language, artwork) {
  window.__testLanguage = language;
  window.__serviceCalls = [];
  window.__onSaved = 0;
  window.__onClose = 0;
  root.render(React.createElement(ArtworkEditorDialog, { key: ++revision, artwork, collectionId: 'offline-collection', collectionTitle: 'Prueba', onSaved: async () => { window.__onSaved++; }, onClose: () => { window.__onClose++; } }));
}, clear() { root.render(null); } };
</script></body></html>`;
const serviceMock = `
export async function updateArtwork(value) { window.__serviceCalls.push({ operation: 'updateArtwork', value }); }
export async function createArtwork(value) { window.__serviceCalls.push({ operation: 'createArtwork', value }); }
export function getEditableOperationErrorMessage(error) { return String(error?.message ?? error); }
export async function getImageDimensions() { return { width: 30, height: 30 }; }
export async function uploadEditableAsset() { return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; }
export async function cleanupOwnedEditableAssets() { throw new Error('Unexpected cleanup in regression'); }
export async function createCollection() { throw new Error('Unexpected collection mutation'); }
export async function createNewsItem() { throw new Error('Unexpected news mutation'); }
export async function updateCollection() { throw new Error('Unexpected collection mutation'); }
export async function updateNewsItem() { throw new Error('Unexpected news mutation'); }
export async function updatePhotographyItem() { throw new Error('Unexpected photography mutation'); }
export async function uploadEditableAssets() { throw new Error('Unexpected batch upload'); }
`;

class Page {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.errors = [];
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      if (message.id) {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        clearTimeout(entry.timer);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result);
      } else if (message.method === "Fetch.requestPaused") {
        void this.intercept(message.params).catch((error) => this.errors.push(error.message));
      } else if (message.method === "Runtime.exceptionThrown") {
        this.errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
      }
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  async waitFor(expression, label) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      assert.equal(this.errors.length, 0, this.errors.join("\n"));
      if (await this.evaluate(expression)) return;
      await pause(50);
    }
    throw new Error(`Timed out: ${label}`);
  }
  async intercept({ requestId, request, resourceType }) {
    const url = new URL(request.url);
    if (url.origin !== siteUrl.origin || !["GET", "HEAD"].includes(request.method)) {
      blocked.push({ origin: url.origin, method: request.method });
      await this.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
      return;
    }
    let body;
    if (resourceType === "Document" && url.pathname === "/__home-editor-regression__") body = html;
    if (url.pathname === "/src/services/editableContentService.ts") body = serviceMock;
    if (url.pathname === "/src/app/sitePreferences.tsx") body = "export function useSitePreferences() { return { language: window.__testLanguage ?? 'ca' }; }";
    if (body !== undefined) {
      await this.send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: resourceType === "Document" ? "text/html" : "text/javascript" }], body: Buffer.from(body).toString("base64") });
    } else await this.send("Fetch.continueRequest", { requestId });
  }
}

async function testQuotes(page) {
  const cases = [
    { name: "ASCII", html: '<h4><span style="color: #000000;" data-note="keep &quot;attribute&quot;">Dijo "una cosa" y "otra cosa".</span></h4><h4 class="author">Ray Bradbury<br><span>Fahrenheit 451</span></h4>', text: 'Dijo «una cosa» y «otra cosa».' },
    { name: "curly", html: '<h4>Dijo “una cosa” y “otra”.</h4><h4>Autor</h4>', text: 'Dijo «una cosa» y «otra».' },
    { name: "German curly", html: '<h4>Er sagte „ein Wort“ und „ein anderes“.</h4><h4>Autor</h4>', text: 'Er sagte «ein Wort» und «ein anderes».' },
    { name: "multiple spans", html: '<h4>Dijo "una <em>cosa</em><span> y otra".</span></h4><h4>Autor</h4>', text: 'Dijo «una cosa y otra».' },
    { name: "entities", html: '<h4>Dijo &quot;una &amp; otra&quot;.</h4><h4>Autor</h4>', text: 'Dijo «una & otra».' },
    { name: "angular", html: '<h4>Dijo «una cosa».</h4><h4>Autor</h4>', text: 'Dijo «una cosa».' },
  ];
  for (const fixture of cases) {
    const state = await page.evaluate(`(() => {
      const input = ${JSON.stringify(fixture.html)};
      const result = window.__editorTest.formatHomeStatementHtml(input);
      const before = new DOMParser().parseFromString(input, 'text/html');
      const after = new DOMParser().parseFromString(result, 'text/html');
      return { text: after.querySelector('h4').textContent, author: after.querySelectorAll('h4')[1].outerHTML,
        originalAuthor: before.querySelectorAll('h4')[1].outerHTML,
        attributes: [...after.querySelectorAll('h4:first-child *')].map(e => [...e.attributes].map(a => [a.name, a.value])),
        originalAttributes: [...before.querySelectorAll('h4:first-child *')].map(e => [...e.attributes].map(a => [a.name, a.value])),
        tags: [...after.querySelectorAll('h4:first-child *')].map(e => e.tagName),
        originalTags: [...before.querySelectorAll('h4:first-child *')].map(e => e.tagName),
        idempotent: window.__editorTest.formatHomeStatementHtml(result) === result };
    })()`);
    assert.equal(state.text, fixture.text, fixture.name);
    assert.equal(state.author, state.originalAuthor, `${fixture.name}: preserve author`);
    assert.deepEqual(state.attributes, state.originalAttributes, `${fixture.name}: preserve attributes`);
    assert.deepEqual(state.tags, state.originalTags, `${fixture.name}: preserve markup`);
    assert(state.idempotent, `${fixture.name}: idempotent`);
  }
  for (const locale of ["en", "de", "ca"]) {
    const state = await page.evaluate(`(() => {
      const input = window.__editorTest.getEditorialPageTranslations('home')[${JSON.stringify(locale)}].html;
      const output = window.__editorTest.formatHomeStatementHtml(input);
      const before = new DOMParser().parseFromString(input, 'text/html');
      const after = new DOMParser().parseFromString(output, 'text/html');
      const text = after.querySelector('h4').textContent;
      return { opens: (text.match(/«/g) ?? []).length, closes: (text.match(/»/g) ?? []).length,
        straight: text.includes('"'), authorPreserved: before.querySelectorAll('h4')[1].outerHTML === after.querySelectorAll('h4')[1].outerHTML,
        idempotent: window.__editorTest.formatHomeStatementHtml(output) === output };
    })()`);
    assert.equal(state.opens, 2, `${locale}: two inner citations`);
    assert.equal(state.closes, 2, `${locale}: two closed inner citations`);
    assert(!state.straight && state.authorPreserved && state.idempotent, `${locale}: preserve and normalize`);
  }
  await page.evaluate(`document.body.insertAdjacentHTML('beforeend', '<section class="page-section narrow home-statement-section"><div class="wp-content"><h4><span>Dijo «una cosa» y «otra cosa».</span></h4><h4>Ray Bradbury<br>Fahrenheit 451</h4></div></section>')`);
  for (const width of [1440, 390, 320]) {
    await page.send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
    const state = await page.evaluate(`(() => {
      const section = document.querySelector('.home-statement-section');
      const heading = section.querySelector('h4');
      const rect = heading.getBoundingClientRect();
      return { before: getComputedStyle(heading, '::before').content, after: getComputedStyle(heading, '::after').content,
        fontStyle: getComputedStyle(heading.querySelector('span')).fontStyle,
        left: rect.left, right: innerWidth - rect.right, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    })()`);
    assert.equal(state.before, '"\\\""', `${width}: ASCII outer opening quote`);
    assert.equal(state.after, '"\\\""', `${width}: ASCII outer closing quote`);
    assert(/italic|oblique/.test(state.fontStyle), `${width}: quotation remains italic`);
    assert(!state.overflow, `${width}: no horizontal overflow`);
    if (width < 500) assert(state.left >= 29 && state.right >= 29, `${width}: generous mobile quotation margins`);
  }
  await page.evaluate("document.querySelector('.home-statement-section').remove()");
  console.log("PASS home: six DOM edge cases, EN/DE/CA content, ASCII outer quotes, italic and mobile margins at 1440/390/320");
}

async function renderEditor(page, language, input) {
  await page.evaluate(`window.__editorTest.render(${JSON.stringify(language)}, ${JSON.stringify(input)})`);
  const expected = input ? language : "es";
  await page.waitFor(`document.querySelector('[role="tab"][aria-selected="true"] span')?.textContent === ${JSON.stringify(expected.toUpperCase())}`, `${language} initial tab`);
}

async function testEditor(page) {
  for (const language of ["ca", "es", "en", "de"]) {
    await renderEditor(page, language, artwork);
    const original = language === "es" ? spanish.description : translations[language].description;
    assert.equal(await page.evaluate("document.querySelector('textarea').value"), original, `${language}: current description`);
    const updated = `Descripción revisada ${language}.\n\nObra no disponible.\nUna línea adicional.`;
    await page.evaluate(`(() => {
      const field = document.querySelector('textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, ${JSON.stringify(updated)});
      field.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await pause(50);
    await page.evaluate("document.querySelector('form').requestSubmit()");
    await page.waitFor("window.__onSaved === 1 && window.__onClose === 1", `${language}: save and close callbacks`);
    const calls = await page.evaluate("window.__serviceCalls");
    assert.equal(calls.length, 1, `${language}: one local service call`);
    assert.equal(calls[0].operation, "updateArtwork");
    const expectedTranslations = structuredClone(translations);
    if (language !== "es") expectedTranslations[language].description = updated;
    assert.deepEqual(calls[0].value.translations, expectedTranslations, `${language}: preserve other translations and paragraph breaks`);
    assert.equal(calls[0].value.description, language === "es" ? updated : spanish.description, `${language}: base Spanish preserved`);
    assert.equal(calls[0].value.title, spanish.title, `${language}: title unchanged`);
  }
  // Creation starts in the mandatory source language even when browsing Catalan.
  await renderEditor(page, "ca", undefined);
  assert.equal(await page.evaluate("document.querySelector('textarea').value"), "", "new artwork: empty source description");
  await page.evaluate("document.querySelector('form').requestSubmit()");
  assert.equal((await page.evaluate("window.__serviceCalls")).length, 0, "incomplete creation cannot call service");
  console.log("PASS editor: correct initial locale, multiline descriptions saved through the real form, other translations preserved, callbacks, new artwork starts in ES");
}

async function main() {
  assert((await fetch(new URL('/@vite/client', siteUrl))).ok, "Start Vite first");
  const profile = await mkdtemp(join(tmpdir(), "toni-home-editor-chrome-"));
  const chrome = spawn(process.env.CHROME_PATH ?? "/usr/bin/google-chrome", ["--headless=new", "--no-first-run", "--disable-gpu", "--disable-dev-shm-usage", "--disable-background-networking", "--disable-component-update", "--remote-allow-origins=*", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let page;
  try {
    let port;
    for (let i = 0; i < 150; i++) {
      try { port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); break; } catch { await pause(100); }
    }
    assert(port, "Chrome debugging port unavailable");
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await once(socket, "open");
    page = new Page(socket);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    await page.send("Network.enable");
    await page.send("Network.setBlockedURLs", { urls: ["*://*.supabase.co/*", "*://*.supabase.com/*"] });
    await page.send("Page.navigate", { url: new URL('/__home-editor-regression__', siteUrl).href });
    await page.waitFor("Boolean(window.__editorTest)", "isolated real modules");
    await testQuotes(page);
    await testEditor(page);
    assert.equal(page.errors.length, 0, page.errors.join("\n"));
    assert(!blocked.some(request => request.method !== "GET" && request.method !== "HEAD"), "No attempted external writes");
    console.log(`PASS: browser regression complete; services mocked; ${blocked.length} external read requests blocked before sending.`);
  } finally {
    page?.socket.close();
    chrome.kill("SIGTERM");
    await Promise.race([once(chrome, "exit"), pause(3000)]);
    if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill("SIGKILL");
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
  }
}

await main();
