-- Manual, trusted connection only; never an automatic production/CI test.
-- Simulates an existing confirmed administrator's claims to exercise actual
-- database grants/RLS. It does not test the browser password/login exchange.
-- All editorial writes are invisible to other sessions and rolled back.
-- Run as ONE MCP batch and check isError, or use psql -v ON_ERROR_STOP=1.
-- Never accept the final PASS if the client reported any earlier error.
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
  original_claims text := current_setting('request.jwt.claims');
  original public.collections%rowtype;
  changed public.collections%rowtype;
  checked_count integer := 0;
  affected integer;
begin
  if not public.is_admin() or auth.uid() is null then raise exception 'Admin verification failed'; end if;
  -- Exactly one normal and one recent collection per branch, including hidden
  -- ones. No hard-coded IDs, inserts, deletes, Storage or Auth-user mutations.
  for original in select distinct on (support_kind, is_recent) *
    from public.collections order by support_kind, is_recent, id
  loop
    update public.collections set description_alignment = 'center',
      description = E'Primera línea de prueba.\nSegunda línea.\n\nOtro párrafo.'
      where id = original.id returning * into changed;
    if changed.id is null or changed.description_alignment <> 'center'
      or changed.description <> E'Primera línea de prueba.\nSegunda línea.\n\nOtro párrafo.'
      then raise exception 'Description/center update did not persist'; end if;
    if (to_jsonb(changed) - array['description_alignment', 'description', 'updated_at'])
      is distinct from (to_jsonb(original) - array['description_alignment', 'description', 'updated_at'])
      then raise exception 'Editing altered unrelated collection data'; end if;

    update public.collections set description_alignment = 'justify' where id = original.id;
    if not exists (select 1 from public.collections where id = original.id and description_alignment = 'justify')
      then raise exception 'Justified alignment did not persist'; end if;
    begin
      update public.collections set description_alignment = 'right' where id = original.id;
      raise exception 'Invalid alignment was accepted';
    exception when check_violation then null;
    end;
    begin
      update public.collections set description_alignment = null where id = original.id;
      raise exception 'Null alignment was accepted';
    exception when not_null_violation then null;
    end;

    perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(),
      'email', 'description-test-' || gen_random_uuid()::text || '@example.invalid', 'role', 'authenticated')::text, true);
    if public.is_admin() then raise exception 'Non-admin unexpectedly authorized'; end if;
    update public.collections set description_alignment = 'center' where id = original.id;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Non-admin edited a collection'; end if;
    perform set_config('request.jwt.claims', original_claims, true);
    checked_count := checked_count + 1;
  end loop;
  if checked_count <> 4 then raise exception 'Expected a normal and recent collection per branch'; end if;
end;
$verify$;
rollback;

select 'PASS: description/center/justify, protected metadata, CHECK/NOT NULL and admin-only edits in four collections; all writes rolled back' as result;
