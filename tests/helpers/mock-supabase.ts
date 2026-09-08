import { test as base, expect, type Page, type Request, type Route } from '@playwright/test';

/** HTTP-only test double. The production React app and Supabase client remain intact.
 * No requests can reach a real Supabase project (or another external service).
 * This models the client protocol, not a proof of the deployed database's RLS.
 */
export const MOCK_SUPABASE_URL = 'https://test-project.supabase.co';
export type MockRow = Record<string, any>;
type MockAsset = { body: Buffer; contentType: string };
type RecordedRequest = { method: string; url: string; body: any };
type Failure = { table?: string; path?: string; method?: string; status?: number; message?: string };
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
    id, slug, title, support_kind, sort_order, cover_image_url, description: 'Paisajes y memoria del Mediterráneo.', is_published: true, source: 'supabase', translations: {},
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
      return this.respond(route, failure.status ?? 500, { message: failure.message ?? 'Fallo simulado de guardado', error: failure.message ?? 'Fallo simulado de guardado', code: 'TEST_FAILURE' });
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

  private async rest(route: Route, url: URL, table: string, method: string, body: any, isAdmin: boolean) {
    let rows = this.state.tables[table].filter((row) => matches(row, url.searchParams));
    if (!isAdmin) rows = rows.filter((row) => row.is_published !== false);
    if (method === 'POST') {
      rows = (Array.isArray(body) ? body : [body]).map((value: MockRow) => {
        const conflict = url.searchParams.get('on_conflict')?.split(',') ?? ['id'];
        const existing = this.state.tables[table].find((row) => conflict.every((column) => value[column] !== undefined && row[column] === value[column]));
        if (existing && route.request().headers().prefer?.includes('resolution=merge-duplicates')) {
          Object.assign(existing, value);
          return existing;
        }
        const row = { id: `test-${table}-${this.nextId++}`, translations: {}, is_published: true, ...value };
        this.state.tables[table].push(row);
        return row;
      });
    } else if (method === 'PATCH') {
      rows.forEach((row) => Object.assign(row, body));
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
