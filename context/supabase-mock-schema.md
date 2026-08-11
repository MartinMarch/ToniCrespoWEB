# Supabase mock schema

Este schema es un borrador. No se ha ejecutado contra Supabase.

Archivo SQL draft: `supabase/drafts/001_initial_schema_draft.sql`.

```sql
-- MOCK / DRAFT SCHEMA
-- Do not execute in production until validated.
```

## Tablas propuestas

- `collections`
- `artworks`
- `artwork_images`
- `site_pages`
- `news_items`
- `news_item_images`

## Relaciones propuestas

- `artworks.collection_id` referencia `collections.id`.
- `artwork_images.artwork_id` referencia `artworks.id`.
- `collections.cover_image_id` referencia `artwork_images.id`.
- `artworks.primary_image_id` referencia `artwork_images.id`.
- `news_items.image_url` guarda la imagen principal de la noticia de forma directa durante esta fase.
- `news_item_images.news_item_id` referencia `news_items.id`.

## Índices propuestos

- `idx_collections_slug`
- `idx_artworks_collection_id`
- `idx_artworks_slug`
- `idx_artwork_images_artwork_id`
- `idx_site_pages_slug`
- `idx_news_items_slug`
- `idx_news_items_published_at`
- `idx_news_item_images_news_item_id`

## Buckets previstos

```txt
artwork-images/
├── barcelona/
├── brooklin-bridge/
├── distopia/
├── divertimentos/
├── jardin-de-invierno/
├── monocromias/
├── monolitos/
├── neolengua/
├── obra-reciente/
├── retorn-al-jardi-dhivern/
└── ut-pictura-poesis/
```

## Seeds draft

Seed de colecciones:

```txt
supabase/drafts/001_collections_seed_draft.sql
```

No ejecutar hasta validar el modelo de colecciones y los slugs.

## RLS

No se han definido políticas RLS definitivas. Antes de mover este SQL a `supabase/migrations/` hay que decidir:

- Qué contenido será público.
- Qué roles podrán crear/editar.
- Cómo se publicarán imágenes desde Storage.
- Si las noticias comparten bucket con obras o requieren un bucket propio.
