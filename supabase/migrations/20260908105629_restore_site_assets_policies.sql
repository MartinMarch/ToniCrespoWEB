-- Some environments created the bucket manually without its access policies.
-- Version matches the migration recorded by Supabase MCP in the live project.
-- Add only missing policies, leaving existing buckets, objects and policies intact.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public can read site assets') then
    create policy "public can read site assets" on storage.objects
      for select to anon, authenticated using (bucket_id = 'site-assets');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'admin can upload site assets') then
    create policy "admin can upload site assets" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'site-assets' and (select public.is_admin()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'admin can update site assets') then
    create policy "admin can update site assets" on storage.objects
      for update to authenticated
      using (bucket_id = 'site-assets' and (select public.is_admin()))
      with check (bucket_id = 'site-assets' and (select public.is_admin()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'admin can delete site assets') then
    create policy "admin can delete site assets" on storage.objects
      for delete to authenticated
      using (bucket_id = 'site-assets' and (select public.is_admin()));
  end if;
end
$$;
