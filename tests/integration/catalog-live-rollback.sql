-- Manual post-migration smoke test for the connected project, run through a
-- trusted database connection/MCP, never through the browser or automatic CI.
-- Requires an existing confirmed administrator, but never reads a password or
-- creates an Auth user. JWT claims are simulated ONLY inside this transaction:
-- this verifies real grants/RLS/RPCs, not the browser's login exchange.
-- Every catalog write below is rolled back. No Storage files are touched.
begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

do $identity$
declare
  claims text;
begin
  select jsonb_build_object('sub', u.id, 'email', u.email, 'role', 'authenticated')::text
    into claims from auth.users u
    join public.admin_users a on lower(a.email) = lower(u.email)
    where u.email_confirmed_at is not null
    order by u.created_at limit 1;
  if claims is null then raise exception 'No confirmed administrator available for the smoke test'; end if;
  perform set_config('request.jwt.claims', claims, true);
end;
$identity$;

set local role authenticated;
do $verify$
declare
  original_claims text := current_setting('request.jwt.claims');
  initial_work public.artworks%rowtype;
  source_id uuid;
  destination_id uuid;
  paper_id uuid;
  work_id uuid;
  recent_id uuid;
  probe_slug text := '__catalog_smoke_' || gen_random_uuid()::text;
  expected jsonb;
  requested jsonb;
  affected integer;
begin
  if not public.is_admin() or auth.uid() is null then raise exception 'Admin verification failed'; end if;

  -- Exercise the exact availability UPDATE against an existing real artwork.
  select * into strict initial_work from public.artworks order by id limit 1;
  update public.artworks set is_available = false where id = initial_work.id;
  if not exists (select 1 from public.artworks where id = initial_work.id and is_available = false)
    then raise exception 'Availability false did not persist inside the transaction'; end if;
  update public.artworks set is_available = true where id = initial_work.id;
  if not exists (select 1 from public.artworks where id = initial_work.id and is_available = true)
    then raise exception 'Availability true did not persist inside the transaction'; end if;

  insert into public.collections (slug, title, support_kind, is_published)
    values (probe_slug || '_source', 'Catalog smoke source', 'canvas', true) returning id into source_id;
  insert into public.collections (slug, title, support_kind, is_published)
    values (probe_slug || '_destination', 'Catalog smoke destination', 'canvas', false) returning id into destination_id;
  insert into public.collections (slug, title, support_kind, is_published)
    values (probe_slug || '_paper', 'Catalog smoke paper', 'paper', false) returning id into paper_id;
  insert into public.artworks (collection_id, slug, title, technique, dimensions, image_url)
    values (source_id, probe_slug, 'Catalog smoke work', 'Acrílico', '30 x 40 cm', initial_work.image_url)
    returning id into work_id;

  update public.artworks set title = 'Edited smoke work', description = E'Primera línea\nNo disponible',
    is_available = false, translations = '{"en":{"title":"Edited smoke work"}}'::jsonb where id = work_id;
  if not exists (select 1 from public.artworks where id = work_id and title = 'Edited smoke work'
    and description = E'Primera línea\nNo disponible' and not is_available and is_published
    and translations #>> '{en,title}' = 'Edited smoke work')
    then raise exception 'Artwork edit/default publication/translations failed'; end if;

  -- A signed-in non-admin can see an unavailable work but cannot edit it.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(),
    'email', 'catalog-smoke-nonadmin-' || gen_random_uuid()::text || '@example.invalid', 'role', 'authenticated')::text, true);
  if public.is_admin() then raise exception 'Non-admin unexpectedly authorized'; end if;
  if not exists (select 1 from public.artworks where id = work_id and not is_available)
    then raise exception 'Unavailable published artwork is invisible'; end if;
  update public.artworks set is_available = true where id = work_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Non-admin availability update was allowed'; end if;
  begin
    perform public.reorganize_artworks('[]'::jsonb, '[]'::jsonb);
    raise exception 'Non-admin organizer call was allowed';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', original_claims, true);

  update public.collections set is_published = false where id = source_id;
  perform set_config('request.jwt.claims', '{}', true);
  if exists (select 1 from public.artworks where id = work_id)
    then raise exception 'Hidden collection leaks child artwork rows'; end if;
  perform set_config('request.jwt.claims', original_claims, true);
  update public.collections set is_published = true where id = source_id;
  update public.artworks set is_published = false where id = work_id;
  perform set_config('request.jwt.claims', '{}', true);
  if exists (select 1 from public.artworks where id = work_id)
    then raise exception 'Hidden artwork row remains public'; end if;
  perform set_config('request.jwt.claims', original_claims, true);

  expected := jsonb_build_array(
    jsonb_build_object('id', source_id, 'artworks', jsonb_build_array(jsonb_build_object('id', work_id, 'sort_order', 0))),
    jsonb_build_object('id', destination_id, 'artworks', '[]'::jsonb));
  requested := jsonb_build_array(
    jsonb_build_object('id', source_id, 'artwork_ids', '[]'::jsonb),
    jsonb_build_object('id', destination_id, 'artwork_ids', jsonb_build_array(work_id)));
  perform public.reorganize_artworks(expected, requested);
  if not exists (select 1 from public.artworks where id = work_id and collection_id = destination_id
    and sort_order = 0 and not is_available and not is_published)
    then raise exception 'Atomic move did not preserve artwork flags'; end if;
  begin
    perform public.reorganize_artworks(expected, requested);
    raise exception 'Stale organization request was accepted';
  exception when serialization_failure then null;
  end;
  begin
    update public.artworks set collection_id = paper_id where id = work_id;
    raise exception 'Cross-branch artwork move was accepted';
  exception when check_violation then null;
  end;

  select id into strict recent_id from public.collections where support_kind = 'canvas' and is_recent;
  update public.collections set is_published = false, sort_order = 99 where id = recent_id;
  if not exists (select 1 from public.collections where id = recent_id and sort_order = -1 and not is_published)
    then raise exception 'Recent collection visibility or pinned position failed'; end if;
  begin
    perform public.delete_empty_collection(recent_id);
    raise exception 'Recent collection deletion was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.delete_empty_collection(destination_id);
    raise exception 'Nonempty collection deletion was accepted';
  exception when check_violation then null;
  end;

  perform public.delete_artwork_with_cover_refresh(work_id);
  if exists (select 1 from public.artworks where id = work_id)
    then raise exception 'Artwork delete RPC failed'; end if;
  perform public.delete_empty_collection(destination_id);
  perform public.delete_empty_collection(source_id);
  perform public.delete_empty_collection(paper_id);
  if exists (select 1 from public.collections where id in (source_id, destination_id, paper_id))
    then raise exception 'Empty collection deletion failed'; end if;
end;
$verify$;

rollback;
select 'PASS: real admin grants, availability, CRUD, multiline text, translations, visibility/RLS, same-branch move, stale conflict, branch protection and recent collection protection; all writes rolled back' as result;
