-- Manual trusted connection only. Run as ONE MCP batch and check isError,
-- or psql -v ON_ERROR_STOP=1. Never accept PASS after any earlier client error.
-- Uses existing confirmed-admin claims, not a password/login test. Creates one
-- transaction-local news item only; no existing news, Auth or Storage writes.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '3s';
do $identity$
declare claims text;
begin
  select jsonb_build_object('sub', u.id, 'email', u.email, 'role', 'authenticated')::text
    into claims from auth.users u join public.admin_users a on lower(a.email) = lower(u.email)
    where u.email_confirmed_at is not null order by u.created_at limit 1;
  if claims is null then raise exception 'No confirmed administrator available'; end if;
  perform set_config('request.jwt.claims', claims, true);
end;
$identity$;
set local role authenticated;
do $verify$
declare
  admin_claims text := current_setting('request.jwt.claims');
  draft jsonb;
  gallery jsonb;
  before_images jsonb;
  after_images jsonb;
  created_id uuid;
  original public.news_items%rowtype;
  changed public.news_items%rowtype;
  affected integer;
begin
  if not public.is_admin() or auth.uid() is null then raise exception 'Admin verification failed'; end if;
  select jsonb_agg(jsonb_build_object('image_url', image_url, 'caption', caption, 'translations', translations) order by id)
    into gallery from (select id, image_url, caption, translations from public.news_item_images
      where image_url ~* '^https?://' order by id limit 2) existing;
  if coalesce(jsonb_array_length(gallery), 0) <> 2 then raise exception 'Two existing image references are required'; end if;
  draft := jsonb_build_object('title', 'Prueba transaccional de noticias', 'published_at', '2026-09-13',
    'date_text', 'Septiembre', 'category', 'evento', 'location', 'Mallorca', 'description', E'Primer párrafo.\n\nSegundo párrafo.',
    'external_url', 'https://example.invalid/noticia', 'image_alt', 'Texto alternativo de prueba',
    'translations', jsonb_build_object('ca', jsonb_build_object('title', 'Notícia de prova', 'description', E'Primer paràgraf.\n\nSegon paràgraf.')));
  created_id := public.save_news_item(null, draft || jsonb_build_object('slug', 'verification-' || replace(gen_random_uuid()::text, '-', '')), gallery);
  select * into original from public.news_items where id = created_id;
  if original.id is null or original.image_url is distinct from (gallery -> 0 ->> 'image_url')
    or original.description is distinct from (draft ->> 'description') or original.translations is distinct from (draft -> 'translations')
    or original.is_published is distinct from true then raise exception 'Atomic news creation failed'; end if;
  gallery := jsonb_build_array(gallery -> 1, gallery -> 0);
  draft := draft || jsonb_build_object('title', 'Prueba editada', 'description', E'Texto editado.\n\nSe conserva completo.');
  perform public.save_news_item(created_id, draft, gallery);
  select * into changed from public.news_items where id = created_id;
  if changed.description is distinct from (draft ->> 'description') or changed.title is distinct from (draft ->> 'title')
    or changed.image_url is distinct from (gallery -> 0 ->> 'image_url') or changed.translations is distinct from (draft -> 'translations')
    or (to_jsonb(changed) - array['title', 'description', 'image_url', 'updated_at'])
       is distinct from (to_jsonb(original) - array['title', 'description', 'image_url', 'updated_at'])
    then raise exception 'Edit changed protected metadata or lost paragraphs'; end if;
  select jsonb_agg(jsonb_build_object('image_url', image_url, 'caption', caption, 'translations', translations) order by sort_order)
    into after_images from public.news_item_images where news_item_id = created_id;
  if after_images is distinct from gallery or (select count(*) from public.news_item_images
      where news_item_id = created_id and image_alt = draft ->> 'image_alt' and is_primary = (sort_order = 0)) <> 2
    then raise exception 'Ordered gallery, captions, translations or shared alt failed'; end if;
  select jsonb_agg(to_jsonb(i) order by sort_order) into before_images from public.news_item_images i where news_item_id = created_id;
  perform public.save_news_item(created_id, draft, null);
  select jsonb_agg(to_jsonb(i) order by sort_order) into after_images from public.news_item_images i where news_item_id = created_id;
  if after_images is distinct from before_images then raise exception 'Omitted gallery changed references'; end if;
  perform public.save_news_item(created_id, draft, '[]'::jsonb);
  if exists (select 1 from public.news_item_images where news_item_id = created_id)
    or (select image_url from public.news_items where id = created_id) is not null then raise exception 'Empty gallery did not clear hero'; end if;
  perform public.save_news_item(created_id, draft, gallery);
  update public.news_items set is_published = false where id = created_id;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(),
    'email', 'news-test-' || gen_random_uuid()::text || '@example.invalid', 'role', 'authenticated')::text, true);
  if public.is_admin() then raise exception 'Non-admin unexpectedly authorized'; end if;
  begin
    perform public.save_news_item(created_id, draft, '[]'::jsonb);
    raise exception 'Non-admin RPC was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'NEWS_EDIT_FORBIDDEN' then raise; end if;
  end;
  update public.news_items set title = 'Forbidden' where id = created_id;
  get diagnostics affected = row_count;
  if affected <> 0 or exists (select 1 from public.news_items where id = created_id)
    or exists (select 1 from public.news_item_images where news_item_id = created_id)
    then raise exception 'News RLS allowed a non-admin read/write'; end if;
  perform set_config('request.jwt.claims', admin_claims, true);
  if (select count(*) from public.news_item_images where news_item_id = created_id) <> 2
    or (select title from public.news_items where id = created_id) is distinct from (draft ->> 'title')
    then raise exception 'Rejected operation changed the news'; end if;
end;
$verify$;
rollback;
select 'PASS: atomic news create/edit/reorder/clear/preserve, paragraphs/translations and RLS; every write rolled back' as result;
