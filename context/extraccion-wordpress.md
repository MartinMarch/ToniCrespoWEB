# Extracción de obras del WordPress original

Método reconstruido el 9 de septiembre de 2026. Es independiente del frontend y no usa Supabase ni credenciales de administración.

## Qué se conserva y qué falta

Los documentos históricos mencionan `scripts/sync-current-site.mjs`, `analyze:legacy`, `src/data/currentSiteData.json`, `media-images/` y `tonicrespo.WordPress.2026-06-30.xml`. Esos archivos se eliminaron antes de incorporarse el proyecto al historial Git accesible; no se pueden recuperar desde sus commits actuales. Los comandos antiguos ya no existen.

Sí se conserva `context/obras.md`: inventario de la extracción del 7 de agosto de 2026, con 196 referencias de obra, además de fotografías documentales en una sección separada. El nuevo exportador contrasta las obras por colección y URL original contra ese inventario.

## Ejecutar

Requisitos: dependencias npm del proyecto y Chromium de Playwright. No hace falta arrancar React.

```bash
npm ci
npx playwright install chromium
npm run test:wordpress-export
npm run export:wordpress
```

Se crea una carpeta nueva bajo `exports/`, ignorada por Git. Para elegir otra carpeta nueva:

```bash
npm run export:wordpress -- --output exports/mi-extraccion-wordpress
```

Una carpeta existente provoca un error: nunca se sobrescribe una extracción. Si hay un proxy corporativo con certificados propios, configura la CA mediante `NODE_EXTRA_CA_CERTS`; no desactives la verificación TLS.

## Contenido de la carpeta

- `index.html`: catálogo visual local, sin JavaScript ni servicios externos.
- `colecciones/`: imágenes, una ficha TXT y una ficha JSON por obra; metadatos de la colección y aviso de galería vacía cuando corresponde.
- `catalogo.csv`: índice para Excel/LibreOffice, UTF-8 con BOM y separador punto y coma.
- `catalogo.json`: todos los registros estructurados.
- `informe.json` y `LEEME.txt`: alcance, recuentos, incidencias y referencias históricas no encontradas.
- `fuentes/`: respuestas públicas de WordPress, HTML de las galerías y copia del inventario previo, para conservar la procedencia y poder revisar la extracción.

La API de páginas públicas se pagina completamente y se contrasta su total. Las colecciones se identifican mediante los enlaces del índice `/obra/` y los nombres del inventario histórico. Se recorre la paginación NextGEN encontrada. El HTML se analiza en un documento inerte, sin ejecutar scripts del sitio ni cargar recursos externos en el navegador de análisis.

En la comprobación del 9 de septiembre de 2026, `/wp-json/wp/v2/media` anunció 322 registros pero devolvió solo 152 al recorrer sus cuatro páginas. Por eso no se usa ese listado como prueba de integridad ni como fuente única: se consulta directamente cada ID de medio referenciado por las obras.

Las imágenes de bloques WordPress se vinculan a la API de medios por su `wp-image-ID`. Se intenta descargar `original_image` cuando está publicado; si falla se conserva el original público de la API o la imagen mostrada, registrando cada intento. En NextGEN se usa `data-src`, no la miniatura. No se vinculan obras y medios por nombres parecidos ni se reescalan imágenes.

Todas las imágenes descargadas se decodifican con Chromium, se registran sus píxeles y su SHA-256. Se conservan las repeticiones entre colecciones y se informa del número de imágenes distintas por contenido. Un fallo de extracción, descarga o una referencia histórica ausente deja un informe parcial y código de salida 1.

## Límites importantes

Esta es una extracción del catálogo **público**, no un respaldo completo de WordPress. No permite garantizar la recuperación de obras borradas, privadas o antiguas que ya no estén accesibles. La biblioteca de medios también contiene miniaturas, noticias y fotografías; sus archivos no se consideran obras por el mero hecho de estar subidos.

Muchos títulos de NextGEN son nombres de archivo y no incluyen descripción o técnica. Se conservan los datos originales y se señalan para revisión; no se inventa la información que falta. Los píxeles de una imagen no equivalen a las medidas físicas del cuadro.

El antiguo inventario XML registra 290 objetos NextGEN, pero no demuestra que sean 290 obras públicas distintas. Para recuperar la totalidad histórica hace falta el XML original y, preferentemente, una copia de la base de datos de WordPress con las tablas de NextGEN, junto con `wp-content/uploads/` y `wp-content/gallery/`. Un XML sin las imágenes no garantiza recuperar archivos que ya hayan desaparecido del servidor.

No se modifica WordPress, la nueva web ni Supabase. Este proceso no hace commit, push ni despliegue.
