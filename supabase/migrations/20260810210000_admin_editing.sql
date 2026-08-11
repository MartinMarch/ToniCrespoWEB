create extension if not exists "pgcrypto";

create table if not exists admin_users (
  email text primary key,
  created_at timestamptz not null default now()
);

create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create table if not exists site_pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  kind text unique not null,
  html text not null default '',
  content jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  support_kind text not null default 'canvas' check (support_kind in ('canvas', 'paper')),
  title text not null,
  description text not null default '',
  cover_image_url text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  source text not null default 'supabase',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists artworks (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  slug text not null,
  title text not null,
  caption text not null default '',
  description text not null default '',
  technique text,
  dimensions text,
  image_url text not null,
  source_image_url text not null default '',
  thumbnail_url text,
  width integer,
  height integer,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  source text not null default 'supabase',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(collection_id, slug)
);

create table if not exists photography_items (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  image_url text not null,
  image_alt text,
  width integer,
  height integer,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists news_items (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  published_at date,
  date_text text,
  category text not null default 'evento',
  location text,
  description text,
  external_url text,
  image_url text,
  image_alt text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists news_item_images (
  id uuid primary key default gen_random_uuid(),
  news_item_id uuid not null references news_items(id) on delete cascade,
  image_url text not null,
  image_alt text,
  caption text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_collections_support_kind on collections(support_kind, sort_order);
create index if not exists idx_artworks_collection_id on artworks(collection_id, sort_order);
create index if not exists idx_photography_items_sort_order on photography_items(sort_order);
create index if not exists idx_news_items_published_at on news_items(published_at desc);
create index if not exists idx_news_item_images_news_item_id on news_item_images(news_item_id, sort_order);

alter table site_pages enable row level security;
alter table collections enable row level security;
alter table artworks enable row level security;
alter table photography_items enable row level security;
alter table news_items enable row level security;
alter table news_item_images enable row level security;
alter table admin_users enable row level security;

create policy "public can read published site pages" on site_pages
  for select using (is_published or is_admin());
create policy "admin can manage site pages" on site_pages
  for all using (is_admin()) with check (is_admin());

create policy "public can read published collections" on collections
  for select using (is_published or is_admin());
create policy "admin can manage collections" on collections
  for all using (is_admin()) with check (is_admin());

create policy "public can read published artworks" on artworks
  for select using (is_published or is_admin());
create policy "admin can manage artworks" on artworks
  for all using (is_admin()) with check (is_admin());

create policy "public can read published photography" on photography_items
  for select using (is_published or is_admin());
create policy "admin can manage photography" on photography_items
  for all using (is_admin()) with check (is_admin());

create policy "public can read published news" on news_items
  for select using (is_published or is_admin());
create policy "admin can manage news" on news_items
  for all using (is_admin()) with check (is_admin());

create policy "public can read news images" on news_item_images
  for select using (
    exists (
      select 1 from news_items
      where news_items.id = news_item_images.news_item_id
      and (news_items.is_published or is_admin())
    )
  );
create policy "admin can manage news images" on news_item_images
  for all using (is_admin()) with check (is_admin());

create policy "admin can read admin users" on admin_users
  for select using (is_admin());

insert into storage.buckets (id, name, public)
values
  ('artworks', 'artworks', true),
  ('photography', 'photography', true),
  ('news', 'news', true),
  ('biography', 'biography', true)
on conflict (id) do update set public = excluded.public;

create policy "public can read editing assets" on storage.objects
  for select using (bucket_id in ('artworks', 'photography', 'news', 'biography'));

create policy "admin can upload editing assets" on storage.objects
  for insert with check (bucket_id in ('artworks', 'photography', 'news', 'biography') and is_admin());

create policy "admin can update editing assets" on storage.objects
  for update using (bucket_id in ('artworks', 'photography', 'news', 'biography') and is_admin())
  with check (bucket_id in ('artworks', 'photography', 'news', 'biography') and is_admin());

create policy "admin can delete editing assets" on storage.objects
  for delete using (bucket_id in ('artworks', 'photography', 'news', 'biography') and is_admin());
