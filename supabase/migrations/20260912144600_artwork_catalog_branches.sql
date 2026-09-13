-- Catalog branches are independent. Availability is editorial, not publication.
alter table public.collections add column if not exists is_recent boolean not null default false;
alter table public.artworks add column if not exists is_available boolean not null default true;

-- Hiding a collection also hides its published child rows from direct REST
-- reads, not just the frontend's collection index. Admin access stays unchanged.
-- Storage buckets remain public: this is visibility, not file confidentiality.
alter policy "public can read published artworks" on public.artworks
  using ((select public.is_admin()) or (
    is_published and exists (
      select 1 from public.collections parent
      where parent.id = artworks.collection_id and parent.is_published
    )
  ));

create unique index if not exists collections_one_recent_per_support
  on public.collections (support_kind) where is_recent;

-- Reserved slug collisions fail safely: never adopt, overwrite or reclassify a
-- pre-existing collection. No artwork is assigned to these new empty collections.
insert into public.collections (slug, support_kind, title, translations, source, sort_order, is_published, is_recent)
values
  ('obras-recientes-lienzos', 'canvas', 'Obras recientes',
    '{"ca":{"title":"Obres recents"},"en":{"title":"Recent works"},"de":{"title":"Neue Werke"}}'::jsonb,
    'supabase', -1, true, true),
  ('obras-recientes-papel', 'paper', 'Obras recientes',
    '{"ca":{"title":"Obres recents"},"en":{"title":"Recent works"},"de":{"title":"Neue Werke"}}'::jsonb,
    'supabase', -1, true, true)
on conflict (support_kind) where is_recent do nothing;

create or replace function public.protect_catalog_collections()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_recent then
      raise exception using errcode = '23514', message = 'RECENT_COLLECTION_PROTECTED: recent collections cannot be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.support_kind is distinct from old.support_kind then
      raise exception using errcode = '23514', message = 'COLLECTION_BRANCH_IMMUTABLE: collection support cannot change';
    end if;
    if new.is_recent is distinct from old.is_recent then
      raise exception using errcode = '23514', message = 'RECENT_COLLECTION_PROTECTED: permanent collection identity cannot change';
    end if;
    if old.is_recent and (
      new.id is distinct from old.id or new.slug is distinct from old.slug
      or new.title is distinct from old.title or new.source is distinct from old.source
      or new.translations #> '{ca,title}' is distinct from old.translations #> '{ca,title}'
      or new.translations #> '{en,title}' is distinct from old.translations #> '{en,title}'
      or new.translations #> '{de,title}' is distinct from old.translations #> '{de,title}'
    ) then
      raise exception using errcode = '23514', message = 'RECENT_COLLECTION_PROTECTED: recent collection names cannot change';
    end if;
  end if;

  -- The application also sorts is_recent first, independently of older negative
  -- positions. Updates to covers/visibility may never displace this fixed slot.
  if new.is_recent then new.sort_order := -1; end if;
  return new;
end;
$$;

create or replace trigger protect_catalog_collections
  before insert or update or delete on public.collections
  for each row execute function public.protect_catalog_collections();

create or replace function public.protect_artwork_catalog_branch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_support text;
  new_support text;
begin
  if new.collection_id is not distinct from old.collection_id then return new; end if;
  -- Parent support is immutable, so concurrent ordinary edits cannot change this
  -- comparison after it is validated. Foreign keys still validate the target id.
  select support_kind into old_support from public.collections where id = old.collection_id;
  select support_kind into new_support from public.collections where id = new.collection_id;
  if old_support is null or new_support is null or old_support <> new_support then
    raise exception using errcode = '23514', message = 'ARTWORK_BRANCH_MISMATCH: artworks cannot move between canvas and paper';
  end if;
  return new;
end;
$$;

create or replace trigger protect_artwork_catalog_branch
  before update of collection_id on public.artworks
  for each row execute function public.protect_artwork_catalog_branch();

-- The existing reorganize_artworks RPC is still one transaction with the same
-- request shape. These guards also apply inside it: a forbidden cross-branch
-- move rolls back all preceding slug/position changes, not just that one work.
-- Trigger functions are not a public RPC API; existing table RLS stays active.
revoke all on function public.protect_catalog_collections() from public, anon, authenticated;
revoke all on function public.protect_artwork_catalog_branch() from public, anon, authenticated;

create or replace function public.delete_empty_collection(target_collection_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  is_permanent boolean;
begin
  if (select auth.uid()) is null or not coalesce((select public.is_admin()), false) then
    raise exception using errcode = '42501', message = 'Only administrators may delete collections';
  end if;
  -- Serialize a new artwork insertion through its foreign key: it must either
  -- commit before this check or fail after this empty collection is deleted.
  select is_recent into is_permanent from public.collections
    where id = target_collection_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'COLLECTION_NOT_FOUND: reload the catalog';
  end if;
  if is_permanent then
    raise exception using errcode = '23514', message = 'RECENT_COLLECTION_PROTECTED: recent collections cannot be deleted';
  end if;
  if exists (select 1 from public.artworks where collection_id = target_collection_id) then
    raise exception using errcode = '23514', message = 'COLLECTION_NOT_EMPTY: move artworks before deleting this collection';
  end if;
  delete from public.collections where id = target_collection_id;
end;
$$;

revoke all on function public.delete_empty_collection(uuid) from public, anon;
grant execute on function public.delete_empty_collection(uuid) to authenticated;

comment on column public.collections.is_recent is 'Permanent, first collection in each support branch; may be hidden, never deleted or renamed.';
comment on column public.artworks.is_available is 'False means the work is not available; independent of its public visibility.';

notify pgrst, 'reload schema';
