import assert from "node:assert/strict";

// Called by the isolated PostgreSQL runner: never opens a remote connection.
export async function runNewsSqlTests({ sql, identity, quoted, json, migrationSql, liveRollbackSql }) {
  let passed = 0;
  const id = "50000000-0000-4000-8000-000000000001";
  const unrelatedId = "50000000-0000-4000-8000-000000000002";
  const metadata = { title: "Updated news", published_at: "2026-09-13", date_text: "Septiembre", category: "exposicion", location: "Mallorca",
    description: "First paragraph.\n\nSecond paragraph.", external_url: "https://example.test/news?q=art#gallery", image_alt: "Shared alternative text",
    translations: { ca: { title: "Notícia", description: "Primer paràgraf.\n\nSegon paràgraf." } } };
  const gallery = [
    { image_url: "https://example.test/second.jpg", caption: "  Second photo.\nNext line.  ", translations: { en: { alt: "Second", caption: "English caption" } } },
    { image_url: "https://example.test/new.jpg", caption: null, translations: {} },
  ];
  const call = (target = id, data = metadata, images = gallery) =>
    `select public.save_news_item(${target === null ? "null" : quoted(target)}::uuid, ${json(data)}, ${images === null ? "null" : json(images)});`;
  const snapshot = () => sql(`select jsonb_build_object(
    'news', coalesce((select jsonb_agg(to_jsonb(n) order by id) from public.news_items n), '[]'::jsonb),
    'images', coalesce((select jsonb_agg(to_jsonb(i) order by news_item_id, sort_order, id) from public.news_item_images i), '[]'::jsonb),
    'storage', coalesce((select jsonb_agg(to_jsonb(o) order by id) from storage.objects o), '[]'::jsonb));`);
  const rows = async () => JSON.parse(await snapshot());
  async function seed() {
    await sql(`delete from public.news_items;
      insert into public.news_items(id, slug, title, published_at, image_url, image_alt, sort_order, is_published, translations)
      values ('${id}', 'existing-news', 'Existing news', '2020-01-15', 'https://example.test/first.jpg', 'Original alt', 37, false, '{"en":{"title":"Original title"}}'),
        ('${unrelatedId}', 'unrelated-news', 'Unrelated news', null, null, null, 90, true, '{}');
      insert into public.news_item_images(news_item_id, image_url, image_alt, caption, translations, sort_order, is_primary)
      values ('${id}', 'https://example.test/first.jpg', 'First alt', 'First caption', '{"ca":{"caption":"Peu original"}}', 7, true),
        ('${id}', 'https://example.test/second.jpg', 'Second alt', 'Second caption', '{}', 20, false);`);
  }
  async function check(name, operation) {
    await seed();
    await operation();
    console.log(`✓ ${name}`);
    passed += 1;
  }
  async function rejects(statement, pattern) {
    const before = await snapshot();
    await assert.rejects(sql(statement), pattern);
    assert.equal(await snapshot(), before, "Every news row, gallery reference and Storage object must remain unchanged on failure");
  }
  const returnedId = result => result.split("\n").at(-1);

  await check("news create commits metadata, ordered images, captions, translations, primary image and shared alt together", async () => {
    const previous = await rows();
    const created = returnedId(await sql(`${identity()} ${call(null, { ...metadata, slug: "existing-news" })}`));
    const current = await rows();
    const news = current.news.find(row => row.id === created);
    assert.ok(news);
    for (const [key, value] of Object.entries(metadata)) assert.deepEqual(news[key], value);
    assert.equal(news.slug, "existing-news-2");
    assert.equal(news.sort_order, 91);
    assert.equal(news.is_published, true);
    assert.equal(news.image_url, gallery[0].image_url);
    const savedImages = current.images.filter(row => row.news_item_id === created);
    assert.deepEqual(savedImages.map(row => row.sort_order), [0, 1]);
    assert.deepEqual(savedImages.map(row => row.is_primary), [true, false]);
    assert.deepEqual(savedImages.map(({ image_url, caption, translations }) => ({ image_url, caption, translations })), gallery);
    assert.ok(savedImages.every(row => row.image_alt === metadata.image_alt));
    assert.deepEqual(current.news.filter(row => row.id !== created), previous.news);
    assert.deepEqual(current.images.filter(row => row.news_item_id !== created), previous.images);
    assert.deepEqual(current.storage, previous.storage);
  });

  await check("news metadata-only edit preserves gallery IDs, ordering, captions and translations while synchronizing shared alt", async () => {
    const before = await rows();
    assert.equal(returnedId(await sql(`${identity()} ${call(id, metadata, null)}`)), id);
    const current = await rows();
    const news = current.news.find(row => row.id === id);
    const previous = before.news.find(row => row.id === id);
    assert.deepEqual(news, { ...previous, ...metadata, updated_at: news.updated_at });
    assert.deepEqual(current.images, before.images.map(image => ({ ...image, image_alt: metadata.image_alt })));
    assert.deepEqual(current.news.find(row => row.id === unrelatedId), before.news.find(row => row.id === unrelatedId));
    assert.equal(await sql(`set role anon; select count(*) from public.news_items where id = '${id}'; select count(*) from public.news_item_images where news_item_id = '${id}';`), "SET\n0\n0");
  });

  await check("news gallery replacement can reorder, remove and add without changing publication, slug, creation or sort position", async () => {
    const before = await rows();
    await sql(`${identity()} ${call()}`);
    const after = await rows();
    const news = after.news.find(row => row.id === id);
    assert.deepEqual(news, { ...before.news.find(row => row.id === id), ...metadata, image_url: gallery[0].image_url, updated_at: news.updated_at });
    assert.deepEqual(after.images.map(({ image_url, caption, translations }) => ({ image_url, caption, translations })), gallery);
    assert.deepEqual(after.images.map(row => row.sort_order), [0, 1]);
    assert.deepEqual(after.images.map(row => row.is_primary), [true, false]);
    assert.deepEqual(after.storage, before.storage);
    await sql(`${identity()} update public.news_items set is_published = true where id = '${id}';`);
    assert.equal(await sql(`set role anon; select count(*) from public.news_item_images where news_item_id = '${id}';`), "SET\n2");
  });

  await check("news can remove every image, add again, or be created without any gallery", async () => {
    await sql(`${identity()} ${call(id, metadata, [])}`);
    let current = await rows();
    assert.equal(current.news.find(row => row.id === id).image_url, null);
    assert.equal(current.images.length, 0);
    await sql(`${identity()} ${call(id, metadata, [gallery[1]])}`);
    current = await rows();
    assert.equal(current.news.find(row => row.id === id).image_url, gallery[1].image_url);
    assert.equal(current.images.length, 1);
    assert.equal(current.images[0].is_primary, true);
    for (const images of [null, []]) {
      const created = returnedId(await sql(`${identity()} ${call(null, { ...metadata, published_at: null, slug: "no-images" }, images)}`));
      current = await rows();
      assert.equal(current.news.find(row => row.id === created).image_url, null);
      assert.equal(current.news.find(row => row.id === created).published_at, null);
      assert.equal(current.images.filter(row => row.news_item_id === created).length, 0);
    }
  });

  await check("news dates remain calendar dates in negative UTC offsets and valid leap days are accepted", async () => {
    const created = returnedId(await sql(`set time zone 'America/Los_Angeles'; ${identity()} ${call(null, { ...metadata, published_at: "2024-02-29", slug: "leap-day" })}`));
    assert.equal((await rows()).news.find(row => row.id === created).published_at, "2024-02-29");
    await sql(`set time zone 'America/Los_Angeles'; ${identity()} ${call(id, metadata, null)}`);
    assert.equal((await rows()).news.find(row => row.id === id).published_at, "2026-09-13");
  });

  await check("news RPC denies anonymous, non-admin and missing-identity callers without any writes", async () => {
    await rejects(`set role anon; ${call()}`, /permission denied for function save_news_item/);
    await rejects(`${identity("reader@example.test")} ${call()}`, /NEWS_EDIT_FORBIDDEN/);
    await rejects(`${identity("admin@example.test", null)} ${call()}`, /NEWS_EDIT_FORBIDDEN/);
    await rejects(`${identity("reader@example.test")} ${call(null, { ...metadata, slug: "forbidden" })}`, /NEWS_EDIT_FORBIDDEN/);
  });

  await check("news invalid metadata, URLs, galleries and unknown updates fail atomically", async () => {
    const invalidMetadata = [
      null, [], {}, { ...metadata, title: "" }, { ...metadata, title: " \n\t " }, { ...metadata, title: null }, { ...metadata, category: "invalid" },
      { ...metadata, published_at: "2026-02-30" }, { ...metadata, published_at: "0000-01-01" }, { ...metadata, published_at: "2026-09-13T00:00:00Z" },
      { ...metadata, external_url: "javascript:alert(1)" }, { ...metadata, external_url: "https://user:password@example.test/path" },
      { ...metadata, external_url: "https://example.test\\@other.test" }, { ...metadata, external_url: "https://exa\nmple.test" },
      { ...metadata, external_url: "https://" }, { ...metadata, external_url: "https://example.test:99999" },
      { ...metadata, translations: [] }, { ...metadata, translations: { en: { title: {} } } }, { ...metadata, is_published: true },
      { ...metadata, slug: "cannot-change" },
    ];
    for (const data of invalidMetadata) await rejects(`${identity()} ${call(id, data)}`, /NEWS_INVALID_INPUT/);
    for (const images of [{}, [null], [{ image_url: "javascript:test", caption: null, translations: {} }],
      [{ ...gallery[0], caption: 5 }], [{ ...gallery[0], translations: [] }], [{ ...gallery[0], is_primary: false }]]) {
      await rejects(`${identity()} ${call(id, metadata, images)}`, /NEWS_INVALID_INPUT/);
    }
    for (const slug of [null, "", "Bad Slug", "../file"]) await rejects(`${identity()} ${call(null, { ...metadata, slug })}`, /NEWS_INVALID_INPUT/);
    await rejects(`${identity()} ${call("50000000-0000-4000-8000-999999999999")}`, /NEWS_NOT_FOUND/);
  });

  await check("news child insertion failure rolls back both new and existing news, including all previous gallery references", async () => {
    await sql(`create function public.news_test_fail_image() returns trigger language plpgsql as $$ begin
        if new.sort_order = 1 then raise exception 'simulated second image failure'; end if; return new; end $$;
      create trigger news_test_fail_image before insert on public.news_item_images for each row execute function public.news_test_fail_image();`);
    try {
      await rejects(`${identity()} ${call()}`, /simulated second image failure/);
      await rejects(`${identity()} ${call(null, { ...metadata, slug: "rollback-create" })}`, /simulated second image failure/);
    } finally {
      await sql("drop trigger news_test_fail_image on public.news_item_images; drop function public.news_test_fail_image();");
    }
  });

  await check("concurrent news creates allocate unique slugs and sort positions; concurrent edits never mix metadata and images", async () => {
    const created = await Promise.all(Array.from({ length: 3 }, () => sql(`${identity()} ${call(null, { ...metadata, slug: "simultaneous" })}`).then(returnedId)));
    assert.equal(new Set(created).size, 3);
    const createdRows = (await rows()).news.filter(row => created.includes(row.id));
    assert.deepEqual(createdRows.map(row => row.slug).sort(), ["simultaneous", "simultaneous-2", "simultaneous-3"]);
    assert.deepEqual(createdRows.map(row => row.sort_order).sort((a, b) => a - b), [91, 92, 93]);
    await Promise.all(["Alpha", "Beta"].map(title => sql(`${identity()} ${call(id, { ...metadata, title }, [{ ...gallery[0], caption: title }])}`)));
    const current = await rows();
    const finalNews = current.news.find(row => row.id === id);
    const finalGallery = current.images.filter(row => row.news_item_id === id);
    assert.equal(finalGallery.length, 1);
    assert.equal(finalGallery[0].caption, finalNews.title);
  });

  await check("news migration is safely repeatable, invoker-only, admin-restricted and does not alter publication RLS", async () => {
    const before = await snapshot();
    await sql(migrationSql);
    assert.equal(await snapshot(), before);
    const security = JSON.parse(await sql(`select jsonb_build_object('definer', p.prosecdef, 'config', p.proconfig,
      'anon', has_function_privilege('anon', p.oid, 'EXECUTE'), 'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'save_news_item';`));
    assert.equal(security.definer, false);
    assert.equal(security.anon, false);
    assert.equal(security.authenticated, true);
    assert.ok(security.config.includes('search_path=""'));
    assert.ok(security.config.includes("lock_timeout=5s"));
    assert.equal(await sql(`select count(*) from pg_class where oid in ('public.news_items'::regclass, 'public.news_item_images'::regclass) and relrowsecurity;`), "2");
  });
  await check("manual live-verification script runs locally and rolls back every news and image row", async () => {
    // Auth fixtures exist only in this disposable cluster. The manual script
    // itself only reads real Auth users and never inserts or modifies one.
    await sql(`create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz);
      insert into auth.users values ('30000000-0000-4000-8000-000000000001', 'admin@example.test', now(), now());`);
    const before = await snapshot();
    const result = await sql(liveRollbackSql);
    assert.match(result, /PASS: atomic news/);
    assert.equal(await snapshot(), before);
  });
  return passed;
}
