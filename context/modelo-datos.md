# Modelo de datos

## Modelo lógico inicial

```txt
collections
└── artworks
    └── artwork_images

site_pages

news_items
```

## Relaciones

- Una colección tiene muchas obras.
- Una obra pertenece a una colección.
- Una obra puede tener varias imágenes.
- Una imagen principal puede actuar como cover de obra.
- Una colección puede tener una imagen de portada.
- Las páginas generales se guardarán como `site_pages`.
- Las noticias, premios, entrevistas, exposiciones y eventos se guardarán como `news_items`.

## Entidades

### `collections`

Representa las colecciones confirmadas de la web antigua:

- BARCELONA
- BROOKLIN BRIDGE
- DISTOPÍA
- DIVERTIMENTOS
- JARDÍN DE INVIERNO
- MONOCROMÍAS
- MONOLITOS
- NEOLENGUA
- OBRA RECIENTE
- RETORN AL JARDÍ D’HIVERN
- UT PICTURA POESIS

### `artworks`

Representa una obra individual. Todavía no se han cargado obras en mock porque falta validar la relación entre imágenes, XML y colecciones.

### `artwork_images`

Representa imágenes asociadas a obras. Una obra podrá tener varias imágenes y una de ellas podrá marcarse como principal.

### `site_pages`

Representa páginas generales: Inicio, Obra, Fotografía, Noticias, Trayectoria y Contacto.

### `news_items`

Representa noticias, premios, entrevistas, publicaciones, apariciones en TV y eventos.

Formato estándar validado en frontend:

- `slug` y `title` como identificadores editoriales.
- `published_at` para orden automático de más reciente a más antigua.
- `date_text` para mostrar rangos o fechas aproximadas.
- `category` para filtrar o agrupar.
- `location`, `description`, `external_url`.
- `image_url` e `image_alt` para portada de la card.
- `news_item_images` para galerías de una o varias imágenes por noticia.
- `sort_order` como desempate manual.

## Decisiones pendientes

- Confirmar si `Fotografía` necesita modelo propio o puede ser `site_pages`.
- Confirmar si `OBRA RECIENTE` será colección estática o sección dinámica.
- Decidir si `news_items.image_url` y `news_item_images.image_url` apuntarán a bucket propio de noticias o a assets ya migrados.
- Validar slugs antes de crear migraciones reales.
