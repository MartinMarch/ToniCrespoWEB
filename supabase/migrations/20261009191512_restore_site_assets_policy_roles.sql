-- Preserve the Storage policies already active on the former Cloud project.
-- Anonymous visitors may read public assets; only authenticated admins may edit.
alter policy "public can read site assets" on storage.objects
  to anon, authenticated
  using (bucket_id = 'site-assets');

alter policy "admin can upload site assets" on storage.objects
  to authenticated
  with check (bucket_id = 'site-assets' and (select public.is_admin()));

alter policy "admin can update site assets" on storage.objects
  to authenticated
  using (bucket_id = 'site-assets' and (select public.is_admin()))
  with check (bucket_id = 'site-assets' and (select public.is_admin()));

alter policy "admin can delete site assets" on storage.objects
  to authenticated
  using (bucket_id = 'site-assets' and (select public.is_admin()));
