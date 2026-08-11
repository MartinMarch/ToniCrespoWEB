import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import WebSocket from "ws";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const siteUrl = getOption("--url") ?? process.env.MOCKUPS_URL ?? "http://127.0.0.1:4177";
const outputDirectory = resolve(workspaceRoot, getOption("--output") ?? "context/mockups-cliente");
const desktop = { height: 1040, width: 1440 };
const mobile = { height: 844, width: 390 };
const screenshots = [];
const editingOnly = process.argv.includes("--editing-only");

async function runCapture() {
  const hasExistingOutput = await directoryExists(outputDirectory);
  if (hasExistingOutput && !editingOnly) {
    throw new Error(`La carpeta de salida ya existe: ${outputDirectory}. Elimínala o indica otra ruta con --output.`);
  }

  const profileDirectory = await mkdtemp(join(tmpdir(), "toni-crespo-mockups-"));
  if (!hasExistingOutput) await mkdir(outputDirectory, { recursive: true });
  const credentials = editingOnly ? await requestAdminCredentials() : null;

  const chrome = spawn(getChromePath(), [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--remote-allow-origins=*",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ], { stdio: "ignore" });

  try {
    const debuggingPort = await waitForDebuggingPort(profileDirectory);
    const target = await createTarget(debuggingPort, `${siteUrl}/`);
    const page = await CdpPage.connect(target.webSocketDebuggerUrl);

    try {
      if (editingOnly) {
        await signInToEditor(page, credentials);
        await captureEditingDesktop(page);
        await captureEditingMobile(page);
      } else {
        await captureDesktop(page);
        await captureMobile(page);
      }
    } finally {
      await page.close();
    }

    await writeManifest();
    console.log(`Capturas creadas: ${screenshots.length}`);
    console.log(`Salida: ${outputDirectory}`);
  } finally {
    await stopChrome(chrome);
    try {
      await rm(profileDirectory, { force: true, maxRetries: 3, recursive: true, retryDelay: 200 });
    } catch (error) {
      console.warn(`No se pudo limpiar el perfil temporal de Chrome: ${error.message}`);
    }
  }
}

async function captureDesktop(page) {
  await page.setViewport(desktop);

  await page.open("/");
  await page.waitForContent();
  await page.capture("desktop-01-inicio.png", "Inicio - pantalla de escritorio");

  await page.click(".header-settings__trigger");
  await page.waitForSelector(".settings-panel");
  await page.capture("desktop-02-ajustes.png", "Ajustes de idioma, apariencia y edición - escritorio");

  await page.click(".settings-choice--theme:not(.is-active)");
  await page.wait(250);
  await page.click(".header-settings__trigger");
  await page.wait(150);
  await page.capture("desktop-03-modo-oscuro.png", "Inicio en modo oscuro - escritorio");

  await page.click(".header-settings__trigger");
  await page.waitForSelector(".settings-panel");
  await page.click(".settings-choice--theme:not(.is-active)");
  await page.wait(150);
  await page.click(".header-settings__trigger");
  await page.wait(150);

  await page.click(".header-contact-trigger");
  await page.waitForSelector(".contact-dialog");
  await page.capture("desktop-04-formulario-correo.png", "Formulario de correo - escritorio");
  await page.closeDialog();

  await page.click(".header-settings__trigger");
  await page.waitForSelector(".settings-panel");
  await page.click(".settings-panel__editor button");
  await page.waitForSelector(".admin-login");
  await page.capture("desktop-05-acceso-edicion.png", "Acceso protegido al modo de edición - escritorio");
  await page.closeDialog();

  await page.open("/obra");
  await page.waitForContent();
  await page.capture("desktop-06-obra.png", "Obra, colecciones de lienzo y láminas - escritorio");

  await page.open("/lienzos");
  await page.waitForContent();
  await page.capture("desktop-07-colecciones-lienzos.png", "Colecciones de lienzos - escritorio");

  const collectionPath = await page.getAttribute(".support-collection-preview-card__link", "href");
  if (collectionPath) {
    await page.open(collectionPath);
    await page.waitForContent();
    await page.capture("desktop-08-obras-coleccion.png", "Obras de una colección - escritorio");

    if (await page.click(".artwork-ambient-button")) {
      await page.waitForSelector(".artwork-mockup-lightbox");
      await page.waitForVisibleImages();
      await page.capture("desktop-09-ambientes.png", "Visualización de obra en ambientes - escritorio");
      await page.closeDialog();
    }

    if (await page.click(".artwork-interest-button")) {
      await page.waitForSelector(".contact-dialog");
      await page.capture("desktop-10-contacto-obra.png", "Contacto por una obra - escritorio");
      await page.closeDialog();
    }

    if (await page.click(".artwork-showcase__zoom-button")) {
      await page.waitForSelector(".artwork-lightbox");
      await page.waitForVisibleImages();
      await page.capture("desktop-11-detalle-obra.png", "Detalle ampliado de una obra - escritorio");
      await page.closeDialog();
    }
  }

  await page.open("/fotografia");
  await page.waitForContent();
  await page.capture("desktop-12-fotografia.png", "Fotografía - escritorio");
  if (await page.click(".photography-gallery__open")) {
    await page.waitForSelector(".photo-lightbox");
    await page.waitForVisibleImages();
    await page.capture("desktop-13-fotografia-ampliada.png", "Fotografía ampliada - escritorio");
    await page.closeDialog();
  }

  await page.open("/noticias");
  await page.waitForContent();
  await page.capture("desktop-14-noticias.png", "Noticias - escritorio");
  if (await page.fill(".news-search__input", "a")) {
    await page.wait(300);
    await page.capture("desktop-15-busqueda-noticias.png", "Búsqueda de noticias - escritorio");
  }

  await page.open("/trayectoria");
  await page.waitForContent();
  await page.capture("desktop-16-trayectoria.png", "Trayectoria - escritorio");
}

async function captureMobile(page) {
  await page.setViewport(mobile, true);

  await page.open("/");
  await page.waitForContent();
  await page.capture("mobile-01-inicio.png", "Inicio - pantalla móvil");

  await page.click(".header-settings__trigger");
  await page.waitForSelector(".settings-panel");
  await page.capture("mobile-02-ajustes.png", "Ajustes de idioma y apariencia - móvil");

  if (await page.clickButtonByText("English")) {
    await page.wait(300);
    await page.click(".header-settings__trigger");
    await page.wait(100);
    await page.capture("mobile-03-inicio-ingles.png", "Inicio traducido al inglés - móvil");
    await page.click(".header-settings__trigger");
    await page.waitForSelector(".settings-panel");
    await page.clickButtonByText("Español");
  }
  await page.click(".header-settings__trigger");
  await page.wait(150);

  await page.click(".header-contact-trigger");
  await page.waitForSelector(".contact-dialog");
  await page.capture("mobile-04-formulario-correo.png", "Formulario de correo - móvil");
  await page.closeDialog();

  await page.click(".header-settings__trigger");
  await page.waitForSelector(".settings-panel");
  await page.click(".settings-panel__editor button");
  await page.waitForSelector(".admin-login");
  await page.capture("mobile-11-acceso-edicion.png", "Acceso protegido al modo de edición - móvil");
  await page.closeDialog();

  await page.open("/lienzos");
  await page.waitForContent();
  await page.capture("mobile-05-colecciones-lienzos.png", "Colecciones de lienzos - móvil");

  const collectionPath = await page.getAttribute(".support-collection-preview-card__link", "href");
  if (collectionPath) {
    await page.open(collectionPath);
    await page.waitForContent();
    await page.capture("mobile-06-obras-coleccion.png", "Obras de una colección - móvil");

    if (await page.click(".artwork-ambient-button")) {
      await page.waitForSelector(".artwork-mockup-lightbox");
      await page.waitForVisibleImages();
      await page.capture("mobile-12-ambientes.png", "Visualización de obra en ambientes - móvil");
      await page.closeDialog();
    }

    if (await page.click(".artwork-interest-button")) {
      await page.waitForSelector(".contact-dialog");
      await page.capture("mobile-07-contacto-obra.png", "Contacto por una obra - móvil");
      await page.closeDialog();
    }

    if (await page.click(".artwork-showcase__zoom-button")) {
      await page.waitForSelector(".artwork-lightbox");
      await page.waitForVisibleImages();
      await page.capture("mobile-13-detalle-obra.png", "Detalle ampliado de una obra - móvil");
      await page.closeDialog();
    }
  }

  await page.open("/fotografia");
  await page.waitForContent();
  await page.capture("mobile-08-fotografia.png", "Fotografía - móvil");
  if (await page.click(".photography-gallery__open")) {
    await page.waitForSelector(".photo-lightbox");
    await page.waitForVisibleImages();
    await page.capture("mobile-14-fotografia-ampliada.png", "Fotografía ampliada - móvil");
    await page.closeDialog();
  }

  await page.open("/noticias");
  await page.waitForContent();
  await page.capture("mobile-09-noticias.png", "Noticias - móvil");
  if (await page.fill(".news-search__input", "a")) {
    await page.wait(300);
    await page.capture("mobile-15-busqueda-noticias.png", "Búsqueda de noticias - móvil");
  }

  await page.open("/trayectoria");
  await page.waitForContent();
  await page.capture("mobile-10-trayectoria.png", "Trayectoria - móvil");
}

async function captureEditingDesktop(page) {
  await page.setViewport(desktop);

  await page.go("/trayectoria");
  await page.waitForContent();
  await page.waitForSelector(".editing-status");
  await page.hover(".biography-portrait--main");
  await page.capture("desktop-17-edicion-trayectoria.png", "Controles de edición de portada y trayectoria - escritorio");

  await page.scrollToSelector(".biography-portrait--add");
  await page.hover(".biography-portrait:not(.biography-portrait--main):not(.biography-portrait--add)");
  await page.capture("desktop-18-edicion-galeria-trayectoria.png", "Gestión de la galería de trayectoria - escritorio");

  await page.scrollToSelector(".biography-portraits .biography-portrait:last-of-type");
  await page.hover(".biography-portraits .biography-portrait:last-of-type");
  await page.capture("desktop-30-eliminar-galeria-trayectoria.png", "Eliminación de una imagen de trayectoria - escritorio");

  await page.scrollToSelector(".editor-text-target");
  await page.hover(".editor-text-target");
  await page.click(".editor-text-target__action");
  await page.waitForSelector(".admin-dialog");
  await page.capture("desktop-19-editor-texto-trayectoria.png", "Editor multilingüe de trayectoria - escritorio");
  await page.closeDialog();

  await page.go("/noticias");
  await page.waitForContent();
  await page.capture("desktop-20-edicion-noticias.png", "Controles de gestión de noticias - escritorio");
  await page.click(".editor-add-command");
  await page.waitForSelector(".admin-dialog");
  await page.capture("desktop-21-formulario-noticia.png", "Formulario para crear una noticia - escritorio");
  await page.closeDialog();

  await page.go("/fotografia");
  await page.waitForContent();
  await page.hover(".photography-gallery__item");
  await page.capture("desktop-22-edicion-fotografia.png", "Gestión de fotografías - escritorio");
  await page.click(".photography-gallery__item .editor-media-target__action--edit");
  await page.waitForSelector(".admin-dialog");
  await page.capture("desktop-23-editor-fotografia.png", "Editor de fotografía y traducciones - escritorio");
  await page.closeDialog();

  await page.go("/lienzos");
  await page.waitForContent();
  await page.hover(".support-collection-preview-card:not(.support-collection-preview-card--add)");
  await page.capture("desktop-24-edicion-colecciones.png", "Gestión de colecciones - escritorio");
  await page.click(".support-collection-preview-card--add");
  await page.waitForSelector(".admin-dialog");
  await page.capture("desktop-25-formulario-coleccion.png", "Formulario para crear una colección - escritorio");
  await page.closeDialog();
  await page.click(".support-collection-preview-card .editor-media-target__action--edit");
  await page.waitForSelector(".admin-dialog");
  await page.capture("desktop-26-editor-coleccion.png", "Editor de una colección existente - escritorio");
  await page.closeDialog();

  const collectionPath = await page.getAttribute(".support-collection-preview-card__link", "href");
  if (!collectionPath) return;

  await page.go(collectionPath);
  await page.waitForContent();
  await page.hover(".artwork-showcase:not(.artwork-showcase--add) .artwork-showcase__figure");
  await page.capture("desktop-27-edicion-obras.png", "Gestión de obras en una colección - escritorio");
  await page.scrollToSelector(".artwork-showcase:not(.artwork-showcase--add) .artwork-showcase__figure");
  await page.hover(".artwork-showcase:not(.artwork-showcase--add) .artwork-showcase__figure");
  await page.capture("desktop-31-editor-obra-existente.png", "Controles de edición y eliminación de una obra - escritorio");
  await page.click(".artwork-showcase--add");
  await page.waitForSelector(".admin-dialog");
  await page.capture("desktop-28-formulario-obra.png", "Formulario para añadir una obra - escritorio");
  await page.closeDialog();
  await page.click(".artwork-showcase .editor-media-target__action--edit");
  await page.waitForSelector(".admin-dialog");
  await page.capture("desktop-29-editor-obra.png", "Editor de una obra existente - escritorio");
  await page.closeDialog();
}

async function captureEditingMobile(page) {
  await page.setViewport(mobile, true);

  await page.go("/trayectoria");
  await page.waitForContent();
  await page.hover(".biography-portrait--main");
  await page.capture("mobile-16-edicion-trayectoria.png", "Controles de edición de trayectoria - móvil");

  await page.go("/noticias");
  await page.waitForContent();
  await page.capture("mobile-17-edicion-noticias.png", "Controles de gestión de noticias - móvil");

  await page.go("/fotografia");
  await page.waitForContent();
  await page.hover(".photography-gallery__item");
  await page.capture("mobile-18-edicion-fotografia.png", "Gestión de fotografías - móvil");

  await page.go("/lienzos");
  await page.waitForContent();
  await page.hover(".support-collection-preview-card:not(.support-collection-preview-card--add)");
  await page.capture("mobile-19-edicion-colecciones.png", "Gestión de colecciones - móvil");
  await page.scrollToSelector(".support-collection-preview-card:not(.support-collection-preview-card--add)");
  await page.hover(".support-collection-preview-card:not(.support-collection-preview-card--add)");
  await page.capture("mobile-22-editor-coleccion-existente.png", "Controles de edición y eliminación de una colección - móvil");

  const collectionPath = await page.getAttribute(".support-collection-preview-card__link", "href");
  if (!collectionPath) return;

  await page.go(collectionPath);
  await page.waitForContent();
  await page.hover(".artwork-showcase:not(.artwork-showcase--add) .artwork-showcase__figure");
  await page.capture("mobile-20-edicion-obras.png", "Gestión de obras en una colección - móvil");
  await page.scrollToSelector(".artwork-showcase:not(.artwork-showcase--add) .artwork-showcase__figure");
  await page.hover(".artwork-showcase:not(.artwork-showcase--add) .artwork-showcase__figure");
  await page.capture("mobile-21-editor-obra-existente.png", "Controles de edición y eliminación de una obra - móvil");
}

async function writeManifest() {
  const previousScreenshots = editingOnly ? await readExistingManifest() : [];
  const mergedScreenshots = Array.from(
    new Map([...previousScreenshots, ...screenshots].map((screenshot) => [screenshot.file, screenshot])).values(),
  );
  const content = {
    generatedAt: new Date().toISOString(),
    siteUrl,
    screenshots: mergedScreenshots,
  };
  await writeFile(join(outputDirectory, "manifest.json"), `${JSON.stringify(content, null, 2)}\n`);
}

async function readExistingManifest() {
  try {
    const manifest = JSON.parse(await readFile(join(outputDirectory, "manifest.json"), "utf8"));
    return Array.isArray(manifest.screenshots) ? manifest.screenshots : [];
  } catch {
    return [];
  }
}

async function requestAdminCredentials() {
  const fromEnvironment = {
    email: process.env.MOCKUPS_ADMIN_EMAIL?.trim(),
    password: process.env.MOCKUPS_ADMIN_PASSWORD,
  };
  if (fromEnvironment.email && fromEnvironment.password) return fromEnvironment;

  const email = fromEnvironment.email ?? (await promptVisible("Email de administración: ")).trim();
  const password = fromEnvironment.password ?? await promptSecret("Contraseña de administración: ");
  if (!email || !password) throw new Error("Se necesitan credenciales de administración para capturar los controles de edición.");
  return { email, password };
}

async function promptVisible(question) {
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    return await prompt.question(question);
  } finally {
    prompt.close();
  }
}

async function promptSecret(question) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") return promptVisible(question);

  stdout.write(question);
  return new Promise((resolveSecret, rejectSecret) => {
    let value = "";
    const wasRaw = stdin.isRaw;

    function cleanup() {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
    }

    function onData(chunk) {
      for (const character of chunk.toString()) {
        if (character === "\u0003") {
          cleanup();
          rejectSecret(new Error("Captura cancelada antes de iniciar sesión."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          stdout.write("\n");
          resolveSecret(value);
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          if (value) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        value += character;
        stdout.write("*");
      }
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function signInToEditor(page, credentials) {
  await page.setViewport(desktop);
  await page.open("/");
  await page.waitForContent();
  await page.click(".header-settings__trigger");
  await page.waitForSelector(".settings-panel");
  await page.click(".settings-panel__editor button");
  await page.waitForSelector(".admin-login");
  await page.fill(".admin-login input[type=\"email\"]", credentials.email);
  await page.fill(".admin-login input[type=\"password\"]", credentials.password);
  await page.click(".admin-login .admin-primary-button");

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const status = await page.evaluate(`(() => ({
      error: document.querySelector(".admin-login .admin-form__message--error")?.textContent?.trim() ?? null,
      ready: Boolean(document.querySelector(".editing-status")),
    }))()`);
    if (status.ready) return;
    if (status.error) throw new Error(`No se pudo iniciar la sesión de edición: ${status.error}`);
    await page.wait(180);
  }

  throw new Error("La sesión de edición no quedó activa a tiempo.");
}

class CdpPage {
  static async connect(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl, { origin: "http://localhost" });
    const page = new CdpPage(socket);
    await new Promise((resolveConnection, rejectConnection) => {
      socket.once("open", resolveConnection);
      socket.once("error", rejectConnection);
    });
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    return page;
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.on("message", (message) => {
      const event = JSON.parse(message.toString());
      if (typeof event.id !== "number") return;
      const pending = this.pending.get(event.id);
      if (!pending) return;
      this.pending.delete(event.id);
      if (event.error) {
        pending.reject(new Error(event.error.message));
      } else {
        pending.resolve(event.result);
      }
    });
  }

  async close() {
    this.socket.close();
  }

  async setViewport({ height, width }, isMobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height,
      mobile: isMobile,
      screenHeight: height,
      screenWidth: width,
      width,
    });
    await this.send("Emulation.setVisibleSize", { height, width });
  }

  async open(pathname) {
    const url = new URL(pathname, siteUrl).href;
    await this.send("Page.navigate", { url });
    await this.waitForDocument();
  }

  async go(pathname) {
    const expectedPath = new URL(pathname, siteUrl).pathname;
    await this.evaluate(`(() => {
      const target = new URL(${JSON.stringify(pathname)}, window.location.origin);
      if (window.location.pathname === target.pathname) return;
      window.history.pushState({}, "", target.pathname + target.search + target.hash);
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.scrollTo(0, 0);
    })()`);
    await this.waitForExpression(`window.location.pathname === ${JSON.stringify(expectedPath)}`, 3000, "No cambió la ruta interna");
    await this.wait(280);
  }

  async waitForContent() {
    await this.waitForDocument();
    await this.wait(900);
    await this.waitFor(() => {
      const content = document.querySelector("main") ?? document.querySelector("#root");
      return Boolean(content && content.textContent?.trim().length);
    }, 20000);
    await this.waitFor(() => !document.querySelector(".page-loader"), 16000, false);
    await this.wait(600);
    await this.waitForVisibleImages();
  }

  async waitForDocument() {
    await this.waitFor(() => document.readyState === "complete", 20000);
  }

  async capture(filename, label) {
    const response = await this.send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true,
    });
    await writeFile(join(outputDirectory, filename), Buffer.from(response.data, "base64"));
    screenshots.push({ file: filename, label });
    console.log(`Capturada ${filename}`);
  }

  async waitForSelector(selector, timeout = 10000) {
    await this.waitForExpression(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, timeout, `No apareció el selector ${selector}`);
  }

  async waitForVisibleImages(timeout = 15000) {
    await this.waitForExpression(
      `Array.from(document.querySelectorAll(".loading-image")).filter((frame) => {
        const rect = frame.getBoundingClientRect();
        return rect.bottom > 0 && rect.right > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
      }).every((frame) => frame.classList.contains("is-loaded"))`,
      timeout,
      "Las imágenes visibles no terminaron de cargar",
      false,
    );
  }

  async waitFor(predicate, timeout = 10000, required = true) {
    return this.waitForExpression(`(${predicate.toString()})()`, timeout, "Tiempo de espera agotado", required);
  }

  async waitForExpression(expression, timeout = 10000, message = "Tiempo de espera agotado", required = true) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate(expression)) return true;
      } catch {
        // The document can be replaced while React changes routes.
      }
      await this.wait(120);
    }
    if (required) throw new Error(`${message} tras ${timeout} ms.`);
    return false;
  }

  async click(selector) {
    return this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement) || element.offsetParent === null) return false;
      element.click();
      return true;
    })()`);
  }

  async hover(selector) {
    const point = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement) || element.offsetParent === null) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return { x: rect.left + Math.min(rect.width / 2, 40), y: rect.top + Math.min(rect.height / 2, 40) };
    })()`);
    if (!point) return false;
    await this.send("Input.dispatchMouseEvent", { button: "none", buttons: 0, type: "mouseMoved", x: point.x, y: point.y });
    await this.wait(140);
    return true;
  }

  async scrollToSelector(selector) {
    const scrolled = await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) return false;
      element.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
      return true;
    })()`);
    if (scrolled) await this.wait(240);
    return scrolled;
  }

  async clickButtonByText(text) {
    return this.evaluate(`(() => {
      const target = ${JSON.stringify(text)}.trim().toLocaleLowerCase();
      const button = Array.from(document.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim().toLocaleLowerCase().includes(target));
      if (!(button instanceof HTMLElement) || button.offsetParent === null) return false;
      button.click();
      return true;
    })()`);
  }

  async fill(selector, value) {
    return this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
      setter?.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
  }

  async getAttribute(selector, name) {
    return this.evaluate(`document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
  }

  async closeDialog() {
    const closed = (await this.click(".admin-dialog__close")) || (await this.click(".admin-login__close"));
    if (closed) {
      await this.wait(200);
      return;
    }
    await this.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await this.wait(200);
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? "No se pudo evaluar el documento.");
    return response.result.value;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveResponse, rejectResponse) => {
      this.pending.set(id, { reject: rejectResponse, resolve: resolveResponse });
      this.socket.send(JSON.stringify({ id, method, params }), (error) => {
        if (!error) return;
        this.pending.delete(id);
        rejectResponse(error);
      });
    });
  }

  wait(milliseconds) {
    return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
  }
}

async function createTarget(port, url) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Chrome no pudo abrir la página: ${response.status} ${await response.text()}`);
  return response.json();
}

async function waitForDebuggingPort(profileDirectory) {
  const activePortPath = join(profileDirectory, "DevToolsActivePort");
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const [port] = (await readFile(activePortPath, "utf8")).split("\n");
      if (port) return Number(port);
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Chrome no abrió su puerto de depuración.");
}

async function directoryExists(directory) {
  try {
    await readFile(directory);
    return true;
  } catch (error) {
    return error?.code !== "ENOENT";
  }
}

async function stopChrome(process) {
  if (process.exitCode !== null || process.signalCode !== null) return;
  process.kill("SIGTERM");
  await Promise.race([
    once(process, "exit"),
    new Promise((resolveWait) => setTimeout(resolveWait, 5000)),
  ]);
}

function getChromePath() {
  return process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
}

function getOption(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

await runCapture();
