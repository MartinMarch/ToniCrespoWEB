/**
 * Offline, isolated browser regression for the actual room-preview component.
 * Start Vite first, then run: node tests/browser/artwork-rooms.mjs
 * Optional: ROOMS_TEST_URL=http://127.0.0.1:5173 CHROME_PATH=/path/to/chrome
 * Focused rerun: ROOMS_TEST_FIXTURES=smallest-square,long-title
 * Screenshots and the JSON report go into a new OS temporary directory.
 * The browser never opens the full application and all non-local requests are
 * blocked before sending. Site preferences use their local default fixture.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { chromium } from "@playwright/test";
import WebSocket from "ws";

const siteUrl = new URL(process.env.ROOMS_TEST_URL ?? "http://127.0.0.1:5173");
assert(["127.0.0.1", "localhost", "[::1]"].includes(siteUrl.hostname), "ROOMS_TEST_URL must be a loopback address");
const viewports = [
  { name: "desktop", width: 1440, height: 1000, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
  { name: "small-mobile", width: 320, height: 568, mobile: true },
  { name: "landscape-mobile", width: 844, height: 390, mobile: true },
  { name: "small-landscape-mobile", width: 667, height: 375, mobile: true },
];
const fixtureCatalog = [
  { id: "smallest-square", dimensions: "20 x 20 cm", width: 1400, height: 1400 },
  { id: "small-square", dimensions: "30 x 30 cm", width: 1400, height: 1400 },
  { id: "medium-square", dimensions: "90 x 90 cm", width: 1400, height: 1400 },
  { id: "large-square", dimensions: "140 x 140 cm", width: 1400, height: 1400 },
  { id: "panorama", dimensions: "220 x 120 cm", width: 2200, height: 1200 },
  { id: "portrait", dimensions: "90 x 140 cm", width: 900, height: 1400 },
  { id: "large-panorama", dimensions: "280 x 140 cm", width: 2800, height: 1400 },
  { id: "unknown", dimensions: null, width: 1400, height: 1400 },
  { id: "oversize", dimensions: "1000 x 1000 cm", width: 1400, height: 1400 },
  { id: "long-title", title: "Un título de obra deliberadamente largo para comprobar que la información y los controles siguen siendo accesibles en teléfonos", dimensions: "30 x 30 cm", width: 1400, height: 1400 },
];
const selectedFixtures = process.env.ROOMS_TEST_FIXTURES?.split(",");
const fixtures = selectedFixtures ? fixtureCatalog.filter(fixture => selectedFixtures.includes(fixture.id)) : fixtureCatalog;
assert(fixtures.length > 0, "ROOMS_TEST_FIXTURES must include an existing fixture id");
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const report = { checks: [], navigationViewports: [], unitToggleViewports: [], screenshots: [], blockedExternalRequests: [], fixtureNote: "Square tests use the local Ulises artwork; non-square tests use synthetic SVG cards labeled TEST, not real artworks." };
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
await import('/@vite/client');
await import('/src/styles/global.css');
localStorage.setItem('toni-crespo-language', 'es');
localStorage.setItem('toni-crespo-measurement-unit', 'cm');
const [reactModule, reactDomModule, { SitePreferencesProvider }, { ContactDialogProvider }, { ArtworkShowcaseList }, geometry, catalog] = await Promise.all([
  import('/node_modules/.vite/deps/react.js'),
  import('/node_modules/.vite/deps/react-dom_client.js'),
  import('/src/app/sitePreferences.tsx'),
  import('/src/components/contact/ContactDialogProvider.tsx'),
  import('/src/components/artworks/ArtworkShowcaseList.tsx'),
  import('/src/lib/artworkRoomGeometry.ts'),
  import('/src/data/roomScenes.ts'),
]);
const React = reactModule.default ?? reactModule;
const { createRoot } = reactDomModule.default ?? reactDomModule;
const root = createRoot(document.getElementById('root'));
window.__roomsTest = { geometry, scenes: catalog.roomScenes, render(input) {
  const syntheticArtwork = '<svg xmlns="http://www.w3.org/2000/svg" width="' + input.width + '" height="' + input.height + '" viewBox="0 0 ' + input.width + ' ' + input.height + '"><defs><linearGradient id="paint" x2="1" y2="1"><stop stop-color="#15404d"/><stop offset=".5" stop-color="#ae8051"/><stop offset="1" stop-color="#6c3542"/></linearGradient></defs><path fill="url(#paint)" d="M0 0h' + input.width + 'v' + input.height + 'H0z"/><path d="M0 ' + input.height * .68 + 'L' + input.width + ' ' + input.height * .3 + '" stroke="#f7debd" stroke-width="' + input.height * .04 + '"/><text x="50%" y="80%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="' + Math.min(input.width, input.height) * .065 + '" fill="white">TEST · ' + input.dimensions + '</text></svg>';
  const imageUrl = input.width === input.height ? '/src/assets/El-mar-de-Ulises-140x140-2024.jpg' : 'data:image/svg+xml,' + encodeURIComponent(syntheticArtwork);
  const artwork = { collectionSlug: 'room-regression', slug: input.id, title: 'Prueba de ambiente · ' + input.id,
    caption: '', description: '', technique: 'Óleo sobre lienzo', sourceImageUrl: imageUrl,
    imageUrl, thumbnailUrl: null, sortOrder: 0, isPublished: true, ...input };
  this.artwork = artwork;
  root.render(React.createElement(SitePreferencesProvider, { key: input.id },
    React.createElement(ContactDialogProvider, null, React.createElement(ArtworkShowcaseList, { artworks: [artwork], supportKind: input.supportKind ?? 'canvas' }))));
} };
</script></body></html>`;

class Page {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    this.events = new Map();
    this.exceptions = [];
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else {
        if (message.method === "Runtime.exceptionThrown") this.exceptions.push(message.params.exceptionDetails);
        this.events.get(message.method)?.(message.params);
      }
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
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
  async waitFor(expression, label, timeout = 12000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (this.exceptions.length) throw new Error(JSON.stringify(this.exceptions));
      if (await this.evaluate(expression)) return;
      await pause(75);
    }
    throw new Error(`Timed out: ${label}`);
  }
  async click(selector) {
    const point = await this.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    assert(point, `Missing clickable element: ${selector}`);
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
  }
  async key(key) {
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key });
  }
  async capture(name, outputDirectory) {
    const screenshot = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(outputDirectory, `${name}.png`), Buffer.from(screenshot.data, "base64"));
    report.screenshots.push(`${name}.png`);
  }
}

async function installIsolation(page) {
  page.events.set("Fetch.requestPaused", async ({ requestId, request, resourceType }) => {
    try {
      const url = new URL(request.url);
      if (url.origin !== siteUrl.origin || !["GET", "HEAD"].includes(request.method)) {
        report.blockedExternalRequests.push({ url: `${url.origin}${url.pathname}`, method: request.method });
        await page.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
        return;
      }
      let body;
      let contentType;
      if (resourceType === "Document" && url.pathname === "/__room-regression__") {
        body = html;
        contentType = "text/html";
      } else if (url.pathname === "/src/services/siteSettingsService.ts") {
        // Exercise the real preferences provider without reaching a backend.
        body = "import { defaultSiteSettings } from '/src/types/siteSettings.ts'; export async function loadSiteSettings() { return defaultSiteSettings; } export async function saveSiteSettings() { throw new Error('Writes are forbidden in room regression'); }";
        contentType = "text/javascript";
      }
      if (body !== undefined) {
        await page.send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: contentType }], body: Buffer.from(body).toString("base64") });
      } else await page.send("Fetch.continueRequest", { requestId });
    } catch (error) {
      page.exceptions.push({ text: `Request isolation failed: ${error.message}` });
    }
  });
  await page.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await page.send("Network.enable");
  await page.send("Network.setBlockedURLs", { urls: ["*://*.supabase.co/*", "*://*.supabase.com/*"] });
}

async function openFixture(page, fixture) {
  await page.evaluate(`window.__roomsTest.render(${JSON.stringify(fixture)})`);
  await page.waitFor(`document.querySelector('.artwork-ambient-button') && document.querySelector('.artwork-showcase')?.textContent.includes(${JSON.stringify(fixture.title ?? fixture.id)})`, `fixture ${fixture.id}`);
  await page.evaluate("document.querySelector('.artwork-ambient-button').scrollIntoView({ block: 'center', behavior: 'instant' })");
  await page.click(".artwork-ambient-button");
  await page.waitFor("Boolean(document.querySelector('.artwork-mockup-lightbox'))", "room dialog opens");
  await pause(150);
}

async function inspectScene(page, fixture, viewport) {
  return page.evaluate(`(() => {
    const { geometry, scenes, artwork } = window.__roomsTest;
    const expectedScenes = geometry.getMockupsForArtwork(artwork, scenes);
    const cards = [...document.querySelectorAll('.room-mockup-card')];
    const activeIndex = Math.max(0, [...document.querySelectorAll('.artwork-mockup-pagination__dot')].findIndex(dot => dot.getAttribute('aria-current') === 'true'));
    const card = cards[activeIndex];
    const rect = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const scene = expectedScenes[activeIndex];
    const mount = card?.querySelector('.room-mockup-card__artwork');
    const style = mount ? getComputedStyle(mount) : null;
    return { fixture: ${JSON.stringify(fixture.id)}, viewport: ${JSON.stringify(viewport.name)}, activeIndex,
      expectedCount: expectedScenes.length, count: cards.length, scene: scene?.id,
      expected: scene ? geometry.getArtworkPlacement(geometry.getArtworkMetrics(artwork), scene) : null,
      wall: scene?.wall, sceneRatio: scene?.imageAspectRatio, card: rect(card), mount: rect(mount),
      renderedScene: card?.getAttribute('data-room-id'),
      background: rect(card?.querySelector('.room-mockup-card__background')),
      caption: document.querySelector('.artwork-mockup-lightbox__scale')?.textContent?.trim(),
      captionRect: rect(document.querySelector('.artwork-mockup-lightbox__scale')),
      imageSurface: rect(card?.querySelector('.room-mockup-card__artwork-surface')),
      imageLoader: rect(card?.querySelector('.room-mockup-card__artwork-surface > .loading-image')),
      image: rect(card?.querySelector('.room-mockup-card__artwork-surface img')),
      imageFit: card?.querySelector('.room-mockup-card__artwork-surface img') ? getComputedStyle(card.querySelector('.room-mockup-card__artwork-surface img')).objectFit : null,
      dialogText: document.querySelector('.artwork-mockup-lightbox')?.textContent?.trim(),
      border: style ? [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth] : [],
      padding: style ? [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft] : [],
      frames: [...(card?.querySelectorAll('.room-mockup-card__frame') ?? [])].map(e => { const s = getComputedStyle(e); return { padding: s.padding, border: s.borderWidth, background: s.backgroundColor }; }),
      controls: [...document.querySelectorAll('.artwork-mockup-nav, .artwork-mockup-pagination__dot, .artwork-lightbox__close, .artwork-mockup-lightbox .artwork-dimensions__toggle')].map(e => ({ label: e.getAttribute('aria-label'), isUnitToggle: e.matches('.artwork-dimensions__toggle'), rect: rect(e) })),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      loaded: [...(card?.querySelectorAll('img') ?? [])].every(img => img.complete && img.naturalWidth > 0),
    };
  })()`);
}

function verifyScene(state, fixture, viewport) {
  report.latestState = state;
  const prefix = `${viewport.name}/${fixture.id}/${state.scene ?? "empty"}`;
  assert.equal(state.count, state.expectedCount, `${prefix}: filtered scene count`);
  assert(!state.horizontalOverflow, `${prefix}: page horizontal overflow`);
  if (!state.expectedCount) {
    assert.equal(fixture.id, "oversize", `${prefix}: ordinary fixture should have a suitable room`);
    assert(state.dialogText.length > fixture.id.length + 20, `${prefix}: no-room state needs an explanation`);
    report.checks.push({ ...state, status: "pass" });
    return;
  }
  assert(state.loaded, `${prefix}: room/art images must load locally`);
  assert.equal(state.renderedScene, state.scene, `${prefix}: rendered catalog order`);
  assert(state.caption, `${prefix}: scale explanation is missing`);
  assert(state.captionRect.y >= -1 && state.captionRect.bottom <= viewport.height + 1, `${prefix}: scale caption clipped vertically`);
  assert.equal(state.expected.isEstimated, fixture.id === "unknown", `${prefix}: missing measurements must be explicitly estimated`);
  assert(state.caption.includes(fixture.id === "unknown" ? "sin escala" : "orientativa"), `${prefix}: honest known/unknown scale caption`);
  assert(state.expected.fits, `${prefix}: must not show an oversized placement`);
  assert(state.card.width > 60 && state.card.height > 40, `${prefix}: room collapsed`);
  const close = (actual, expected, label, tolerance = 0.55) => assert(Math.abs(actual - expected) <= tolerance, `${prefix}: ${label}: ${actual} != ${expected}`);
  close(state.card.width / state.card.height, state.sceneRatio, "uncropped room aspect ratio", 0.004);
  assert(state.background, `${prefix}: background is missing`);
  close(state.background.width, state.card.width, "background width");
  close(state.background.height, state.card.height, "background height");
  for (const [name, layer] of Object.entries({ surface: state.imageSurface, loader: state.imageLoader, image: state.image })) {
    assert(layer, `${prefix}: ${name} is missing`);
    close(layer.width, state.mount.width, `${name} width`);
    close(layer.height, state.mount.height, `${name} height`);
  }
  assert.equal(state.imageFit, "contain", `${prefix}: preserve source photo without cropping/distorting`);
  close(state.mount.width / state.card.width * 100, state.expected.width, "physical width %", 0.15);
  close(state.mount.height / state.card.height * 100, state.expected.height, "physical height %", 0.15);
  close((state.mount.x + state.mount.width / 2 - state.card.x) / state.card.width * 100, state.expected.x, "horizontal center %", 0.15);
  close((state.mount.y - state.card.y) / state.card.height * 100, state.expected.y, "top %", 0.15);
  assert(state.card.x >= -1 && state.card.right <= viewport.width + 1, `${prefix}: room clipped horizontally`);
  assert(state.card.y >= -1 && state.card.bottom <= viewport.height + 1, `${prefix}: room clipped vertically`);
  assert(state.border.every(value => parseFloat(value) === 0), `${prefix}: no frame border`);
  assert(state.padding.every(value => parseFloat(value) === 0), `${prefix}: no frame padding`);
  for (const frame of state.frames) {
    assert(/^0(px)?(?:\s+0(px)?)*$/.test(frame.padding) && /^0(px)?(?:\s+0(px)?)*$/.test(frame.border), `${prefix}: legacy frame still has padding/borders`);
    assert(["transparent", "rgba(0, 0, 0, 0)"].includes(frame.background), `${prefix}: legacy dark frame remains`);
  }
  for (const control of state.controls) {
    assert(control.label, `${prefix}: unnamed control`);
    assert(control.rect.x >= -1 && control.rect.right <= viewport.width + 1 && control.rect.y >= -1 && control.rect.bottom <= viewport.height + 1, `${prefix}: control outside viewport: ${control.label}`);
    const minimumTarget = control.isUnitToggle ? 44 : 40;
    if (viewport.mobile) assert(control.rect.width >= minimumTarget - 0.05 && control.rect.height >= minimumTarget - 0.05, `${prefix}: touch target below ${minimumTarget}px: ${control.label}`);
  }
  report.checks.push({ ...state, status: "pass" });
}

async function expectIndex(page, index) {
  await page.waitFor(`document.querySelectorAll('.artwork-mockup-pagination__dot')[${index}]?.getAttribute('aria-current') === 'true'`, `room ${index + 1} becomes active`);
  // Production unlocks smooth-scroll navigation after 620ms. Wait beyond that
  // point so subsequent gestures cannot race its pending index reconciliation.
  await pause(700);
  await page.waitFor(`document.querySelectorAll('.artwork-mockup-pagination__dot')[${index}]?.getAttribute('aria-current') === 'true'`, `room ${index + 1} stays active after smooth scrolling`);
}

async function exerciseUnitToggle(page, fixture, viewport) {
  const selector = ".artwork-mockup-lightbox .artwork-dimensions__toggle";
  const before = await inspectScene(page, fixture, viewport);
  await page.click(selector);
  await page.waitFor(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim() === 'in'`, "dimensions switch to inches");
  await pause(150);
  const inches = await inspectScene(page, fixture, viewport);
  assert.deepEqual(inches.expected, before.expected, `${viewport.name}: unit conversion must not alter artwork physical placement`);
  assert.equal(inches.scene, before.scene, `${viewport.name}: unit conversion must not change room`);
  assert(await page.evaluate("document.querySelector('.artwork-mockup-lightbox .artwork-dimensions > span')?.textContent.includes('35,4')"), "90cm is displayed as 35.4 inches in Spanish locale");
  verifyScene(inches, fixture, viewport);
  await page.click(selector);
  await page.waitFor(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim() === 'cm'`, "dimensions return to centimetres");
  await pause(150);
  report.unitToggleViewports.push(viewport.name);
}

async function exerciseNavigation(page, viewport, count) {
  if (count < 2) return;
  await page.click(".artwork-mockup-nav--next");
  await expectIndex(page, 1);
  await page.click(".artwork-mockup-nav--prev");
  await expectIndex(page, 0);
  await page.evaluate("document.querySelector('.artwork-mockup-gallery').focus()");
  await page.key("ArrowRight");
  await expectIndex(page, 1);
  await page.key("ArrowLeft");
  await expectIndex(page, 0);
  await page.click(`.artwork-mockup-pagination__dot:nth-child(${count})`);
  await expectIndex(page, count - 1);
  await page.click(".artwork-mockup-pagination__dot:first-child");
  await expectIndex(page, 0);
  if (viewport.mobile) {
    const point = await page.evaluate("(() => { const r = document.querySelector('.room-mockup-card').getBoundingClientRect(); return { x: r.x + r.width * 0.85, y: r.y + r.height * 0.35, distance: r.width * 0.68 }; })()");
    await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.x, y: point.y }] });
    for (let step = 1; step <= 8; step += 1) {
      await page.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x - point.distance * step / 8, y: point.y }] });
      await pause(25);
    }
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    // Native momentum can legitimately advance more than one room. Require a
    // real forward change and a settled, fitting room, not an exact drag index.
    await page.waitFor("[...document.querySelectorAll('.artwork-mockup-pagination__dot')].findIndex(dot => dot.getAttribute('aria-current') === 'true') > 0", "touch swipe changes room");
    await pause(900);
    await page.waitFor("[...document.querySelectorAll('.artwork-mockup-pagination__dot')].findIndex(dot => dot.getAttribute('aria-current') === 'true') > 0", "touch swipe stays on a later room");
  }
  report.navigationViewports.push({ viewport: viewport.name, buttons: true, dots: true, keyboard: true, touchSwipe: viewport.mobile });
}

async function main() {
  const response = await fetch(new URL("/@vite/client", siteUrl));
  assert(response.ok, "Start the local Vite dev server before running this script");
  const outputDirectory = await mkdtemp(join(tmpdir(), "toni-artwork-rooms-report-"));
  const profile = await mkdtemp(join(tmpdir(), "toni-artwork-rooms-chrome-"));
  let browserContext;
  let page;
  try {
    // Keep the custom CDP assertions while sharing Playwright's reliable
    // browser startup, CI sandbox defaults and launch-failure diagnostics.
    browserContext = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROME_PATH ?? undefined,
      headless: true,
      viewport: null,
      args: ["--remote-debugging-port=0", "--remote-allow-origins=*"],
    });
    let port;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      try { port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); break; } catch { await pause(100); }
    }
    assert(port, "Chrome did not start its debugging port");
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await once(socket, "open");
    page = new Page(socket);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await installIsolation(page);
    await page.send("Page.navigate", { url: new URL("/__room-regression__", siteUrl).href });
    await page.waitFor("Boolean(window.__roomsTest)", "isolated component imports", 20000);
    for (const viewport of viewports) {
      await page.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, screenWidth: viewport.width, screenHeight: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
      await page.send("Emulation.setTouchEmulationEnabled", { enabled: viewport.mobile, maxTouchPoints: 1 });
      for (const fixture of fixtures) {
        await openFixture(page, fixture);
        if (fixture.id !== "oversize") await page.waitFor("[...document.querySelectorAll('.room-mockup-card.is-active img')].length >= 2 && [...document.querySelectorAll('.room-mockup-card.is-active img')].every(i => i.complete && i.naturalWidth > 0)", "local room images");
        let state = await inspectScene(page, fixture, viewport);
        verifyScene(state, fixture, viewport);
        if (["smallest-square", "small-square", "large-square", "panorama", "portrait", "long-title"].includes(fixture.id)) await page.capture(`${viewport.name}-${fixture.id}`, outputDirectory);
        if (fixture.id === "medium-square") {
          await exerciseUnitToggle(page, fixture, viewport);
          await exerciseNavigation(page, viewport, state.count);
          state = await inspectScene(page, fixture, viewport);
          verifyScene(state, fixture, viewport);
        }
        // Every fitting scene is checked, not only each carousel's first card.
        for (let index = 1; index < state.count; index += 1) {
          await page.click(`.artwork-mockup-pagination__dot:nth-child(${index + 1})`);
          await expectIndex(page, index);
          await page.waitFor("[...document.querySelectorAll('.room-mockup-card.is-active img')].every(i => i.complete && i.naturalWidth > 0)", "next scene images");
          const nextScene = await inspectScene(page, fixture, viewport);
          verifyScene(nextScene, fixture, viewport);
          if (viewport.name === "desktop" && ["small-square", "medium-square", "large-square"].includes(fixture.id)) await page.capture(`${viewport.name}-${fixture.id}-${nextScene.scene}`, outputDirectory);
        }
        await page.key("Escape");
        await page.waitFor("!document.querySelector('.artwork-mockup-lightbox') && !document.documentElement.classList.contains('is-lightbox-open')", "Escape closes and restores page scrolling");
        console.log(`PASS ${viewport.name}/${fixture.id}: ${state.count} suitable rooms`);
      }
    }
    // Paper must be frameless too, not only canvas fixtures.
    await openFixture(page, { ...fixtureCatalog[0], id: "small-paper", supportKind: "paper" });
    await page.waitFor("[...document.querySelectorAll('.room-mockup-card.is-active img')].length >= 2 && [...document.querySelectorAll('.room-mockup-card.is-active img')].every(i => i.complete && i.naturalWidth > 0)", "paper room images");
    verifyScene(await inspectScene(page, { id: "small-paper" }, viewports.at(-1)), { id: "small-paper" }, viewports.at(-1));
    assert.equal(page.exceptions.length, 0, "No runtime exceptions");
    console.log(`PASS: ${report.checks.length} layout checks; ${report.navigationViewports.length} navigation viewport checks; screenshots: ${outputDirectory}`);
  } catch (error) {
    report.error = error.stack;
    if (page) await page.capture("failure", outputDirectory).catch(() => {});
    throw error;
  } finally {
    try {
      await writeFile(join(outputDirectory, "report.json"), JSON.stringify(report, null, 2));
      console.log(`Report: ${join(outputDirectory, "report.json")}`);
    } finally {
      try {
        page?.socket.close();
        await browserContext?.close();
      } finally {
        await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
      }
    }
  }
}

await main();
