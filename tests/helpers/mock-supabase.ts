import { test as base, expect, type Page, type Request, type Route } from '@playwright/test';

/** HTTP-only test double. The production React app and Supabase client remain intact.
 * No requests can reach a real Supabase project (or another external service).
 * This models the client protocol, not a proof of the deployed database's RLS.
 */
export const MOCK_SUPABASE_URL = 'https://test-project.supabase.co';
export type MockRow = Record<string, any>;
type MockAsset = { body: Buffer; contentType: string };
type RecordedRequest = { method: string; url: string; body: any };
type Failure = { table?: string; path?: string; method?: string; status?: number; message?: string; code?: string };
export type MockBackendState = {
  tables: Record<string, MockRow[]>;
  storage: Record<string, MockAsset>;
  uploads: string[];
  deletedAssets: string[];
};

export function fixtureImage(width = 400, height = 400): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#516975"/><path d="M0 ${height * .65}Q${width * .5} ${height * .22} ${width} ${height * .52}V${height}H0Z" fill="#b59467"/><circle cx="${width * .65}" cy="${height * .3}" r="${Math.min(width, height) * .13}" fill="#ddd3aa"/></svg>`);
}

function createSeed(): MockBackendState {
  const storage: Record<string, MockAsset> = {};
  function asset(bucket: string, name: string, width = 400, height = 400) {
    const path = `${bucket}/fixtures/${name}.svg`;
    storage[path] = { body: fixtureImage(width, height), contentType: 'image/svg+xml' };
    return `${MOCK_SUPABASE_URL}/storage/v1/object/public/${path}`;
  }
  const square = asset('artworks', 'mar-sereno');
  const wide = asset('artworks', 'horizonte-abierto', 660, 360);
  const hidden = asset('artworks', 'obra-reservada');
  const paper = asset('artworks', 'memoria-del-papel', 300, 460);
  const portrait = asset('biography', 'toni-crespo1', 400, 500);
  const secondary = asset('biography', 'toni-crespo2', 500, 360);
  const photo = asset('photography', 'luz-de-mallorca', 600, 400);
  const exhibition = asset('news', 'primavera', 600, 400);
  const interview = asset('news', 'entrevista', 500, 400);
  const collection = (id: string, slug: string, title: string, support_kind: string, sort_order: number, cover_image_url: string | null) => ({
    id, slug, title, support_kind, sort_order, cover_image_url, description: 'Paisajes y memoria del Mediterráneo.', description_alignment: 'justify', is_published: true, source: 'supabase', translations: {},
  });
  const artwork = (id: string, collection_id: string, slug: string, title: string, dimensions: string, image_url: string, width: number, height: number, sort_order: number, is_published = true) => ({
    id, collection_id, slug, title, dimensions, image_url, source_image_url: image_url, thumbnail_url: null, width, height, sort_order, is_published,
    caption: 'Una mirada al Mediterráneo.', description: 'Pigmentos y recuerdos del mar. Una obra original de Toni Crespo.', technique: 'Óleo sobre lienzo', translations: {}, source: 'supabase',
  });
  const poem = 'SOBRE LA PINTURA\n\nTras el caos de los pigmentos\nderramados sobre la mesa,\nlas manos quietas y manchadas\ny los pinceles desgastados,\nquedan los inquietos bisontes\nen la penumbra de la cueva,\nla mirada de la Gioconda\ncustodiando la humanidad,\nla santa y delicada cena\ndesprendiéndose del yeso,\nun fresco pintado en el cielo,\nel Gernika clamando la paz…\ny los valientes trazos de luz\nsobre la oscuridad de los lienzos.\n\nMartin March';
  return {
    storage, uploads: [], deletedAssets: [],
    tables: {
      site_settings: [{ key: 'global', value: { defaultLanguage: 'ca', contact: {
        email: 'studio@example.test', phoneDisplay: '+34 600 111 222', phoneNumber: '34600111222', instagramHandle: '@toni.fixture', instagramUsername: 'toni.fixture',
      } } }],
      site_pages: [
        { id: 'page-home', slug: 'inicio', kind: 'home', title: 'Inicio', html: '<h4>Hay más de una forma de quemar un libro. «El mundo está lleno de personas» que corren con cerillas encendidas.</h4><h4>Ray Bradbury<br/>Fahrenheit 451</h4>', content: {}, translations: {}, is_published: true },
        { id: 'page-biography', slug: 'trayectoria', kind: 'biography', title: 'Trayectoria', html: '<p>Toni Crespo trabaja entre el color y la memoria del Mediterráneo.</p><p>El poeta Martin March acompaña esta trayectoria con una reflexión sobre la pintura.</p>', content: { mainImageUrl: portrait, mainImageAlt: 'Toni Crespo en su taller', poem, galleryImages: [{ url: secondary, alt: 'Toni Crespo trabajando' }] }, translations: {}, is_published: true },
      ],
      collections: [
        collection('collection-canvas', 'horizontes', 'Horizontes', 'canvas', 1, square),
        collection('collection-empty', 'coleccion-vacia', 'Colección vacía', 'canvas', 2, null),
        collection('collection-paper', 'papel', 'Memoria en papel', 'paper', 1, paper),
      ],
      artworks: [
        artwork('artwork-square', 'collection-canvas', 'mar-sereno', 'Mar sereno', '30 × 30 cm', square, 400, 400, 1),
        artwork('artwork-wide', 'collection-canvas', 'horizonte-abierto', 'Horizonte abierto', '220 × 120 cm', wide, 660, 360, 2),
        artwork('artwork-hidden', 'collection-canvas', 'obra-reservada', 'Obra reservada', '60 × 60 cm', hidden, 400, 400, 3, false),
        artwork('artwork-paper', 'collection-paper', 'memoria-del-papel', 'Memoria del papel', '30 × 46 cm', paper, 300, 460, 1),
      ],
      photography_items: [{ id: 'photo-mallorca', slug: 'luz-de-mallorca', title: 'Luz de Mallorca', image_url: photo, image_alt: 'La costa de Mallorca', width: 600, height: 400, sort_order: 1, is_published: true, translations: {} }],
      news_items: [
        { id: 'news-exhibition', slug: 'exposicion-de-primavera', title: 'Exposición de primavera', published_at: '2026-05-12', date_text: null, category: 'exposicion', location: 'Palma', description: 'Pintura y luz en Mallorca.', external_url: 'https://example.test/exposicion', image_url: exhibition, image_alt: 'Sala de exposición', sort_order: 1, is_published: true, translations: {} },
        { id: 'news-press', slug: 'entrevista-en-el-taller', title: 'Entrevista en el taller', published_at: '2025-10-04', date_text: null, category: 'entrevista', location: 'Sóller', description: 'Conversamos sobre pigmentos y paisajes.', external_url: 'https://example.test/entrevista', image_url: interview, image_alt: 'Conversación en el taller', sort_order: 2, is_published: true, translations: {} },
      ],
      news_item_images: [
        { id: 'news-image-1', news_item_id: 'news-exhibition', image_url: exhibition, image_alt: 'Sala de exposición', caption: null, sort_order: 1, is_primary: true, translations: {} },
        { id: 'news-image-2', news_item_id: 'news-press', image_url: interview, image_alt: 'Conversación en el taller', caption: null, sort_order: 1, is_primary: true, translations: {} },
      ],
    },
  };
}

export class MockSupabaseBackend {
  state = createSeed();
  requests: RecordedRequest[] = [];
  blockedRequests: string[] = [];
  unhandledRequests: string[] = [];
  readonly admin = { email: 'admin@example.test', password: 'Local-test-only!73pQ' };
  readonly nonAdmin = { email: 'visitor@example.test', password: 'Local-visitor-only!73pQ' };
  private failures: Failure[] = [];
  private nextId = 1;

  reset() {
    this.state = createSeed();
    this.requests = [];
    this.blockedRequests = [];
    this.unhandledRequests = [];
    this.failures = [];
    this.nextId = 1;
  }

  failNext(failure: Failure) { this.failures.push(failure); }

  /** Opt-in migration-shaped fixture. Existing suites keep their legacy seed
   * and can still verify missing-field compatibility without extra collections.
   */
  enableContentManagerFixture() {
    for (const support of ['canvas', 'paper'] as const) {
      if (this.state.tables.collections.some((row) => row.support_kind === support && row.is_recent === true)) continue;
      const template = this.state.tables.collections.find((row) => row.support_kind === support)!;
      this.state.tables.collections.push({
        ...structuredClone(template), id: `collection-recent-${support}`, slug: `obras-recientes-${support === 'canvas' ? 'lienzos' : 'papel'}`, title: 'Obras recientes',
        description: '', is_recent: true, is_published: true, cover_image_url: null,
        translations: { ca: { title: 'Obres recents' }, en: { title: 'Recent works' }, de: { title: 'Aktuelle Werke' } },
        // A high old sort order makes tests prove pinning is semantic, not an
        // accident of the initial rows or of a hardcoded numeric sort order.
        sort_order: 100,
      });
    }
  }

  async signIn(page: Page, role: 'admin' | 'nonAdmin' = 'admin') {
    if (page.url() === 'about:blank') await page.goto('/');
    await page.getByRole('button', { name: 'Edición web', exact: true }).click();
    await page.getByLabel('Email admin').fill(this[role].email);
    await page.getByLabel('Contraseña', { exact: true }).fill(this[role].password);
    await page.getByRole('button', { name: 'Entrar en modo edición', exact: true }).click();
    if (role === 'admin') await expect(page.getByRole('button', { name: 'Salir de edición', exact: true })).toBeVisible();
  }

  private user(role: 'admin' | 'nonAdmin') {
    return { id: `user-${role}`, aud: 'authenticated', role: 'authenticated', email: this[role].email, email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
  }

  private session(role: 'admin' | 'nonAdmin') {
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ sub: `user-${role}`, role: 'authenticated', mock_role: role, aud: 'authenticated', iat: now, exp: now + 3600 })).toString('base64url');
    return { access_token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.local-test-signature`, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: `mock-refresh-${role}`, user: this.user(role) };
  }

  private role(request: Request): 'admin' | 'nonAdmin' | null {
    try {
      const token = request.headers().authorization?.replace(/^Bearer /i, '') ?? '';
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      return payload.mock_role === 'admin' || payload.mock_role === 'nonAdmin' ? payload.mock_role : null;
    } catch { return null; }
  }

  async handle(route: Route, appOrigin: string) {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === appOrigin) return route.continue();
    if (url.origin !== MOCK_SUPABASE_URL) {
      this.blockedRequests.push(request.url());
      return route.abort('blockedbyclient');
    }
    const method = request.method();
    if (method === 'OPTIONS') return this.respond(route, 204);
    let body: any = null;
    try { body = request.postDataJSON(); } catch { body = request.postData(); }
    this.requests.push({ method, url: request.url(), body });
    const table = url.pathname.startsWith('/rest/v1/') ? url.pathname.split('/')[3] : undefined;
    const failedIndex = this.failures.findIndex((failure) => (!failure.table || failure.table === table) && (!failure.path || url.pathname.includes(failure.path)) && (!failure.method || failure.method.toUpperCase() === method));
    if (failedIndex >= 0) {
      const failure = this.failures.splice(failedIndex, 1)[0];
      return this.respond(route, failure.status ?? 500, { message: failure.message ?? 'Fallo simulado de guardado', error: failure.message ?? 'Fallo simulado de guardado', code: failure.code ?? 'TEST_FAILURE' });
    }
    const role = this.role(request);
    if (url.pathname === '/auth/v1/token' && method === 'POST') {
      const credentialRole = (['admin', 'nonAdmin'] as const).find((candidate) => body?.email === this[candidate].email && body?.password === this[candidate].password);
      const refreshRole = body?.refresh_token === 'mock-refresh-admin' ? 'admin' : body?.refresh_token === 'mock-refresh-nonAdmin' ? 'nonAdmin' : null;
      const authenticatedRole = url.searchParams.get('grant_type') === 'refresh_token' ? refreshRole : credentialRole;
      return authenticatedRole ? this.respond(route, 200, this.session(authenticatedRole)) : this.respond(route, 400, { code: 'invalid_credentials', msg: 'Invalid login credentials', error: 'invalid_grant', error_description: 'Invalid login credentials' });
    }
    if (url.pathname === '/auth/v1/logout') return this.respond(route, 204);
    if (url.pathname === '/auth/v1/user') return role ? this.respond(route, 200, this.user(role)) : this.respond(route, 401, { message: 'No authenticated user' });
    if (url.pathname === '/rest/v1/rpc/is_admin') return this.respond(route, 200, role === 'admin');
    if (url.pathname === '/rest/v1/rpc/save_news_item' && method === 'POST') {
      if (role !== 'admin') return this.respond(route, 403, { code: '42501', message: 'NEWS_EDIT_FORBIDDEN' });
      return this.saveNewsItem(route, body);
    }
    if (url.pathname === '/rest/v1/rpc/reorganize_artworks' && method === 'POST') {
      if (role !== 'admin') return this.denied(route);
      return this.reorganizeArtworks(route, body);
    }
    if (url.pathname === '/rest/v1/rpc/delete_empty_collection' && method === 'POST') {
      if (role !== 'admin') return this.denied(route);
      const collection = this.state.tables.collections.find((row) => row.id === body?.target_collection_id);
      if (!collection) return this.respond(route, 400, { code: 'P0002', message: 'COLLECTION_NOT_FOUND' });
      if (collection.is_recent) return this.respond(route, 400, { code: '23514', message: 'RECENT_COLLECTION_PROTECTED' });
      if (this.state.tables.artworks.some((row) => row.collection_id === collection.id)) return this.respond(route, 400, { code: '23514', message: 'COLLECTION_NOT_EMPTY' });
      this.state.tables.collections = this.state.tables.collections.filter((row) => row.id !== collection.id);
      return this.respond(route, 200, null);
    }
    if (url.pathname === '/rest/v1/rpc/delete_artwork_with_cover_refresh' && method === 'POST') {
      if (role !== 'admin') return this.denied(route);
      const artwork = this.state.tables.artworks.find((row) => row.id === body.target_artwork_id);
      this.state.tables.artworks = this.state.tables.artworks.filter((row) => row.id !== body.target_artwork_id);
      if (artwork) {
        const collection = this.state.tables.collections.find((row) => row.id === artwork.collection_id);
        if (collection) collection.cover_image_url = this.state.tables.artworks.filter((row) => row.collection_id === artwork.collection_id && row.is_published).sort((a, b) => a.sort_order - b.sort_order)[0]?.image_url ?? null;
      }
      return this.respond(route, 200, null);
    }
    if (url.pathname.startsWith('/storage/v1/object/public/') && method === 'GET') {
      const key = decodeURIComponent(url.pathname.slice('/storage/v1/object/public/'.length));
      const asset = this.state.storage[key];
      return asset ? route.fulfill({ status: 200, contentType: asset.contentType, body: asset.body, headers: { 'access-control-allow-origin': '*' } }) : this.respond(route, 404, { message: 'Object not found' });
    }
    if (url.pathname.startsWith('/storage/v1/object/')) {
      if (role !== 'admin') return this.denied(route);
      const key = decodeURIComponent(url.pathname.slice('/storage/v1/object/'.length));
      if (method === 'POST' || method === 'PUT') {
        // Image dimensions are measured from the real File in the UI. A locally
        // generated SVG lets subsequent Storage GETs remain visible and offline.
        this.state.storage[key] = { body: fixtureImage(), contentType: 'image/svg+xml' };
        this.state.uploads.push(key);
        return this.respond(route, 200, { Key: key, Id: `asset-${this.nextId++}` });
      }
      if (method === 'DELETE') {
        const removed = (body?.prefixes ?? []).map((path: string) => {
          const fullPath = `${key}/${path}`;
          delete this.state.storage[fullPath];
          this.state.deletedAssets.push(fullPath);
          return { name: path, bucket_id: key };
        });
        return this.respond(route, 200, removed);
      }
    }
    if (table && this.state.tables[table]) {
      if (method !== 'GET' && method !== 'HEAD' && role !== 'admin') return this.denied(route);
      return this.rest(route, url, table, method, body, role === 'admin');
    }
    this.unhandledRequests.push(`${method} ${url.pathname}`);
    return this.respond(route, 501, { message: `Unhandled local test endpoint: ${method} ${url.pathname}` });
  }

  /** HTTP protocol model only: real transactional/RLS guarantees are covered by
   * the separate PostgreSQL suite, never established by a browser test double.
   */
  private saveNewsItem(route: Route, body: any) {
    const invalid = () => this.respond(route, 400, { code: '22023', message: 'NEWS_INVALID_INPUT' });
    const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
    const safeUrl = (value: any) => {
      if (typeof value !== 'string' || /[\\\u0000-\u001f\u007f]/.test(value) || !/^https?:\/\//i.test(value)) return false;
      try { const url = new URL(value); return Boolean(url.hostname) && !url.username && !url.password; } catch { return false; }
    };
    const data = body?.news_data;
    const images = body?.image_items;
    const id = body?.target_news_id;
    const existing = id == null ? undefined : this.state.tables.news_items.find((row) => row.id === id);
    if (id != null && !existing) return this.respond(route, 400, { code: 'P0002', message: 'NEWS_NOT_FOUND' });
    if (!object(data) || typeof data.title !== 'string' || !data.title.trim()
      || !['exposicion', 'premio', 'entrevista', 'publicacion', 'evento', 'television'].includes(data.category)
      || !object(data.translations) || typeof data.image_alt !== 'string'
      || (data.external_url != null && data.external_url !== '' && !safeUrl(data.external_url))
      || (images !== null && !Array.isArray(images))
      || (!existing && (typeof data.slug !== 'string' || !data.slug.trim()))) return invalid();
    if (data.published_at != null && (typeof data.published_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.published_at)
      || Number.isNaN(Date.parse(data.published_at)) || new Date(data.published_at).toISOString().slice(0, 10) !== data.published_at)) return invalid();
    if (Array.isArray(images) && images.some((entry) => !object(entry) || !safeUrl(entry.image_url)
      || (entry.caption != null && typeof entry.caption !== 'string') || !object(entry.translations))) return invalid();

    // Build replacements before committing either table; metadata and visibility
    // not exposed by this editor remain untouched on updates.
    const newsId = existing?.id ?? `test-news-${this.nextId++}`;
    let slug = existing?.slug ?? data.slug.trim();
    if (!existing) {
      let suffix = 2;
      while (this.state.tables.news_items.some((row) => row.slug === slug)) slug = `${data.slug.trim()}-${suffix++}`;
    }
    const row: MockRow = { ...(existing ?? { id: newsId, slug, sort_order: Math.max(0, ...this.state.tables.news_items.map((entry) => entry.sort_order ?? 0)) + 1, is_published: true }),
      title: data.title.trim(), published_at: data.published_at ?? null, date_text: data.date_text ?? null, category: data.category,
      location: data.location ?? null, description: data.description ?? null, external_url: data.external_url || null,
      image_alt: data.image_alt.trim() || data.title.trim(), translations: structuredClone(data.translations), updated_at: new Date().toISOString() };
    const gallery = images === null
      ? this.state.tables.news_item_images.filter((entry) => entry.news_item_id === newsId).map((entry) => ({ ...entry, image_alt: row.image_alt }))
      : images.map((entry: MockRow, index: number) => ({ id: `test-news-image-${this.nextId++}`, news_item_id: newsId,
        image_url: entry.image_url, image_alt: row.image_alt, caption: entry.caption ?? null, translations: structuredClone(entry.translations), sort_order: index, is_primary: index === 0 }));
    if (images !== null) row.image_url = gallery[0]?.image_url ?? null;
    this.state.tables.news_items = [...this.state.tables.news_items.filter((entry) => entry.id !== newsId), row];
    this.state.tables.news_item_images = [...this.state.tables.news_item_images.filter((entry) => entry.news_item_id !== newsId), ...gallery];
    return this.respond(route, 200, newsId);
  }

  /** Protocol model of the atomic RPC, not an implementation/proof of SQL locks or RLS.
   * Fixture IDs are intentionally opaque strings instead of production UUIDs.
   * Validate every affected collection before replacing either table.
   */
  private reorganizeArtworks(route: Route, body: any) {
    const invalid = () => this.respond(route, 400, { code: '22023', message: 'Invalid organization payload' });
    const conflict = () => this.respond(route, 500, { code: '40001', message: 'ORGANIZATION_CONFLICT: artworks changed' });
    const expected = body?.expected_state;
    const next = body?.next_state;
    if (!Array.isArray(expected) || !Array.isArray(next)) return invalid();
    if (expected.some((collection) => !collection || typeof collection.id !== 'string' || !Array.isArray(collection.artworks)
      || collection.artworks.some((artwork: any) => !artwork || typeof artwork.id !== 'string' || !Number.isInteger(artwork.sort_order)))
      || next.some((collection) => !collection || typeof collection.id !== 'string' || !Array.isArray(collection.artwork_ids)
        || collection.artwork_ids.some((id: any) => typeof id !== 'string'))) return invalid();
    const sameIds = (first: string[], second: string[]) => JSON.stringify([...first].sort()) === JSON.stringify([...second].sort());
    const collectionIds = expected.map((collection) => collection.id);
    if (new Set(collectionIds).size !== collectionIds.length || !sameIds(collectionIds, next.map((collection) => collection.id))) return invalid();
    const expectedIds = expected.flatMap((collection) => collection.artworks.map((artwork: any) => artwork.id));
    const nextIds = next.flatMap((collection) => collection.artwork_ids);
    if (new Set(expectedIds).size !== expectedIds.length || !sameIds(expectedIds, nextIds)) return invalid();
    if (!collectionIds.length) return this.respond(route, 200, null);
    const snapshot = (artworks: MockRow[]) => artworks.map(({ id, sort_order }) => ({ id, sort_order })).sort((a, b) => a.id.localeCompare(b.id));
    for (const collection of expected) {
      if (!this.state.tables.collections.some((row) => row.id === collection.id)) return conflict();
      const actual = this.state.tables.artworks.filter((row) => row.collection_id === collection.id);
      if (JSON.stringify(snapshot(actual)) !== JSON.stringify(snapshot(collection.artworks))) return conflict();
    }

    const artworks = structuredClone(this.state.tables.artworks);
    const collections = structuredClone(this.state.tables.collections);
    const positions = new Map<string, { collectionId: string; index: number }>();
    next.forEach((collection) => collection.artwork_ids.forEach((id: string, index: number) => positions.set(id, { collectionId: collection.id, index })));
    for (const row of artworks) {
      const target = positions.get(row.id);
      if (!target || target.collectionId === row.collection_id) continue;
      const from = collections.find((collection) => collection.id === row.collection_id)!;
      const to = collections.find((collection) => collection.id === target.collectionId)!;
      if (from.support_kind !== to.support_kind) return this.respond(route, 400, { code: '23514', message: 'ARTWORK_BRANCH_MISMATCH' });
    }
    const moved = artworks.filter((row) => positions.has(row.id) && positions.get(row.id)!.collectionId !== row.collection_id)
      .map((row) => ({ id: row.id as string, slug: row.slug as string })).sort((a, b) => a.id.localeCompare(b.id));
    const timestamp = new Date().toISOString();
    // Release all moving slugs first, matching swaps handled by the transaction.
    moved.forEach(({ id }) => { artworks.find((row) => row.id === id)!.slug = `__local_organizer_${id}`; });
    for (const moving of moved) {
      const row = artworks.find((artwork) => artwork.id === moving.id)!;
      const destination = positions.get(row.id)!.collectionId;
      let slug = moving.slug;
      let suffix = 0;
      while (artworks.some((artwork) => artwork.id !== row.id && artwork.collection_id === destination && artwork.slug === slug)) {
        suffix += 1;
        slug = `${moving.slug}-${moving.id}${suffix === 1 ? '' : `-${suffix}`}`;
      }
      Object.assign(row, { collection_id: destination, slug, updated_at: timestamp });
    }
    for (const row of artworks) {
      const position = positions.get(row.id);
      if (position && row.sort_order !== position.index) Object.assign(row, { sort_order: position.index, updated_at: timestamp });
    }
    for (const collection of collections) {
      if (!collectionIds.includes(collection.id)) continue;
      const firstVisible = artworks.filter((row) => row.collection_id === collection.id && row.is_published)
        .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))[0];
      Object.assign(collection, { cover_image_url: firstVisible?.image_url ?? null, updated_at: timestamp });
      if (collection.is_recent) collection.sort_order = -1;
    }
    this.state.tables.artworks = artworks;
    this.state.tables.collections = collections;
    return this.respond(route, 200, null);
  }

  private async rest(route: Route, url: URL, table: string, method: string, body: any, isAdmin: boolean) {
    let rows = this.state.tables[table].filter((row) => matches(row, url.searchParams));
    if (!isAdmin) rows = rows.filter((row) => row.is_published !== false);
    if (!isAdmin && table === 'artworks') rows = rows.filter((row) => this.state.tables.collections
      .some((collection) => collection.id === row.collection_id && collection.is_published !== false));
    if (['collections', 'artworks'].includes(table) && ['POST', 'PATCH', 'DELETE'].includes(method)) {
      const changes: Array<{ before?: MockRow; after?: MockRow }> = method === 'POST'
        ? (Array.isArray(body) ? body : [body]).map((value: MockRow, index: number) => {
          const conflict = url.searchParams.get('on_conflict')?.split(',') ?? ['id'];
          const before = route.request().headers().prefer?.includes('resolution=merge-duplicates')
            ? this.state.tables[table].find((row) => conflict.every((column) => value[column] !== undefined && row[column] === value[column])) : undefined;
          return { before, after: { id: `pending-${index}`, ...(table === 'collections' ? { is_recent: false, description_alignment: 'justify' } : { is_available: true }), ...before, ...value } };
        })
        : rows.map((before) => ({ before, after: method === 'DELETE' ? undefined : { ...before, ...body } }));
      const failure = this.catalogConstraintError(table, changes);
      if (failure) return this.respond(route, failure.code === '23505' ? 409 : 400, failure);
    }
    if (method === 'POST') {
      rows = (Array.isArray(body) ? body : [body]).map((value: MockRow) => {
        const conflict = url.searchParams.get('on_conflict')?.split(',') ?? ['id'];
        const existing = this.state.tables[table].find((row) => conflict.every((column) => value[column] !== undefined && row[column] === value[column]));
        if (existing && route.request().headers().prefer?.includes('resolution=merge-duplicates')) {
          Object.assign(existing, value);
          if (table === 'collections' && existing.is_recent) existing.sort_order = -1;
          return existing;
        }
        const row: MockRow = { id: `test-${table}-${this.nextId++}`, translations: {}, is_published: true,
          ...(table === 'collections' ? { is_recent: false, description_alignment: 'justify' } : table === 'artworks' ? { is_available: true } : {}), ...value };
        if (table === 'collections' && row.is_recent) row.sort_order = -1;
        this.state.tables[table].push(row);
        return row;
      });
    } else if (method === 'PATCH') {
      rows.forEach((row) => {
        Object.assign(row, body);
        if (table === 'collections' && row.is_recent) row.sort_order = -1;
      });
    } else if (method === 'DELETE') {
      const ids = new Set(rows.map((row) => row.id));
      this.state.tables[table] = this.state.tables[table].filter((row) => !ids.has(row.id));
      if (table === 'collections') this.state.tables.artworks = this.state.tables.artworks.filter((row) => !ids.has(row.collection_id));
      if (table === 'news_items') this.state.tables.news_item_images = this.state.tables.news_item_images.filter((row) => !ids.has(row.news_item_id));
    }
    const orders = url.searchParams.get('order')?.split(',') ?? [];
    rows = [...rows].sort((a, b) => {
      for (const order of orders) {
        const [column, direction] = order.split('.');
        if (a[column] === b[column]) continue;
        if (a[column] == null) return 1;
        if (b[column] == null) return -1;
        const result = a[column] < b[column] ? -1 : 1;
        return direction === 'desc' ? -result : result;
      }
      return 0;
    });
    const limit = Number(url.searchParams.get('limit') ?? rows.length);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    rows = rows.slice(offset, offset + limit).map((row) => {
      const joined = { ...row };
      if (table === 'collections' && url.searchParams.get('select')?.includes('artworks(')) joined.artworks = this.state.tables.artworks.filter((artwork) => artwork.collection_id === row.id && (isAdmin || artwork.is_published)).sort((a, b) => a.sort_order - b.sort_order);
      if (table === 'news_items' && url.searchParams.get('select')?.includes('news_item_images(')) joined.news_item_images = this.state.tables.news_item_images.filter((image) => image.news_item_id === row.id);
      return joined;
    });
    const returnsRows = method === 'GET' || method === 'HEAD' || route.request().headers().prefer?.includes('return=representation');
    if (!returnsRows) return this.respond(route, method === 'POST' ? 201 : 204);
    const single = route.request().headers().accept?.includes('application/vnd.pgrst.object+json');
    if (single && rows.length !== 1) return this.respond(route, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows` });
    return this.respond(route, method === 'POST' ? 201 : 200, single ? rows[0] : rows);
  }

  private catalogConstraintError(table: string, changes: Array<{ before?: MockRow; after?: MockRow }>): { code: string; message: string } | null {
    for (const { before, after } of changes) {
      if (table === 'collections') {
        if (after && Object.hasOwn(after, 'description_alignment')) {
          if (after.description_alignment == null) return { code: '23502', message: 'null value in column "description_alignment" violates not-null constraint' };
          if (!['justify', 'center'].includes(after.description_alignment)) return { code: '23514', message: 'new row violates check constraint "collections_description_alignment_check"' };
        }
        if (before && after && before.support_kind !== after.support_kind) return { code: '23514', message: 'COLLECTION_BRANCH_IMMUTABLE' };
        if (before && after && Boolean(before.is_recent) !== Boolean(after.is_recent)) return { code: '23514', message: 'RECENT_COLLECTION_PROTECTED' };
        if (before?.is_recent) {
          if (!after || ['id', 'title', 'slug', 'source', 'is_recent'].some((key) => before[key] !== after[key])) {
            return { code: '23514', message: 'RECENT_COLLECTION_PROTECTED' };
          }
          const languages = new Set([...Object.keys(before.translations ?? {}), ...Object.keys(after.translations ?? {})]);
          if ([...languages].some((language) => (before.translations?.[language]?.title ?? null) !== (after.translations?.[language]?.title ?? null))) {
            return { code: '23514', message: 'RECENT_COLLECTION_PROTECTED' };
          }
        }
      }
      if (table === 'artworks' && after) {
        const target = this.state.tables.collections.find((row) => row.id === after.collection_id);
        if (!target) return { code: '23503', message: 'Artwork collection does not exist' };
        if (before && before.collection_id !== after.collection_id) {
          const source = this.state.tables.collections.find((row) => row.id === before.collection_id);
          if (source?.support_kind !== target.support_kind) return { code: '23514', message: 'ARTWORK_BRANCH_MISMATCH' };
        }
      }
    }
    if (table === 'collections') {
      const replacedIds = new Set(changes.map(({ before }) => before?.id).filter(Boolean));
      const prospective = [...this.state.tables.collections.filter((row) => !replacedIds.has(row.id)), ...changes.flatMap(({ after }) => after ? [after] : [])];
      const recentBranches = prospective.filter((row) => row.is_recent).map((row) => row.support_kind);
      if (new Set(recentBranches).size !== recentBranches.length) return { code: '23505', message: 'Only one recent collection is allowed per support branch' };
    }
    return null;
  }

  private denied(route: Route) { return this.respond(route, 403, { code: '42501', message: 'new row violates row-level security policy' }); }
  private respond(route: Route, status: number, json?: any) {
    return route.fulfill({ status, ...(status === 204 ? {} : { contentType: 'application/json', body: JSON.stringify(json ?? null) }), headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' } });
  }
}

function matches(row: MockRow, parameters: URLSearchParams): boolean {
  for (const [column, condition] of parameters) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(column) || column.includes('.')) continue;
    const separator = condition.indexOf('.');
    const operator = condition.slice(0, separator);
    const value = condition.slice(separator + 1);
    if (operator === 'eq' && String(row[column]) !== value) return false;
    if (operator === 'neq' && String(row[column]) === value) return false;
    if (operator === 'is' && value === 'null' && row[column] != null) return false;
    if (operator === 'like' || operator === 'ilike') {
      const pattern = value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*');
      if (!new RegExp(`^${pattern}$`, operator === 'ilike' ? 'i' : '').test(String(row[column]))) return false;
    }
    if (operator === 'in' && !value.slice(1, -1).split(',').includes(String(row[column]))) return false;
  }
  return true;
}

export const test = base.extend<{ backend: MockSupabaseBackend }>({
  backend: async ({}, use) => {
    const backend = new MockSupabaseBackend();
    await use(backend);
    expect(backend.unhandledRequests, 'Every mock Supabase endpoint must have an explicit handler').toEqual([]);
  },
  page: async ({ context, baseURL, backend }, use) => {
    if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Browser tests require a localhost baseURL.');
    await context.route('**/*', (route) => backend.handle(route, new URL(baseURL).origin));
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await use(page);
    expect(pageErrors, 'The real app must not throw uncaught browser errors').toEqual([]);
    await page.close();
  },
});

export { expect };
