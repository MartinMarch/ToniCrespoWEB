-- Save the editorial fields and the complete ordered gallery in one transaction.
-- Existing publication policies, slugs and stored files are intentionally unchanged.
create or replace function public.save_news_item(
  target_news_id uuid,
  news_data jsonb,
  image_items jsonb default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  saved_id uuid;
  field_name text;
  item jsonb;
  localized jsonb;
  translated_fields jsonb;
  candidate_url text;
  authority text;
  port_text text;
  publication_date date;
  selected_slug text;
  base_slug text;
  slug_suffix integer := 1;
  next_position integer;
  shared_alt text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'NEWS_EDIT_FORBIDDEN';
  end if;
  if news_data is null or jsonb_typeof(news_data) <> 'object' then
    raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
  end if;
  if not (news_data ?& array['title', 'published_at', 'date_text', 'category', 'location', 'description', 'external_url', 'image_alt', 'translations'])
    or exists (select 1 from jsonb_object_keys(news_data) as keys(key)
      where key <> all(array['title', 'published_at', 'date_text', 'category', 'location', 'description', 'external_url', 'image_alt', 'translations', 'slug'])) then
    raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
  end if;
  foreach field_name in array array['title', 'category', 'image_alt'] loop
    if jsonb_typeof(news_data -> field_name) <> 'string' or (news_data ->> field_name) !~ '[^[:space:]]' then
      raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
    end if;
  end loop;
  if news_data ->> 'category' <> all(array['exposicion', 'premio', 'entrevista', 'publicacion', 'evento', 'television']) then
    raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
  end if;
  foreach field_name in array array['published_at', 'date_text', 'location', 'description', 'external_url'] loop
    if jsonb_typeof(news_data -> field_name) not in ('string', 'null') then
      raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
    end if;
  end loop;
  if news_data ->> 'published_at' is not null then
    if (news_data ->> 'published_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
    end if;
    begin
      publication_date := (news_data ->> 'published_at')::date;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
    end;
  end if;
  if target_news_id is null then
    if not (news_data ? 'slug') or jsonb_typeof(news_data -> 'slug') <> 'string'
      or (news_data ->> 'slug') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
    end if;
  elsif news_data ? 'slug' then
    raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
  end if;
  if image_items is not null and jsonb_typeof(image_items) <> 'array' then
    raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
  end if;

  -- Preserve the complete localized text, including future language keys, but
  -- reject arrays/nested non-text content instead of silently coercing it.
  for localized in
    select news_data -> 'translations'
    union all select value -> 'translations' from jsonb_array_elements(coalesce(image_items, '[]'::jsonb))
  loop
    if localized is null or jsonb_typeof(localized) <> 'object' then
      raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
    end if;
    for translated_fields in select value from jsonb_each(localized) loop
      if jsonb_typeof(translated_fields) <> 'object' then
        raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
      end if;
      if exists (select 1 from jsonb_each(translated_fields) where jsonb_typeof(value) not in ('string', 'null')) then
        raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
      end if;
    end loop;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(image_items, '[]'::jsonb)) loop
    if jsonb_typeof(item) <> 'object' or not (item ?& array['image_url', 'caption', 'translations'])
      or jsonb_typeof(item -> 'image_url') <> 'string'
      or jsonb_typeof(item -> 'caption') not in ('string', 'null')
      or exists (select 1 from jsonb_object_keys(item) as keys(key) where key <> all(array['image_url', 'caption', 'translations'])) then
      raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
    end if;
  end loop;
  for candidate_url in
    select news_data ->> 'external_url' where news_data ->> 'external_url' is not null
    union all select value ->> 'image_url' from jsonb_array_elements(coalesce(image_items, '[]'::jsonb))
  loop
    candidate_url := btrim(candidate_url);
    authority := substring(candidate_url from '(?i)^https?://([^/?#]+)');
    if candidate_url is null or candidate_url ~ '[[:cntrl:]]' or position(chr(92) in candidate_url) > 0
      or authority is null or authority !~ '^(\[[0-9A-Fa-f:.]+\]|[^[:space:][:cntrl:]/?#@:%\[\]]+)(:[0-9]{1,5})?$' then
      raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
    end if;
    port_text := substring(authority from ':([0-9]+)$');
    if port_text is not null and port_text::integer > 65535 then
      raise exception using errcode = '22023', message = 'NEWS_INVALID_INPUT';
    end if;
  end loop;

  shared_alt := btrim(news_data ->> 'image_alt');
  if target_news_id is null then
    -- Serialize this endpoint's creates only, avoiding races in slug/order
    -- allocation without locking unrelated news edits or holding table locks.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('public.save_news_item:create', 0));
    saved_id := pg_catalog.gen_random_uuid();
    base_slug := news_data ->> 'slug';
    selected_slug := base_slug;
    while exists (select 1 from public.news_items where slug = selected_slug) loop
      slug_suffix := slug_suffix + 1;
      selected_slug := base_slug || '-' || slug_suffix::text;
    end loop;
    select greatest(0, coalesce(max(sort_order), 0)) + 1 into next_position from public.news_items;
    insert into public.news_items(id, slug, title, published_at, date_text, category, location, description,
      external_url, image_alt, translations, sort_order, is_published)
    values (saved_id, selected_slug, btrim(news_data ->> 'title'), publication_date,
      news_data ->> 'date_text', news_data ->> 'category', news_data ->> 'location', news_data ->> 'description',
      nullif(btrim(news_data ->> 'external_url'), ''), shared_alt, news_data -> 'translations', next_position, true)
    returning id into saved_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'NEWS_NOT_FOUND';
    end if;
  else
    -- Parent-before-children order serializes edits and FK-driven deletions.
    select id into saved_id from public.news_items where id = target_news_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'NEWS_NOT_FOUND';
    end if;
    perform id from public.news_item_images where news_item_id = saved_id order by id for update;
    update public.news_items set title = btrim(news_data ->> 'title'),
      published_at = publication_date, date_text = news_data ->> 'date_text',
      category = news_data ->> 'category', location = news_data ->> 'location', description = news_data ->> 'description',
      external_url = nullif(btrim(news_data ->> 'external_url'), ''), image_alt = shared_alt,
      translations = news_data -> 'translations', updated_at = now()
    where id = saved_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'NEWS_NOT_FOUND';
    end if;
  end if;

  if image_items is not null then
    -- Only references are replaced. Storage objects are never deleted here.
    delete from public.news_item_images where news_item_id = saved_id;
    insert into public.news_item_images(news_item_id, image_url, image_alt, caption, translations, sort_order, is_primary)
    select saved_id, btrim(value ->> 'image_url'), shared_alt, value ->> 'caption', value -> 'translations',
      (ordinality - 1)::integer, ordinality = 1
    from jsonb_array_elements(image_items) with ordinality;
    update public.news_items set image_url = nullif(btrim(image_items -> 0 ->> 'image_url'), '') where id = saved_id;
  else
    update public.news_item_images set image_alt = shared_alt where news_item_id = saved_id;
  end if;
  return saved_id;
end;
$$;

revoke all on function public.save_news_item(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_news_item(uuid, jsonb, jsonb) to authenticated;
comment on function public.save_news_item(uuid, jsonb, jsonb) is
  'Admin-only atomic news metadata and ordered gallery save. NULL gallery preserves references; [] clears them. Never deletes Storage objects.';
notify pgrst, 'reload schema';
