-- Traducciones persistidas para que el contenido añadido desde modo edición
-- se muestre en el idioma seleccionado, sin depender del bundle del frontend.
alter table public.site_pages
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.collections
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.artworks
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.photography_items
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.news_items
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.news_item_images
  add column if not exists translations jsonb not null default '{}'::jsonb;

-- Mantiene la imagen de portada coherente al borrar una obra. La función se
-- ejecuta con los permisos del usuario actual, por lo que las políticas RLS
-- existentes siguen exigiendo que sea administrador.
create or replace function public.delete_artwork_with_cover_refresh(target_artwork_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_collection_id uuid;
  next_cover_image_url text;
begin
  select collection_id
  into target_collection_id
  from artworks
  where id = target_artwork_id;

  if target_collection_id is null then
    raise exception 'Artwork not found';
  end if;

  delete from artworks where id = target_artwork_id;

  select image_url
  into next_cover_image_url
  from artworks
  where collection_id = target_collection_id
  order by sort_order asc
  limit 1;

  update collections
  set cover_image_url = next_cover_image_url
  where id = target_collection_id;
end;
$$;
