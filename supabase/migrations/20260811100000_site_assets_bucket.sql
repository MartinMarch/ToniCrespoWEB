insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do update set public = excluded.public;

create policy "public can read site assets" on storage.objects
  for select using (bucket_id = 'site-assets');

create policy "admin can upload site assets" on storage.objects
  for insert with check (bucket_id = 'site-assets' and is_admin());

create policy "admin can update site assets" on storage.objects
  for update using (bucket_id = 'site-assets' and is_admin())
  with check (bucket_id = 'site-assets' and is_admin());

create policy "admin can delete site assets" on storage.objects
  for delete using (bucket_id = 'site-assets' and is_admin());
