-- One request/transaction for moving and ordering works. Existing RLS remains active.
-- No rows, media, translations, publication flags, or collection ordering are deleted.
create or replace function public.reorganize_artworks(expected_state jsonb, next_state jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  expected_collection jsonb;
  requested_collection jsonb;
  expected_artwork jsonb;
  collection_ids uuid[];
  requested_collection_ids uuid[];
  expected_artwork_ids uuid[];
  requested_artwork_ids uuid[];
  actual_snapshot jsonb;
  expected_snapshot jsonb;
  requested_positions jsonb;
  moved_artworks jsonb;
  moving record;
  candidate_slug text;
  temporary_slug text;
  suffix integer;
  locked_count integer;
begin
  if (select auth.uid()) is null or not coalesce((select public.is_admin()), false) then
    raise exception using errcode = '42501', message = 'Only administrators may organize artworks';
  end if;

  if jsonb_typeof(expected_state) is distinct from 'array'
    or jsonb_typeof(next_state) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Organization states must be arrays';
  end if;

  -- Check nested types before expanding arrays: malformed requests cannot skip validation.
  for expected_collection in select value from jsonb_array_elements(expected_state) loop
    if jsonb_typeof(expected_collection -> 'id') is distinct from 'string'
      or jsonb_typeof(expected_collection -> 'artworks') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'Invalid expected collection';
    end if;
    for expected_artwork in select value from jsonb_array_elements(expected_collection -> 'artworks') loop
      if jsonb_typeof(expected_artwork -> 'id') is distinct from 'string'
        or jsonb_typeof(expected_artwork -> 'sort_order') is distinct from 'number'
        or (expected_artwork ->> 'sort_order') !~ '^-?[0-9]+$' then
        raise exception using errcode = '22023', message = 'Invalid expected artwork';
      end if;
    end loop;
  end loop;
  for requested_collection in select value from jsonb_array_elements(next_state) loop
    if jsonb_typeof(requested_collection -> 'id') is distinct from 'string'
      or jsonb_typeof(requested_collection -> 'artwork_ids') is distinct from 'array'
      or exists (select 1 from jsonb_array_elements(requested_collection -> 'artwork_ids') item
        where jsonb_typeof(item.value) is distinct from 'string') then
      raise exception using errcode = '22023', message = 'Invalid requested collection';
    end if;
  end loop;

  select coalesce(array_agg((value ->> 'id')::uuid order by (value ->> 'id')::uuid), '{}'::uuid[])
    into collection_ids from jsonb_array_elements(expected_state);
  select coalesce(array_agg((value ->> 'id')::uuid order by (value ->> 'id')::uuid), '{}'::uuid[])
    into requested_collection_ids from jsonb_array_elements(next_state);
  if collection_ids <> requested_collection_ids
    or cardinality(collection_ids) <> (select count(distinct id) from unnest(collection_ids) id) then
    raise exception using errcode = '22023', message = 'Collection lists must match without duplicates';
  end if;
  if cardinality(collection_ids) = 0 then return; end if;

  select coalesce(array_agg((art.value ->> 'id')::uuid order by (art.value ->> 'id')::uuid), '{}'::uuid[])
    into expected_artwork_ids
    from jsonb_array_elements(expected_state) col
    cross join lateral jsonb_array_elements(col.value -> 'artworks') art;
  select coalesce(array_agg(art.value::uuid order by art.value::uuid), '{}'::uuid[])
    into requested_artwork_ids
    from jsonb_array_elements(next_state) col
    cross join lateral jsonb_array_elements_text(col.value -> 'artwork_ids') art;
  if expected_artwork_ids <> requested_artwork_ids
    or cardinality(expected_artwork_ids) <> (select count(distinct id) from unnest(expected_artwork_ids) id) then
    raise exception using errcode = '22023', message = 'Every artwork must appear exactly once';
  end if;

  -- Consistent parent-then-child locking serializes overlapping organizer requests.
  -- Parent row locks also serialize inserts/moves through the existing foreign key.
  perform id from public.collections where id = any(collection_ids) order by id for update;
  get diagnostics locked_count = row_count;
  if locked_count <> cardinality(collection_ids) then
    raise exception using errcode = '40001', message = 'ORGANIZATION_CONFLICT: a collection changed';
  end if;
  perform id from public.artworks
    where collection_id = any(collection_ids) or id = any(expected_artwork_ids)
    order by id for update;

  -- Complete membership plus raw sort orders detect stale additions, deletions and moves.
  -- Editorial changes are intentionally not overwritten or treated as organization conflicts.
  for expected_collection in select value from jsonb_array_elements(expected_state) loop
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'sort_order', sort_order) order by id), '[]'::jsonb)
      into actual_snapshot from public.artworks
      where collection_id = (expected_collection ->> 'id')::uuid;
    select coalesce(jsonb_agg(jsonb_build_object('id', (value ->> 'id')::uuid,
      'sort_order', (value ->> 'sort_order')::integer) order by (value ->> 'id')::uuid), '[]'::jsonb)
      into expected_snapshot from jsonb_array_elements(expected_collection -> 'artworks');
    if actual_snapshot <> expected_snapshot then
      raise exception using errcode = '40001', message = 'ORGANIZATION_CONFLICT: artworks changed';
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('id', art.value::uuid,
    'collection_id', (col.value ->> 'id')::uuid, 'sort_order', art.ordinality - 1)), '[]'::jsonb)
    into requested_positions
    from jsonb_array_elements(next_state) col
    cross join lateral jsonb_array_elements_text(col.value -> 'artwork_ids') with ordinality art(value, ordinality);

  select coalesce(jsonb_agg(jsonb_build_object('id', artwork.id, 'slug', artwork.slug,
    'collection_id', target.collection_id) order by artwork.id), '[]'::jsonb)
    into moved_artworks
    from public.artworks artwork
    join jsonb_to_recordset(requested_positions) as target(id uuid, collection_id uuid, sort_order integer)
      on target.id = artwork.id
    where target.collection_id <> artwork.collection_id;

  -- Release moving slugs first so swaps of identically named works are possible.
  -- Temporary slugs are never externally observable: all statements share one transaction.
  for moving in select * from jsonb_to_recordset(moved_artworks) as item(id uuid, slug text, collection_id uuid) order by id loop
    loop
      temporary_slug := '__organizer_' || gen_random_uuid()::text;
      exit when not exists (select 1 from public.artworks artwork
        where artwork.slug = temporary_slug and artwork.collection_id = any(collection_ids));
    end loop;
    update public.artworks set slug = temporary_slug where id = moving.id;
  end loop;
  for moving in select * from jsonb_to_recordset(moved_artworks) as item(id uuid, slug text, collection_id uuid) order by id loop
    candidate_slug := moving.slug;
    suffix := 0;
    while exists (select 1 from public.artworks artwork
      where artwork.collection_id = moving.collection_id and artwork.slug = candidate_slug and artwork.id <> moving.id) loop
      suffix := suffix + 1;
      candidate_slug := moving.slug || '-' || moving.id::text || case when suffix = 1 then '' else '-' || suffix::text end;
    end loop;
    update public.artworks set collection_id = moving.collection_id, slug = candidate_slug, updated_at = now()
      where id = moving.id;
  end loop;

  update public.artworks artwork set sort_order = target.sort_order, updated_at = now()
    from jsonb_to_recordset(requested_positions) as target(id uuid, collection_id uuid, sort_order integer)
    where artwork.id = target.id and artwork.sort_order is distinct from target.sort_order;

  update public.collections collection set cover_image_url = (
    select artwork.image_url from public.artworks artwork
    where artwork.collection_id = collection.id and artwork.is_published
    order by artwork.sort_order, artwork.id limit 1
  ), updated_at = now()
    where collection.id = any(collection_ids);
end;
$$;

revoke all on function public.reorganize_artworks(jsonb, jsonb) from public, anon;
grant execute on function public.reorganize_artworks(jsonb, jsonb) to authenticated;

comment on function public.reorganize_artworks(jsonb, jsonb) is
  'Admin-only atomic artwork membership/order update with optimistic concurrency and existing RLS. Preserves media, metadata and publication.';

notify pgrst, 'reload schema';
