/** Parse untrusted WordPress markup without inserting it into the live page.
 * Intentionally self-contained: pass this function directly to page.evaluate.
 * Missing textual metadata is '', and missing source IDs are null.
 */
export function parseArtworkPage({ html, sourceUrl, contentOnly = false }) {
  if (typeof html !== 'string') throw new TypeError('WordPress HTML must be a string.');
  const source = new URL(sourceUrl);
  if (!['https:', 'http:'].includes(source.protocol) || source.username || source.password) {
    throw new Error('The source must be a public HTTP(S) URL without credentials.');
  }

  const document = new DOMParser().parseFromString(html, 'text/html');
  const challengeTitle = /^(?:just a moment|attention required|security verification|checking your browser|verify you are human)\b/i;
  if (challengeTitle.test(document.title.trim()) || document.querySelector(
    '#challenge-form, #challenge-running, #cf-challenge-running, [id^="cf-chl-"], script[src*="/cdn-cgi/challenge-platform/"]',
  )) {
    throw new Error('WordPress returned an anti-bot challenge instead of gallery content.');
  }
  const content = contentOnly ? document.body : document.querySelector('.entry-content');
  if (!content) throw new Error('WordPress entry-content is missing; refusing to parse unrelated page markup.');

  // DOMParser's detached HTML document is inert. Never append any of its nodes
  // to the active document; discard executable/non-editorial text as well.
  for (const node of document.querySelectorAll('script, style, template, noscript')) node.remove();

  const gallerySelector = '.ngg-galleryoverview, .ngg-gallery, .ngg-gallery-thumbnail-box, .ngg-gallery-thumbnail, .wp-block-gallery, .gallery';
  const mediaExtension = /\.(?:avif|bmp|gif|heic|ico|jpe?g|png|svg|tiff?|webp|pdf|mp[34]|m4[av]|mov|ogg|wav|webm|zip)$/i;
  const artworks = [];
  const seenArtworks = new Set();

  function clean(value) {
    return String(value ?? '').replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ')
      .split('\n').map((line) => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function text(node) {
    function visit(current) {
      if (current.nodeType === 3) return current.nodeValue ?? '';
      if (current.nodeType !== 1) return '';
      if (['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(current.tagName)) return '';
      if (current.tagName === 'BR') return '\n';
      const value = [...current.childNodes].map(visit).join('');
      return /^(?:P|DIV|LI|BLOCKQUOTE|FIGCAPTION|H[1-6])$/.test(current.tagName) ? `\n${value}\n` : value;
    }
    return node ? clean(visit(node)) : '';
  }

  function attribute(node, name) {
    return clean(node?.getAttribute(name));
  }

  function descriptionAttribute(node) {
    const value = node?.getAttribute('data-description');
    if (!value) return '';
    // NextGEN frequently stores HTML paragraphs encoded inside this attribute.
    return text(new DOMParser().parseFromString(value, 'text/html').body);
  }

  function resolve(value) {
    if (!value?.trim()) return null;
    try {
      const url = new URL(value.trim(), source);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url : null;
    } catch {
      return null;
    }
  }

  function imageSource(image) {
    // Prefer the lazy-loaded source when src is a data URL or placeholder.
    return resolve(attribute(image, 'data-src')) ?? resolve(attribute(image, 'src'));
  }

  function mediaUrl(url) {
    return Boolean(url && (mediaExtension.test(url.pathname) || /\/wp-content\/(?:uploads|gallery)\//i.test(url.pathname)));
  }

  function filename(url) {
    const basename = url.pathname.split('/').filter(Boolean).at(-1) ?? '';
    try { return decodeURIComponent(basename); } catch { return basename; }
  }

  function mediaId(image) {
    return image?.getAttribute('class')?.match(/\bwp-image-(\d+)\b/)?.[1] ?? null;
  }

  function chooseTitle(candidates, imageUrl) {
    const found = candidates.find(([value]) => Boolean(value));
    return found ? { title: found[0], titleSource: found[1] } : { title: filename(imageUrl), titleSource: 'filename' };
  }

  function nextElement(node, skipChildren = false) {
    if (!skipChildren && node.firstElementChild) return node.firstElementChild;
    let current = node;
    while (current && current !== content) {
      if (current.nextElementSibling) return current.nextElementSibling;
      current = current.parentElement;
    }
    return null;
  }

  function followingParagraphs(figure) {
    const paragraphs = [];
    let current = nextElement(figure, true);
    while (current) {
      if (current.matches(`figure, h1, h2, ${gallerySelector}`)) break;
      if (current.matches('p')) {
        const paragraph = text(current);
        if (paragraph) paragraphs.push(paragraph);
        current = nextElement(current, true);
      } else {
        current = nextElement(current);
      }
    }
    return paragraphs.join('\n');
  }

  for (const element of content.querySelectorAll('.ngg-gallery-thumbnail a[data-src], figure.wp-block-image')) {
    const image = element.querySelector('img');
    const nextgen = element.matches('.ngg-gallery-thumbnail a[data-src]');
    if (!image && !nextgen) continue;
    if (!nextgen && element.querySelector('.ngg-gallery-thumbnail')) continue;
    const thumbnail = nextgen
      ? resolve(attribute(element, 'data-thumbnail')) ?? imageSource(image)
      : imageSource(image);
    const linked = resolve(attribute(image?.closest('a'), 'href'));
    const original = nextgen ? resolve(attribute(element, 'data-src')) : mediaUrl(linked) ? linked : imageSource(image);
    if (!original) continue;
    const alt = attribute(image, 'alt');
    const captionElement = nextgen ? null : element.querySelector('figcaption');
    const caption = nextgen ? attribute(element, 'title') || attribute(element, 'data-title') : text(captionElement);
    const quote = caption.match(/^(?:«([^»]+)»|“([^”]+)”|"([^"]+)")/)?.slice(1).find(Boolean) ?? '';
    const title = chooseTitle(nextgen ? [
      [attribute(element, 'data-title'), 'data-title'],
      [attribute(element, 'title'), 'anchor-title'],
      [attribute(image, 'title'), 'image-title'],
      [alt, 'alt'],
    ] : [
      [text(captionElement?.querySelector('strong, b')), 'figcaption-strong'],
      [quote, 'figcaption-quote'],
      [caption, 'figcaption'],
      [attribute(image, 'title'), 'image-title'],
      [alt, 'alt'],
    ], original);
    const nextgenNodes = [element, image, element.closest('.ngg-gallery-thumbnail'), element.closest('.ngg-gallery-thumbnail-box')];
    const nextgenId = nextgen ? nextgenNodes.flatMap((node) => [
      attribute(node, 'data-image-id'), attribute(node, 'data-pid'), attribute(node, 'pid'),
    ]).find(Boolean) || resolve(attribute(element, 'href'))?.searchParams.get('pid') || original.searchParams.get('pid') || null : null;
    const artwork = {
      kind: nextgen ? 'nextgen' : 'wordpress',
      imageUrl: original.href,
      thumbnailUrl: thumbnail?.href ?? '',
      ...title,
      caption,
      description: nextgen ? descriptionAttribute(element) || descriptionAttribute(image) : followingParagraphs(element),
      alt,
      wordpressMediaId: mediaId(image),
      nextgenId,
    };
    const key = JSON.stringify([artwork.kind, artwork.imageUrl, artwork.wordpressMediaId, artwork.nextgenId]);
    if (!seenArtworks.has(key)) {
      artworks.push(artwork);
      seenArtworks.add(key);
    }
  }

  function normalizePath(path) {
    return path.replace(/\/+$/, '') || '/';
  }

  const sourcePath = normalizePath(source.pathname.split(/\/nggallery(?:\/|$)/i)[0]);
  function galleryPagination(url) {
    if (!url || url.protocol !== 'https:' || url.host !== source.host) return false;
    const path = normalizePath(url.pathname);
    const queryPage = ['nggpage', 'ngg_page'].some((key) => Boolean(url.searchParams.get(key)));
    if (path === sourcePath && queryPage) return true;
    const prefix = sourcePath === '/' ? '/nggallery/' : `${sourcePath}/nggallery/`;
    return path.startsWith(prefix) && path.length > prefix.length;
  }

  const paginationUrls = [];
  const seenPagination = new Set();
  for (const anchor of content.querySelectorAll('.ngg-navigation a[href], .ngg-pagination a[href], a[rel~="next"][href]')) {
    const url = resolve(anchor.getAttribute('href'));
    if (!galleryPagination(url)) continue;
    url.hash = '';
    const current = new URL(source);
    current.hash = '';
    if (url.href !== current.href && !seenPagination.has(url.href)) {
      paginationUrls.push(url.href);
      seenPagination.add(url.href);
    }
  }

  const collectionLinks = [];
  const seenCollections = new Set();
  for (const anchor of content.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href')?.trim();
    const url = resolve(href);
    if (!url || href.startsWith('#') || url.origin !== source.origin || mediaUrl(url)
      || anchor.closest(`.ngg-navigation, .ngg-pagination, ${gallerySelector}`)
      || galleryPagination(url) || /\/nggallery(?:\/|$)/i.test(url.pathname)) continue;
    url.hash = '';
    if (url.href === source.href || seenCollections.has(url.href)) continue;
    collectionLinks.push({ url: url.href, title: text(anchor) || attribute(anchor, 'title') || attribute(anchor.querySelector('img'), 'alt') });
    seenCollections.add(url.href);
  }

  const emptyNotice = /\b(?:no (?:images|pictures|photos)(?: were)? found|no hay im[aá]genes|no se han encontrado im[aá]genes|no s['’]han trobat imatges|galer[ií]a vac[ií]a|empty gallery)\b/i.test(text(content));
  return {
    artworks,
    paginationUrls,
    emptyGallery: artworks.length === 0 && Boolean(content.matches(gallerySelector) || content.querySelector(gallerySelector) || emptyNotice),
    collectionLinks,
  };
}
