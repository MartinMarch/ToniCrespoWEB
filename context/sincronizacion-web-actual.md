# Sincronizacion con la web actual

Fecha de trabajo inicial: 2026-08-07.

> Este documento explica la extracción y sincronización de contenido. El diseño actual de la interfaz y las rutas de Lienzos/Láminas evolucionaron después; consultar `estado-actual.md` y `diseno-interfaz.md` para el estado vigente.

## Objetivo realizado

Se reconstruyo el frontend local para que `npm run dev` muestre una version similar a la web WordPress actual de Toni Crespo, usando contenido e imagenes reales de:

- `https://www.tonicrespo.com/obra/`
- paginas de coleccion enlazadas desde `/obra/`
- API publica de WordPress (`/wp-json/wp/v2/pages`, `/wp-json/wp/v2/media`)
- HTML publico renderizado de galerias NextGEN

El XML legacy local sigue siendo referencia historica, pero la fuente activa del frontend paso a ser la web actual.

## Archivos clave

- `scripts/sync-current-site.mjs`: script nuevo que sincroniza contenido desde WordPress actual.
- `src/data/currentSiteData.json`: dataset generado y consumido por React.
- `src/services/contentService.ts`: capa central de acceso al dataset actual.
- `src/types/currentSite.ts`: tipos del dataset sincronizado.
- `media-images/wp-content/gallery/`: imagenes NextGEN descargadas desde la web actual.
- `src/styles/global.css`: CSS ajustado para acercarse al tema WordPress actual.

## Comandos

Ejecutar app:

```bash
npm run dev
```

Regenerar dataset desde la web actual:

```bash
npm run sync:current
```

Validacion:

```bash
npm run lint
npm run build
```

El script `sync:current` relaja la verificacion TLS dentro del proceso porque este entorno devolvio `SELF_SIGNED_CERT_IN_CHAIN`.

## Dataset generado

Resumen actual:

- 11 colecciones.
- 196 imagenes/obras de coleccion.
- 7 imagenes de fotografia.
- 4 paginas generales sincronizadas: Inicio, Noticias, Trayectoria, Contacto.

Conteo por coleccion:

| Coleccion | Slug local | Imagenes |
|---|---:|---:|
| OBRA RECIENTE | `obra-reciente` | 5 |
| RETORN AL JARDÍ D’HIVERN | `retorn-al-jardi-dhivern` | 16 |
| UT PICTURA POESIS | `ut-pictura-poesis` | 30 |
| NEOLENGUA | `neolengua` | 20 |
| DISTOPÍA | `distopia` | 20 |
| JARDÍN DE INVIERNO | `jardin-de-invierno` | 32 |
| DIVERTIMENTOS | `divertimentos` | 11 |
| BROOKLIN BRIDGE | `brooklin-bridge` | 17 |
| BARCELONA | `barcelona` | 41 |
| MONOLITOS | `monolitos` | 4 |
| MONOCROMÍAS | `monocromias` | 0 |

Nota importante: `MONOCROMÍAS` aparece con portada en `/obra/`, pero su pagina actual `https://www.tonicrespo.com/obra-monocromias/` renderiza el texto `no se han encontrado imágenes`. Se ha respetado ese estado.

## Imagenes

El script descarga imagenes actuales que no estaban en el repositorio local, especialmente galerias NextGEN:

```txt
media-images/wp-content/gallery/
```

Tamano aproximado tras la sincronizacion: 282 MB.

Vite sirve `media-images` directamente desde la raiz del workspace con rutas como:

```txt
/media-images/2025/03/...
/media-images/wp-content/gallery/...
```

No se dejo symlink en `public/` para evitar que el build copie cientos de MB dentro de `dist/`.

## Rutas vigentes

Rutas principales locales:

- `/`
- `/obra`
- `/lienzos`
- `/lienzos/:collectionSlug`
- `/laminas`
- `/laminas/:collectionSlug`
- `/obra/:collectionSlug`
- `/fotografia`
- `/noticias`
- `/trayectoria`

El contenido sincronizado de Contacto se conserva como fuente de datos, pero la ruta visible se eliminó: los datos de contacto están en el footer.

Tambien se añadieron alias para rutas legacy planas de WordPress:

- `/obra-reciente`
- `/retorn-al-jardi-dhivern`
- `/obra-ut-pictura-poesis`
- `/neolengua`
- `/obra-distopia`
- `/jardin-de-invierno`
- `/divertimentos`
- `/obra-brooklin-bridge`
- `/barcelona-3`
- `/monolitos`
- `/obra-monocromias`
- `/noticias-2`

## Extraccion

El script usa dos metodos:

1. Bloques WordPress (`wp-block-image`, `figcaption`, parrafos cercanos) para paginas recientes como `OBRA RECIENTE`, `RETORN AL JARDÍ D’HIVERN`, Noticias, Trayectoria y Contacto.
2. HTML renderizado de NextGEN (`data-src`, `data-title`, `data-description`) para galerias antiguas como Barcelona, Distopia, Jardin de Invierno, Divertimentos, Brooklin Bridge, Neolengua, Ut Pictura Poesis y Fotografia.

Para imagenes de bloques WordPress, intenta resolver el original desde `wp-image-ID` y la API de medios. Para galerias NextGEN, descarga directamente desde `wp-content/gallery`.

## Uso actual del contenido sincronizado

El frontend activo ya no utiliza la composición original de WordPress:

- `/obra` dirige a Lienzos y Láminas.
- `/lienzos` y `/laminas` organizan el catálogo por soporte.
- `/obra/:slug` mantiene la vista de las colecciones sincronizadas completas.
- `/fotografia` muestra una galería vertical a pantalla limpia.
- `/noticias` utiliza el contenido normalizado, tarjetas horizontales, búsqueda y galerías de imágenes.
- `/trayectoria` combina el texto sincronizado con fotografías del autor locales.
- El contacto queda concentrado en el footer.

La interfaz actual usa la tipografía Platypi, fondo blanco a gris crema, logo SVG y navegación editorial. Ver `diseno-interfaz.md` para la especificación visual completa.

## Validacion realizada

Comandos ejecutados correctamente:

```bash
npm run lint
npm run build
```

Servidor dev comprobado en:

```txt
http://localhost:5178/
```

Rutas comprobadas con Chrome headless:

- `/obra`
- `/obra/barcelona`
- `/noticias`
- `/fotografia`

Tambien se comprobaron HTTP 200 para imagenes locales en:

- `/media-images/2017/07/Paisaje-8.jpg`
- `/media-images/wp-content/gallery/barcelona-1/140-D.jpg`

## Pendientes conocidos

- Revisar editorialmente titulos extraidos desde filenames en galerias NextGEN.
- Decidir si `MONOCROMÍAS` debe recuperar imagenes legacy o mantener el estado actual sin imagenes.
- Decidir si se quiere mantener doble ruta (`/obra/:slug` y ruta plana legacy) a largo plazo.
- El dataset actual es JSON local; Supabase sigue pendiente.
- No se han creado migraciones reales ni se han subido imagenes a Supabase Storage.
