import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "@playwright/test";
import { parseArtworkPage } from "../../scripts/lib/wordpressArtworkParser.mjs";

const sourceUrl = "https://artist.example/coleccion/";
let browser;
let page;

before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath(),
    headless: true,
  });
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", (route) => route.abort());
  page = await context.newPage();
});

after(async () => {
  await browser?.close();
});

function documentWithContent(content) {
  return `<!doctype html><html><head><title>Colección</title></head><body><main class="entry-content">${content}</main></body></html>`;
}

async function parseContent(content) {
  return page.evaluate(parseArtworkPage, { html: documentWithContent(content), sourceUrl });
}

function assertEditorialTitle(artwork, expected) {
  assert.equal(artwork.title, expected);
  assert.equal(typeof artwork.titleSource, "string");
  assert.notEqual(artwork.titleSource, "");
  assert.notEqual(artwork.titleSource, "filename");
}

test("NextGEN prioritizes data-title and preserves decoded, multiline descriptions", async () => {
  const result = await parseContent(`
    <div class="ngg-galleryoverview">
      <div class="ngg-gallery-thumbnail">
        <a href="/viewer/23" data-src="../wp-content/gallery/luz.jpg" data-image-id="23"
           data-title="Luz &amp; sombra" title="Título secundario"
           data-description="&lt;p&gt;Primera línea &amp;amp; color.&lt;br&gt;Segunda línea.&lt;/p&gt;&lt;p&gt;Tercera línea.&lt;/p&gt;">
          <img src="../wp-content/gallery/thumbs/luz.jpg" title="Título de imagen" alt="Detalle &amp; textura">
        </a>
      </div>
    </div>`);

  assert.equal(result.artworks.length, 1);
  const [artwork] = result.artworks;
  assert.equal(artwork.kind, "nextgen");
  assertEditorialTitle(artwork, "Luz & sombra");
  assert.equal(artwork.imageUrl, "https://artist.example/wp-content/gallery/luz.jpg");
  assert.equal(artwork.thumbnailUrl, "https://artist.example/wp-content/gallery/thumbs/luz.jpg");
  assert.equal(artwork.description, "Primera línea & color.\nSegunda línea.\n\nTercera línea.");
  assert.equal(artwork.alt, "Detalle & textura");
  assert.equal(artwork.nextgenId, "23");
  assert.equal(artwork.wordpressMediaId, null);
  assert.equal(result.emptyGallery, false);
});

test("NextGEN falls back through anchor title, image title, alt and the unchanged filename", async () => {
  const result = await parseContent(`
    <div class="ngg-galleryoverview">
      <div class="ngg-gallery-thumbnail"><a data-src="/a.jpg" title="Desde enlace"><img src="/a-thumb.jpg" title="No gana" alt="Tampoco gana"></a></div>
      <div class="ngg-gallery-thumbnail"><a data-src="/b.jpg"><img src="/b-thumb.jpg" title="Desde imagen" alt="No gana"></a></div>
      <div class="ngg-gallery-thumbnail"><a data-src="/c.jpg"><img src="/c-thumb.jpg" alt="Desde alternativa"></a></div>
      <div class="ngg-gallery-thumbnail"><a data-src="/Sin%20t%C3%ADtulo-80x60.jpg?version=2"><img src="/d-thumb.jpg"></a></div>
    </div>`);

  assert.equal(result.artworks.length, 4);
  assertEditorialTitle(result.artworks[0], "Desde enlace");
  assertEditorialTitle(result.artworks[1], "Desde imagen");
  assertEditorialTitle(result.artworks[2], "Desde alternativa");
  assert.equal(result.artworks[3].title, "Sin título-80x60.jpg");
  assert.equal(result.artworks[3].titleSource, "filename");
});

test("WordPress uses the strong caption title and keeps the full caption and following paragraphs", async () => {
  const result = await parseContent(`
    <figure class="wp-block-image">
      <a href="../wp-content/uploads/cuadro.jpg"><img class="size-large wp-image-104" src="../wp-content/uploads/cuadro-640.jpg" alt="Título alternativo"></a>
      <figcaption><strong>Mar &amp; memoria</strong><br>Óleo sobre lienzo. 80 × 60 cm.</figcaption>
    </figure>
    <p>Primera descripción &amp; contexto.</p>
    <p>Segunda descripción.<br>Otra línea.</p>
    <figure class="wp-block-image"><img src="/segunda.jpg" alt="Segunda obra"></figure>
    <p>Descripción de la segunda obra.</p>
    <h2>Otra sección</h2>
    <p>Este texto no pertenece a ninguna obra.</p>`);

  assert.equal(result.artworks.length, 2);
  const [artwork, secondArtwork] = result.artworks;
  assert.equal(artwork.kind, "wordpress");
  assertEditorialTitle(artwork, "Mar & memoria");
  assert.equal(artwork.caption, "Mar & memoria\nÓleo sobre lienzo. 80 × 60 cm.");
  assert.equal(artwork.description, "Primera descripción & contexto.\nSegunda descripción.\nOtra línea.");
  assert.equal(artwork.imageUrl, "https://artist.example/wp-content/uploads/cuadro.jpg");
  assert.equal(artwork.thumbnailUrl, "https://artist.example/wp-content/uploads/cuadro-640.jpg");
  assert.equal(artwork.wordpressMediaId, "104");
  assert.equal(artwork.nextgenId, null);
  assert.equal(secondArtwork.description, "Descripción de la segunda obra.");
});

test("WordPress recognizes bold and leading quoted titles and preserves unstructured captions", async () => {
  const result = await parseContent(`
    <figure class="wp-block-image"><img src="/bold.jpg" alt="Alternativa"><figcaption><b>Desde negrita</b>, técnica mixta.</figcaption></figure>
    <figure class="wp-block-image"><img src="/spanish.jpg" alt="Alternativa"><figcaption>«Noche &amp; día». Óleo.</figcaption></figure>
    <figure class="wp-block-image"><img src="/curly.jpg" alt="Alternativa"><figcaption>“Horizonte”. Acrílico.</figcaption></figure>
    <figure class="wp-block-image"><img src="/straight.jpg" alt="Alternativa"><figcaption>&quot;Pausa&quot;. Acuarela.</figcaption></figure>
    <figure class="wp-block-image"><img src="/literal.jpg" alt="Alternativa"><figcaption>Óleo sobre tabla.</figcaption></figure>
    <figure class="wp-block-image"><img src="/alt.jpg" alt="Desde alternativa"></figure>
    <figure class="wp-block-image"><img src="/obra-sin-titulo.JPG?size=large"></figure>`);

  assert.equal(result.artworks.length, 7);
  ["Desde negrita", "Noche & día", "Horizonte", "Pausa", "Óleo sobre tabla.", "Desde alternativa"].forEach((title, index) => {
    assertEditorialTitle(result.artworks[index], title);
  });
  assert.equal(result.artworks[4].caption, "Óleo sobre tabla.");
  assert.equal(result.artworks[6].title, "obra-sin-titulo.JPG");
  assert.equal(result.artworks[6].titleSource, "filename");
});

test("full HTML only extracts artwork and collection links from entry-content", async () => {
  const html = `<!doctype html><html><body>
    <header><figure class="wp-block-image"><img src="/logo.jpg" alt="Logotipo"></figure><a href="/cabecera/">Cabecera</a></header>
    <main class="entry-content">
      <figure class="wp-block-image"><a href="/obra.jpg"><img src="/obra-thumb.jpg" alt="Obra"></a></figure>
      <a href="../paisajes/">Paisajes &amp; naturaleza</a>
      <a href="https://other.example/coleccion/">Externa</a>
      <a href="/archivo.pdf">Documento</a>
      <a href="#detalle">Detalle</a>
      <a href="mailto:artist@example.com">Correo</a>
      <nav class="ngg-navigation"><a href="?nggpage=2">2</a></nav>
    </main>
    <footer><figure class="wp-block-image"><img src="/firma.jpg" alt="Firma"></figure><a href="/pie/">Pie</a></footer>
  </body></html>`;
  const result = await page.evaluate(parseArtworkPage, { html, sourceUrl });

  assert.deepEqual(result.artworks.map((artwork) => artwork.title), ["Obra"]);
  assert.deepEqual(result.collectionLinks, [{ url: "https://artist.example/paisajes/", title: "Paisajes & naturaleza" }]);
});

test("full HTML requires entry-content while contentOnly accepts a body fragment", async () => {
  const html = '<figure class="wp-block-image"><img src="/fragmento.jpg" alt="Fragmento"></figure>';
  await assert.rejects(page.evaluate(parseArtworkPage, { html, sourceUrl }));

  const result = await page.evaluate(parseArtworkPage, { html, sourceUrl, contentOnly: true });
  assert.equal(result.artworks.length, 1);
  assertEditorialTitle(result.artworks[0], "Fragmento");
});

test("parsing untrusted HTML leaves scripts and image error handlers inert", async () => {
  const result = await parseContent(`
    <script>globalThis.__wordpressParserExecuted = true;</script>
    <script src="https://untrusted.example/script.js"></script>
    <figure class="wp-block-image">
      <img src="https://untrusted.example/missing.jpg" alt="Imagen inerte" onerror="globalThis.__wordpressParserExecuted = true">
      <figcaption><strong>Imagen inerte</strong><script>globalThis.__wordpressParserExecuted = true;</script></figcaption>
    </figure>`);

  assert.equal(result.artworks.length, 1);
  assert.equal(result.artworks[0].caption, "Imagen inerte");
  assert.equal(await page.evaluate(() => globalThis.__wordpressParserExecuted), undefined);
  assert.equal(page.url(), "about:blank");
});

test("a bot challenge is rejected even when it contains a misleading entry-content", async () => {
  const html = `<!doctype html><html><head><title>Just a moment...</title></head><body>
    <main class="entry-content"><h1>Checking your browser</h1><p>Verify you are human</p></main>
    <script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script>
  </body></html>`;

  await assert.rejects(page.evaluate(parseArtworkPage, { html, sourceUrl }));
  await assert.rejects(page.evaluate(parseArtworkPage, { html, sourceUrl, contentOnly: true }));
});

test("pagination only follows HTTPS NextGEN pages on the same origin and collection path", async () => {
  const result = await parseContent(`
    <nav class="ngg-navigation">
      <a href="?nggpage=2">2</a>
      <a href="?nggpage=2">Duplicado</a>
      <a href="/coleccion/nggallery/page/3">3</a>
      <a href="https://other.example/coleccion/?nggpage=9">Externa</a>
      <a href="http://artist.example/coleccion/?nggpage=9">HTTP</a>
      <a href="/otra-coleccion/?nggpage=9">Otra colección</a>
      <a href="/coleccion/otra/?nggpage=9">Subruta distinta</a>
      <a href="?page=9">Consulta no NextGEN</a>
      <a href="javascript:alert(1)">Script</a>
      <a href="#gallery">Ancla</a>
    </nav>
    <div class="ngg-pagination"><a href="?ngg_page=4">4</a></div>
    <a rel="next" href="?nggpage=5">Siguiente</a>
    <a rel="next" href="/otra-coleccion/?nggpage=6">Siguiente ajeno</a>`);

  assert.deepEqual([...result.paginationUrls].sort(), [
    "https://artist.example/coleccion/?ngg_page=4",
    "https://artist.example/coleccion/?nggpage=2",
    "https://artist.example/coleccion/?nggpage=5",
    "https://artist.example/coleccion/nggallery/page/3",
  ].sort());
});

test("emptyGallery distinguishes explicit empty galleries from a normal collection index", async () => {
  for (const html of [
    '<div class="ngg-galleryoverview"></div>',
    '<figure class="wp-block-gallery"></figure>',
    '<p>No images found.</p>',
    '<p>no se han encontrado im&aacute;genes</p>',
  ]) {
    const result = await parseContent(html);
    assert.deepEqual(result.artworks, [], html);
    assert.equal(result.emptyGallery, true, html);
  }

  const index = await parseContent('<h1>Colecciones</h1><p>Explora las obras.</p><a href="/paisajes/">Paisajes</a>');
  assert.equal(index.emptyGallery, false);
  assert.deepEqual(index.artworks, []);
  assert.deepEqual(index.paginationUrls, []);
  assert.deepEqual(index.collectionLinks, [{ url: "https://artist.example/paisajes/", title: "Paisajes" }]);
});

test("WordPress descriptions stop at headings and gallery boundaries", async () => {
  for (const boundary of ['<h1>Otro tema</h1>', '<h2>Otro tema</h2>', '<div class="ngg-galleryoverview"></div>', '<figure class="wp-block-gallery"></figure>']) {
    const result = await parseContent(`
      <figure class="wp-block-image"><img src="/primera.jpg" alt="Primera"></figure>
      <p>Descripción propia.</p>
      ${boundary}
      <p>Descripción ajena.</p>`);
    assert.equal(result.artworks[0].description, "Descripción propia.", boundary);
  }
});

test("absent metadata uses empty text and nullable string IDs without inventing details", async () => {
  const result = await parseContent('<figure class="wp-block-image"><img src="/Sin-titulo-80x60.jpg"></figure>');
  const [artwork] = result.artworks;

  assert.equal(artwork.title, "Sin-titulo-80x60.jpg");
  assert.equal(artwork.titleSource, "filename");
  for (const field of ["caption", "description", "alt"]) {
    assert.equal(artwork[field], "", field);
  }
  assert.equal(artwork.wordpressMediaId, null);
  assert.equal(artwork.nextgenId, null);
  for (const field of ["imageUrl", "thumbnailUrl", "title", "titleSource", "caption", "description", "alt"]) {
    assert.equal(typeof artwork[field], "string", field);
  }
});

test("collection links include image-based cards while excluding media and duplicate destinations", async () => {
  const result = await parseContent(`
    <figure class="wp-block-image"><a href="/serie-uno/"><img src="/wp-content/uploads/portada.jpg" alt="Serie uno"></a></figure>
    <a href="/serie-uno/">Repetida</a>
    <a href="/wp-content/uploads/imagen-sin-extension">Archivo multimedia</a>
    <a href="/wp-content/gallery/serie/original.jpg?size=large">Imagen</a>`);
  assert.deepEqual(result.collectionLinks, [{ url: "https://artist.example/serie-uno/", title: "Serie uno" }]);
});

test("NextGEN IDs survive pid attributes and query strings even when a thumbnail is absent", async () => {
  const result = await parseContent(`
    <div class="ngg-gallery-thumbnail"><a data-src="/sin-miniatura.jpg" title="Sin miniatura" pid="27"></a></div>
    <div class="ngg-gallery-thumbnail"><a data-src="/segunda.jpg" href="?pid=28"><img src="/miniatura.jpg"></a></div>
    <div class="ngg-gallery-thumbnail-box" data-image-id="29"><div class="ngg-gallery-thumbnail"><a data-src="/tercera.jpg"><img src="/miniatura-3.jpg"></a></div></div>`);
  assert.equal(result.artworks.length, 3);
  assert.deepEqual(result.artworks.map((artwork) => artwork.nextgenId), ["27", "28", "29"]);
  assert.equal(result.artworks[0].thumbnailUrl, "");
  assert.equal(result.artworks[0].title, "Sin miniatura");
});

test("paragraph traversal handles wrappers without crossing the next artwork and ignores hostile base tags", async () => {
  const result = await parseContent(`
    <base href="https://untrusted.example/">
    <section><figure class="wp-block-image"><img src="primera.jpg" alt="Primera"></figure></section>
    <div><p>Una descripción <em>con énfasis</em>.</p><p>Segunda línea.</p></div>
    <div><figure class="wp-block-image"><img src="segunda.jpg" alt="Segunda"></figure><p>Texto de la segunda.</p></div>`);
  assert.equal(result.artworks[0].imageUrl, "https://artist.example/coleccion/primera.jpg");
  assert.equal(result.artworks[0].description, "Una descripción con énfasis.\nSegunda línea.");
  assert.equal(result.artworks[1].description, "Texto de la segunda.");
});
