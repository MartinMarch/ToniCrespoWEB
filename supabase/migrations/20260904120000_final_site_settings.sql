create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

create policy "public can read site settings" on public.site_settings
  for select using (true);

create policy "admin can manage site settings" on public.site_settings
  for all using (is_admin()) with check (is_admin());

insert into public.site_settings (key, value)
values (
  'global',
  jsonb_build_object(
    'defaultLanguage', 'ca',
    'contact', jsonb_build_object(
      'email', 'tonicrespo.art@gmail.com',
      'instagramHandle', '@tonicrespo.art',
      'instagramUsername', 'tonicrespo.art',
      'phoneDisplay', '+34 659 959 352',
      'phoneNumber', '34659959352'
    )
  )
)
on conflict (key) do nothing;
