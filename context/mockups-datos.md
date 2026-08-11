# Mockups de datos

> Documento histórico. La interfaz activa ya usa `src/data/currentSiteData.json`, `contentService.ts` y la serie real de obra sobre papel. El estado actual está en `estado-actual.md`.

## Fuente en el momento de creación

Los primeros datos mock procedían de la estructura detectada en la web antigua y del menú de colecciones confirmado. Ya no son la fuente primaria de la aplicación.

## Colecciones mock

Archivo: `src/data/mockCollections.ts`.

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

Todas están con `isPublished: false` y `source: "legacy-wordpress"` porque faltan validación editorial, imágenes de portada y obras asociadas.

## Páginas mock

Archivo: `src/data/mockPages.ts`.

- Inicio
- Obra
- Fotografía
- Noticias
- Trayectoria
- Contacto

Todas contienen `TODO: contenido pendiente de validar desde WordPress.`.

## Obras

Archivo: `src/data/mockArtworks.ts`.

Todavía no se han cargado obras individuales porque falta validar la relación entre imágenes, XML y colecciones.

## Noticias

Archivo: `src/data/mockNews.ts`.

Se han normalizado 11 noticias desde la página legacy de Noticias. Cada noticia usa este formato base:

- `id`, `slug`, `title`
- `publishedAt`: fecha ISO para ordenar de más reciente a más antigua.
- `dateText`: fecha visible para el usuario.
- `category`: `exposicion`, `premio`, `entrevista`, `publicacion`, `evento` o `television`.
- `location`, `description`
- `externalUrl`: enlace de la noticia o recurso asociado.
- `imageUrl`, `imageAlt`: portada de la noticia.
- `images`: galería opcional con una o varias imágenes asociadas.
- `sortOrder`, `isPublished`

## Capa de acceso

Archivo: `src/services/contentService.ts`.

El frontend actual consume `currentSiteData.json` a través de `contentService.ts`. Los mocks se mantienen solo como antecedente y como base de algunos formatos auxiliares, como la normalización de noticias. En el futuro el servicio podrá sustituirse por consultas a Supabase sin reescribir componentes.

## Futuro paso a Supabase

El objetivo es que los mocks actuales sirvan como base para poblar Supabase cuando el modelo esté validado.
