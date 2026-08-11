# Tareas pendientes

Actualizado: 2026-08-11.

## Contenido y catálogo

- [ ] Validar títulos, técnicas y dimensiones derivadas de filenames o galerías NextGEN.
- [ ] Confirmar si `BROOKLIN BRIDGE` mantiene esa grafía o debe corregirse.
- [ ] Confirmar si `MONOCROMÍAS` permanece sin imágenes o se recupera desde el archivo histórico.
- [ ] Confirmar si `OBRA RECIENTE` debe ser colección estática o sección dinámica.
- [ ] Confirmar el nombre comercial de la serie sobre papel: `Láminas`, `Obra sobre papel` u otro.
- [ ] Confirmar la inclusión y metadatos de `Nº X` en la serie de láminas.
- [ ] Revisar todas las noticias antes de que el cliente pueda editar o publicar contenido desde una base de datos.

## Ambientes

- [x] Regenerar nueve fondos activos de `media-images/mockups/generated/` por intervalos de tamaño y plano de pared virtual.
- [ ] Si se necesita equivalencia real de centímetros, sustituir los fondos generados por escenarios con medida física conocida o por plantillas PSD/3D calibradas.
- [ ] Medir una referencia por escenario, por ejemplo ancho de banco o altura de pared, y guardar el factor píxeles/cm.
- [ ] Revisar con Toni qué marco o canto corresponde a cada tipo de obra antes de fijarlo como regla editorial.

## Datos y base de datos

- [ ] Crear usuario admin en Supabase Auth e insertar su email en `admin_users`.
- [ ] Ejecutar `20260811110000_contextual_editing.sql` para activar las traducciones persistidas del modo edición contextual.
- [ ] Validar editorialmente en Supabase las tablas `collections`, `artworks`, `site_pages`, `photography_items` y `news_items`.
- [ ] Añadir un campo estructurado de soporte (`lienzo`, `papel`, etc.) en lugar de inferirlo desde texto.
- [ ] Decidir la estructura de colecciones y disponibilidad comercial de láminas.

## Operación y publicación

- [ ] Migrar el entorno a Node `20.19+` o `22.12+` para eliminar la advertencia de Vite.
- [ ] Definir despliegue y cómo publicar `media-images/`, que actualmente queda fuera de Git por tamaño.
- [ ] Decidir si las rutas legacy se mantienen por SEO tras el lanzamiento.

## Completado

- [x] Sincronizar catálogo e imágenes de la web pública actual.
- [x] Crear la entrada Lienzos/Láminas y sus colecciones navegables.
- [x] Crear detalle editorial de obra con metadatos y contacto por WhatsApp.
- [x] Crear lightbox de obra con lupa para escritorio.
- [x] Añadir Fotos, Noticias, Trayectoria y footer con información de contacto.
- [x] Incorporar logo SVG, header con redes y comportamiento al scroll.
- [x] Añadir panel de ajustes en header con idioma de interfaz, modo claro/oscuro y acceso a edición web.
- [x] Implementar primera versión de edición web con login admin, formularios Supabase y lectura combinada local+Supabase.
- [x] Sustituir el panel lateral por edición contextual de Trayectoria, Noticias, Fotografía, Lienzos y Láminas.
- [x] Implementar Ambientes con carrusel, fondos locales y adaptación dinámica de ratio.
- [x] Migrar contenido e imágenes a Supabase, incluyendo 10 assets de Ambientes en `site-assets`.
- [x] Añadir loaders para carga de contenido remoto e imágenes.
- [x] Añadir traducciones editoriales de Inicio, Trayectoria y Noticias para inglés, alemán y catalán.
- [x] Comprobar `npm run lint` y `npm run build`.
