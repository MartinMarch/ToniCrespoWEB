-- Presentation only: retain the established justified style for every existing
-- collection. No editorial text, publication flag, artwork or position changes.
do $$
begin
  -- Keep the complete DDL in one statement so this transaction-local timeout
  -- also applies when a local psql runner uses autocommit between statements.
  perform pg_catalog.set_config('lock_timeout', '5s', true);

  alter table public.collections
    add column if not exists description_alignment text not null default 'justify';

  alter table public.collections
    alter column description_alignment set default 'justify',
    alter column description_alignment set not null;

  if not exists (
    select 1 from pg_constraint
    where conname = 'collections_description_alignment_check'
      and conrelid = 'public.collections'::regclass
  ) then
    alter table public.collections
      add constraint collections_description_alignment_check
      check (description_alignment in ('justify', 'center'));
  end if;

  comment on column public.collections.description_alignment is
    'Description alignment shared by every language: justify (default) or center. Existing collection RLS controls editing.';

  perform pg_catalog.pg_notify('pgrst', 'reload schema');
end
$$;
