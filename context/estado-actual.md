# Estado actual del proyecto

Actualizado: 2026-08-11.

## Objetivo vigente

Reconstruir la web de Toni Crespo como una aplicación React actual, visualmente orientada a un portfolio de artista, manteniendo el contenido e imágenes de la web pública como base. La página de entrada presenta dos recorridos: `Lienzos` y `Láminas`.

La aplicación local debe arrancar con:

```bash
npm install
npm run dev
```

Validación técnica:

```bash
npm run lint
npm run build
```

El último `lint` y `build` se completaron correctamente. Vite requiere Node `20.19+` o `22.12+` para iniciar el servidor de desarrollo; con el entorno actual `18.19.1` el build termina, pero `npm run dev` no arranca.

## Stack y fuentes de datos

- Vite, React, TypeScript y React Router.
- CSS global en `src/styles/global.css`.
- Capa editorial activa: `src/app/editableContent.tsx` y `src/services/editableContentService.ts`.
- Supabase Database y Supabase Storage son la única fuente de páginas, colecciones, obras, noticias, fotografías y fondos de Ambientes.
- La aplicación necesita `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Sin ellas no existe fallback local de contenido.
- Las copias locales se generan con `npm run backup:supabase` en `supabase/backups/`; están ignoradas por Git y se validan con `npm run verify:supabase-backup -- --latest`.

No existen ya `media-images/`, el XML de WordPress, los datasets/mock locales ni scripts de sincronización o migración de contenido. Los documentos que los mencionan en esta carpeta son inventario histórico, no instrucciones de ejecución.

## Rutas implementadas

| Ruta | Estado | Contenido |
| --- | --- | --- |
| `/` | Activa | Entrada con Lienzos, Láminas y texto de presentación. |
| `/obra` | Activa | Entrada a los dos soportes. |
| `/lienzos` | Activa | Colecciones con obras cuyo soporte contiene `lienzo`. |
| `/lienzos/:collectionSlug` | Activa | Obras de una colección de lienzos. |
| `/laminas` | Activa | Colección de obra sobre papel. |
| `/laminas/:collectionSlug` | Activa | Obras de la colección de láminas. |
| `/obra/:collectionSlug` | Activa | Vista general de las colecciones sincronizadas. |
| `/fotografia` | Activa | Galería vertical de fotografía. |
| `/noticias` y `/noticias-2` | Activas | Noticias, búsqueda, galerías y enlaces externos. |
| `/trayectoria` | Activa | Texto de trayectoria y fotografías del autor. |

La página de contacto se eliminó de la navegación y de las rutas principales: email, teléfono e Instagram están en el footer.

## Funcionalidad terminada

### Navegación y estructura

- Logo SVG de Toni Crespo en header y footer: `src/assets/toni_crespo_logo_vector.svg`.
- Header blanco, sticky y con animación de ocultación al bajar y reaparecer al subir.
- Navegación: Obra, Fotografía, Noticias y Trayectoria.
- Enlaces de Instagram y WhatsApp en el lado derecho del header con hover de relleno de color, sin etiquetas flotantes.
- Botón azul de correo junto a Instagram y WhatsApp. Abre un formulario que envía mediante una Supabase Edge Function; en cada obra, el botón de interés abre un selector de WhatsApp, Instagram DM o correo con el mensaje de la obra preparado.
- Botón circular de Ajustes junto a Instagram y WhatsApp, con panel desplegable para idioma, tema claro/oscuro y acceso de edición web.
- Idiomas disponibles: español, inglés, alemán y catalán. La interfaz y los textos editoriales de Inicio, Trayectoria y Noticias se traducen al cambiar idioma. Los textos creados en modo edición se almacenan por idioma en Supabase; las versiones heredadas siguen usando el diccionario del frontend mientras no se editen.
- Modo claro actual conservado y modo oscuro añadido con fondo negro/gris, superficies oscuras y persistencia local de preferencia.
- Modo edición conectado a Supabase: login con usuario creado en Supabase Auth, permiso validado contra `admin_users` y acciones contextuales. En Trayectoria hay cambio de portada, editor visual multilingüe y gestión de galería; Noticias permite alta y borrado; Fotografía permite alta directa y borrado; Lienzos/Láminas permiten crear, editar y borrar colecciones, además de añadir o borrar obras dentro de ellas.
- Loaders añadidos para carga inicial de contenido y carga de imágenes en tarjetas, galerías, obra, noticias, fotografía, trayectoria y ambientes.
- Footer con marca, navegación secundaria, email, teléfono, Instagram y copyright.
- Fondo global desde blanco hasta gris crema, sin barra de scroll visible.

### Inicio y obra

- Inicio con dos accesos grandes y responsivos: `Lienzos` y `Láminas`.
- En escritorio se muestran en dos columnas; en móvil se apilan.
- El hover amplía sutilmente las imágenes de ambos accesos.
- La vista de soporte muestra primero sus colecciones y cada colección usa breadcrumb para volver a Obra o al soporte correspondiente.
- En el detalle de cada obra se muestra imagen, título, técnica, dimensiones, contacto por WhatsApp y acceso a Ambientes.
- La imagen de una obra se abre a pantalla completa y, en escritorio, dispone de lupa rectangular controlada por el puntero.

### Fotografía, noticias y trayectoria

- Fotografía: título centrado, imágenes en una sola columna y pantalla completa de imagen al seleccionarla.
- Noticias: tarjetas horizontales apiladas, búsqueda local, galería de imágenes cuando existe más de una y enlace `Visitar aquí` cuando la noticia lo incluye.
- Trayectoria: título, foto principal `autor2.jpg`, texto sincronizado y las fotos secundarias `autor1.jpg` y `autor3.jpg` debajo.

## Datos disponibles

- 12 colecciones en Supabase, incluyendo la serie de láminas.
- 206 obras en Supabase.
- 7 imágenes en Fotografía en Supabase.
- 11 noticias en Supabase.
- 4 páginas en Supabase: Inicio, Noticias, Trayectoria y Contacto. El contenido de Contacto se conserva aunque no tenga ruta visible.
- 10 lienzos confirmados por texto de soporte.
- 10 obras sobre papel usadas como láminas en la colección `Serie 1`.

La clasificación de lienzos y láminas está explicada en [lienzos-laminas.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/lienzos-laminas.md). La información tabular completa de obras está en [obras.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/obras.md).

## Ambientes de obra

El modal de Ambientes se ha sustituido por un sistema dinámico: cada obra se sitúa sobre una pared vacía según su proporción y dimensiones, no dentro de un marco fijo predefinido. Hay tres escenas compatibles para cada intervalo de tamaño, para no mostrar una lámina de 30 cm en una escena pensada para un díptico grande. El modal mantiene navegación con flechas, teclado, scroll horizontal y paginación.

Fondos activos:

- Hasta 65 cm: `small-print-wall-v3.jpg`, `small-print-cabinet-v1.jpg` y `small-print-bedroom-bench-v1.jpg`.
- De 66 a 160 cm: `medium-canvas-wall-v2.jpg`, `medium-canvas-sofa-v1.jpg` y `medium-canvas-sideboard-v1.jpg`.
- De 160 a 260 cm: `wide-diptych-wall-v2.jpg`, `wide-diptych-limestone-bench-v1.jpg` y `wide-diptych-oak-bench-v1.jpg`.

Los fondos se generaron con `imagegen` integrado como interiores frontales de pared vacía. Cada uno incluye un plano de pared virtual en centímetros que se usa para calcular el tamaño de la obra. Se comprueba el ratio de la obra y, cuando las dimensiones históricas están invertidas respecto a la foto, se usa la orientación que coincide con el archivo real. Las láminas se detectan por su soporte de papel y se muestran con passepartout.

Los fondos activos están en el bucket público `site-assets`, bajo `legacy/mockups/generated/`, y la interfaz los carga directamente desde Supabase Storage.

Importante: la escala actual está calibrada de forma interna por centímetros virtuales e intervalos de tamaño, pero no está certificada contra muebles o paredes reales de las imágenes generadas. Para una escala arquitectónica verificable será necesario partir de escenarios con una medida física conocida o de plantillas PSD/3D con escala definida. Ver [mockup-backgrounds.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/mockup-backgrounds.md).

## Pendientes reales

1. Validar editorialmente nombres, técnicas y dimensiones extraídas de las galerías antiguas.
2. Ejecutar `supabase/migrations/20260811110000_contextual_editing.sql` en el proyecto remoto antes de usar las nuevas acciones de edición.
3. Crear externamente el usuario Auth admin e insertar su email en `admin_users`.
4. Decidir si se mantienen las rutas legacy a largo plazo.
5. Confirmar el nombre comercial de `Láminas` frente a `Obra sobre papel`.
6. Decidir si MONOCROMÍAS debe mantener el estado sin imágenes o recuperar obra heredada.
7. Si se requiere realismo de escala en Ambientes, crear escenas calibradas con medidas conocidas.
8. Validar editorialmente los formularios de edición con Toni antes de permitir edición destructiva o borrados.

## Documentación relacionada

- [context.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/context.md): índice de la documentación.
- [diseno-interfaz.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/diseno-interfaz.md): decisiones visuales y responsive.
- [frontend-architecture.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/frontend-architecture.md): estructura del frontend.
- [../supabase/README.md](/home/martinmarch/Repositorios/ToniCrespoWEB/supabase/README.md): migraciones, validación y copias de seguridad operativas.
- [sincronizacion-web-actual.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/sincronizacion-web-actual.md): antecedente histórico, sin script ejecutable.
- [tareas-pendientes.md](/home/martinmarch/Repositorios/ToniCrespoWEB/context/tareas-pendientes.md): backlog actualizado.
