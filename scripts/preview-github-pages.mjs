import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = resolve(workspaceRoot, "dist");
const basePath = normalizeBasePath(process.env.VITE_BASE_PATH ?? "/ToniCrespoWEB/");
const port = Number(process.env.PORT ?? 4181);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (!pathname.startsWith(basePath)) {
    response.writeHead(404).end("Not found");
    return;
  }

  const relativePath = decodeURIComponent(pathname.slice(basePath.length)).replace(/^\/+/, "");
  const requestedFile = resolve(outputDirectory, relativePath || "index.html");
  const file = (await isFileInOutputDirectory(requestedFile)) ? requestedFile : resolve(outputDirectory, "404.html");

  try {
    response.writeHead(file === requestedFile ? 200 : 404, {
      "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(500).end("The GitHub Pages preview could not read the build output.");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`GitHub Pages preview: http://127.0.0.1:${port}${basePath}`);
});

async function isFileInOutputDirectory(filePath) {
  if (!filePath.startsWith(`${outputDirectory}${sep}`)) return false;

  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function normalizeBasePath(value) {
  if (value === "/") return "/";
  return `/${value.replace(/^\/+|\/+$/g, "")}/`;
}
