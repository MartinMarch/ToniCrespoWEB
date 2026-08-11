import { mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const inputPath = resolve(workspaceRoot, getOption("--input") ?? "context/mockups-cliente.md");
const outputPath = resolve(workspaceRoot, getOption("--output") ?? "context/mockups-cliente.pdf");
const chromePath = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";

const markdown = await readFile(inputPath, "utf8");
const dossier = parseMarkdown(markdown);
if (dossier.screens.length === 0) throw new Error("El dossier no contiene capturas para exportar.");

for (const screen of dossier.screens) {
  const imagePath = resolve(dirname(inputPath), screen.imagePath);
  await stat(imagePath);
  screen.imageUrl = pathToFileURL(imagePath).href;
  screen.isMobile = basename(screen.imagePath).startsWith("mobile-");
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), "toni-crespo-pdf-"));
const temporaryHtmlPath = join(temporaryDirectory, "mockups-cliente.html");
const temporaryPdfPath = join(temporaryDirectory, "mockups-cliente.pdf");

try {
  await writeFile(temporaryHtmlPath, renderHtml(dossier), "utf8");
  await printPdf(temporaryHtmlPath, temporaryPdfPath);
  await stat(temporaryPdfPath);
  await rename(temporaryPdfPath, outputPath);
  console.log(`PDF creado: ${outputPath}`);
  console.log(`Pantallas incluidas: ${dossier.screens.length}`);
} finally {
  await rm(temporaryDirectory, { force: true, maxRetries: 3, recursive: true, retryDelay: 200 });
}

function parseMarkdown(source) {
  const screens = [];
  const coverage = [];
  let documentTitle = "Toni Crespo";
  let documentSubtitle = "Dossier visual de la web";
  let section = "";
  let subsection = "";
  let itemTitle = "";
  let paragraphLines = [];
  let inCoverage = false;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      documentTitle = h1[1];
      continue;
    }

    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      section = h2[1];
      subsection = "";
      itemTitle = "";
      paragraphLines = [];
      inCoverage = section === "Experiencia cubierta";
      if (section.toLocaleLowerCase().startsWith("dossier visual")) documentSubtitle = section;
      continue;
    }

    if (inCoverage) {
      const cells = parseTableRow(line);
      if (cells && cells[0] !== "Área" && !cells.every((cell) => /^-+$/.test(cell))) coverage.push(cells);
      continue;
    }

    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      subsection = h3[1];
      itemTitle = "";
      paragraphLines = [];
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      screens.push({
        alt: image[1],
        description: paragraphLines.join(" "),
        imagePath: image[2],
        section,
        subsection,
        title: itemTitle || image[1],
      });
      itemTitle = "";
      paragraphLines = [];
      continue;
    }

    const boldTitle = line.match(/^\*\*(.+)\*\*$/);
    if (boldTitle) {
      itemTitle = boldTitle[1];
      paragraphLines = [];
      continue;
    }

    if (line.startsWith(">")) continue;
    if (line === "---" || line.startsWith("- ")) continue;
    paragraphLines.push(stripMarkdown(line));
  }

  return { coverage, documentSubtitle, documentTitle, screens };
}

function parseTableRow(line) {
  if (!line.startsWith("|") || !line.endsWith("|")) return null;
  return line.slice(1, -1).split("|").map((cell) => cell.trim());
}

function stripMarkdown(value) {
  return value.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
}

function renderHtml({ coverage, documentSubtitle, documentTitle, screens }) {
  const coverImage = screens.find((screen) => !screen.isMobile)?.imageUrl ?? "";
  const desktopCount = screens.filter((screen) => !screen.isMobile).length;
  const mobileCount = screens.length - desktopCount;
  const editingCount = screens.filter((screen) => /edici|editor|formulario|eliminar/i.test(screen.imagePath)).length;
  const screenPages = screens.map((screen, index) => renderScreen(screen, index + 3)).join("\n");
  const coverageRows = coverage.map(([area, feature]) => `<tr><th>${escapeHtml(area)}</th><td>${escapeHtml(feature)}</td></tr>`).join("\n");

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(documentTitle)} - ${escapeHtml(documentSubtitle)}</title>
    <style>
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { background: #f7f6f3; color: #111111; font-family: Georgia, "Times New Roman", serif; }
      .page { break-after: page; height: 210mm; overflow: hidden; position: relative; width: 297mm; }
      .cover { background: #121212; color: #ffffff; padding: 20mm 22mm; }
      .cover-art { height: 100%; inset: 0; object-fit: cover; opacity: 0.42; position: absolute; width: 100%; }
      .cover::after { background: linear-gradient(90deg, rgba(10, 10, 10, 0.94), rgba(10, 10, 10, 0.50)); content: ""; inset: 0; position: absolute; }
      .cover-content { display: flex; flex-direction: column; height: 100%; justify-content: space-between; position: relative; z-index: 1; }
      .cover-kicker, .eyebrow { font-family: Arial, sans-serif; font-size: 8.5pt; letter-spacing: 1.4pt; margin: 0; text-transform: uppercase; }
      .cover-kicker { color: rgba(255, 255, 255, 0.72); }
      .cover h1 { font-size: 44pt; font-weight: 400; line-height: 1; margin: 0 0 7mm; }
      .cover h2 { font-size: 18pt; font-weight: 400; line-height: 1.25; margin: 0; max-width: 140mm; }
      .cover-footer { align-items: flex-end; display: flex; justify-content: space-between; }
      .cover-footer p { font-family: Arial, sans-serif; font-size: 9pt; line-height: 1.45; margin: 0; }
      .summary { background: #f4f2ee; padding: 18mm 22mm; }
      .summary h1, .coverage h1 { font-size: 29pt; font-weight: 400; margin: 0 0 7mm; }
      .summary > p { font-size: 13pt; line-height: 1.5; margin: 0; max-width: 205mm; }
      .metrics { display: grid; gap: 4mm; grid-template-columns: repeat(4, 1fr); margin-top: 20mm; }
      .metric { border-top: 1px solid #161616; padding-top: 4mm; }
      .metric strong { display: block; font-family: Arial, sans-serif; font-size: 28pt; font-weight: 400; margin-bottom: 2mm; }
      .metric span { color: #575757; font-family: Arial, sans-serif; font-size: 8.5pt; letter-spacing: 0.7pt; text-transform: uppercase; }
      .summary-note { bottom: 18mm; color: #575757; font-size: 11pt; line-height: 1.45; margin: 0; max-width: 185mm; position: absolute; }
      .screen-page { background: #fbfaf8; display: grid; gap: 4mm; grid-template-rows: auto minmax(0, 1fr) auto; padding: 13mm 17mm 9mm; }
      .screen-page.mobile { background: #f6f4f0; }
      .page-header { min-height: 23mm; }
      .page-header .eyebrow { color: #706c65; margin-bottom: 2mm; }
      .page-header h1 { font-size: 21pt; font-weight: 400; line-height: 1.12; margin: 0 0 2mm; }
      .page-header p { color: #4c4944; font-size: 10.5pt; line-height: 1.32; margin: 0; max-width: 230mm; }
      .screen-frame { align-items: center; display: flex; justify-content: center; min-height: 0; overflow: hidden; }
      .screen-frame img { background: #ffffff; border: 0.25mm solid rgba(17, 17, 17, 0.12); box-shadow: 0 2.4mm 6.4mm rgba(0, 0, 0, 0.13); display: block; object-fit: contain; }
      .desktop .screen-frame img { max-height: 151mm; max-width: 255mm; }
      .mobile .screen-frame img { max-height: 151mm; max-width: 82mm; }
      .page-footer { align-items: center; border-top: 0.25mm solid #d4d0c9; color: #716d66; display: flex; font-family: Arial, sans-serif; font-size: 7.5pt; justify-content: space-between; letter-spacing: 0.45pt; min-height: 5mm; padding-top: 2.5mm; text-transform: uppercase; }
      .coverage { background: #171717; color: #ffffff; padding: 18mm 22mm; }
      .coverage h1 { margin-bottom: 12mm; }
      table { border-collapse: collapse; font-size: 11.5pt; width: 100%; }
      th, td { border-top: 0.25mm solid rgba(255, 255, 255, 0.35); padding: 5mm 0; text-align: left; vertical-align: top; }
      th { font-weight: 400; width: 62mm; }
      td { color: rgba(255, 255, 255, 0.78); line-height: 1.35; }
      .coverage-foot { bottom: 18mm; color: rgba(255, 255, 255, 0.58); font-family: Arial, sans-serif; font-size: 8pt; letter-spacing: 0.8pt; position: absolute; text-transform: uppercase; }
    </style>
  </head>
  <body>
    <section class="page cover">
      <img class="cover-art" src="${escapeAttr(coverImage)}" alt="">
      <div class="cover-content">
        <p class="cover-kicker">Portfolio digital</p>
        <div>
          <h1>${escapeHtml(documentTitle)}</h1>
          <h2>${escapeHtml(documentSubtitle)}<br>Escritorio, móvil y gestión editorial.</h2>
        </div>
        <div class="cover-footer">
          <p>Capturas reales de la versión activa<br>Contenido editorial y experiencia de gestión</p>
          <p>11 agosto 2026<br>53 pantallas documentadas</p>
        </div>
      </div>
    </section>
    <section class="page summary">
      <h1>Una experiencia construida alrededor de la obra.</h1>
      <p>El dossier reúne el recorrido de consulta para visitantes y la gestión editorial autenticada para mantener la web. Cada pantalla parte de la aplicación activa y de su contenido real.</p>
      <div class="metrics">
        <div class="metric"><strong>${screens.length}</strong><span>Pantallas reales</span></div>
        <div class="metric"><strong>${desktopCount}</strong><span>Vistas de escritorio</span></div>
        <div class="metric"><strong>${mobileCount}</strong><span>Vistas de móvil</span></div>
        <div class="metric"><strong>${editingCount}</strong><span>Estados de edición</span></div>
      </div>
      <p class="summary-note">Incluye idiomas, modo oscuro, contacto, visualización de Ambientes, colecciones, obra, fotografía, noticias, trayectoria y los editores privados de contenido.</p>
    </section>
    ${screenPages}
    <section class="page coverage">
      <h1>Experiencia cubierta</h1>
      <table><tbody>${coverageRows}</tbody></table>
      <p class="coverage-foot">Toni Crespo · Dossier visual</p>
    </section>
  </body>
</html>`;
}

function renderScreen(screen, pageNumber) {
  const context = [screen.section, screen.subsection].filter(Boolean).join(" / ");
  return `<section class="page screen-page ${screen.isMobile ? "mobile" : "desktop"}">
    <header class="page-header">
      <p class="eyebrow">${escapeHtml(context)}</p>
      <h1>${escapeHtml(screen.title)}</h1>
      <p>${escapeHtml(screen.description)}</p>
    </header>
    <div class="screen-frame"><img src="${escapeAttr(screen.imageUrl)}" alt="${escapeAttr(screen.alt)}"></div>
    <footer class="page-footer"><span>Toni Crespo · Dossier visual</span><span>${pageNumber}</span></footer>
  </section>`;
}

async function printPdf(htmlPath, pdfPath) {
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-extensions",
    "--allow-file-access-from-files",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise((resolveExit, rejectExit) => {
    chrome.once("error", rejectExit);
    chrome.once("close", resolveExit);
  });
  if (exitCode !== 0) throw new Error(`Chrome no pudo crear el PDF (código ${exitCode}): ${stderr.trim()}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function getOption(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}
